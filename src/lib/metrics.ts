import "server-only";
import { Prisma, type CostCategory, type Project } from "@prisma/client";
import { db } from "./db";
import { toDateOnly } from "./utils";

/** A money total in both currencies. USD is the sum of per-record USD values (each at its own rate). */
export type Amount = { uzs: number; usd: number; count: number };

const zero = (): Amount => ({ uzs: 0, usd: 0, count: 0 });
const add = (a: Amount, b: Amount): Amount => ({ uzs: a.uzs + b.uzs, usd: a.usd + b.usd, count: a.count + b.count });
const sub = (a: Amount, b: Amount): Amount => ({ uzs: a.uzs - b.uzs, usd: a.usd - b.usd, count: a.count + b.count });
const n = (d: Prisma.Decimal | null | undefined) => (d ? Number(d) : 0);

export const COST_CATEGORIES: CostCategory[] = [
  "EQUIPMENT",
  "MATERIAL",
  "LABOR",
  "SUBCONTRACTOR",
  "TRANSPORT",
  "TOOLS",
  "HOTEL",
  "CUSTOMS",
  "INSTALLATION",
  "OTHER",
];

export type ProjectMetrics = {
  contract: Amount & { rate: number; fxDate: Date; source: string; currency: string; original: number };
  plannedCost: Amount;
  committedCost: Amount; // purchase orders placed for the project
  actualCost: Amount;
  received: Amount;
  scheduled: Amount;
  plannedProfit: Amount;
  expectedProfit: Amount;
  cashProfit: Amount;
  plannedMargin: number | null;
  expectedMargin: number | null;
  clientDebt: Amount;
  overdueDebt: Amount;
  byCategory: Record<CostCategory, { plan: Amount; actual: Amount }>;
  delayed: boolean;
  overBudget: boolean;
  marginDrop: boolean;
};

type ProjectLite = Pick<
  Project,
  | "id"
  | "stage"
  | "status"
  | "plannedEndDate"
  | "contractAmount"
  | "contractCurrency"
  | "contractAmountUzs"
  | "contractAmountUsd"
  | "contractFxRate"
  | "contractFxDate"
  | "contractFxSource"
>;

const MARGIN_DROP_THRESHOLD = 5; // percentage points

export async function computeMetrics(projects: ProjectLite[]): Promise<Map<string, ProjectMetrics>> {
  const ids = projects.map((p) => p.id);
  const today = toDateOnly(new Date());

  const [bom, budget, expenses, payments, milestones, orders, issued] = await Promise.all([
    db.bomItem.groupBy({
      by: ["projectId", "kind"],
      where: { projectId: { in: ids } },
      _sum: { plannedCostUzs: true, plannedCostUsd: true },
      _count: true,
    }),
    db.budgetLine.groupBy({
      by: ["projectId", "category"],
      where: { projectId: { in: ids } },
      _sum: { amountUzs: true, amountUsd: true },
      _count: true,
    }),
    db.expense.groupBy({
      by: ["projectId", "category"],
      where: { projectId: { in: ids } },
      _sum: { amountUzs: true, amountUsd: true },
      _count: true,
    }),
    db.clientPayment.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids } },
      _sum: { amountUzs: true, amountUsd: true },
      _count: true,
    }),
    db.paymentMilestone.findMany({
      where: { projectId: { in: ids } },
      select: { projectId: true, dueDate: true, amountUzs: true, amountUsd: true },
    }),
    db.purchaseOrder.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, status: { in: ["ORDERED", "PARTIAL", "RECEIVED"] } },
      _sum: { totalUzs: true, totalUsd: true },
      _count: true,
    }),
    // Materials issued to (minus returned from) a project are its actual material cost.
    db.stockMovement.findMany({
      where: { projectId: { in: ids }, type: { in: ["ISSUE", "RETURN"] } },
      select: {
        projectId: true,
        type: true,
        qty: true,
        unitCostUzs: true,
        unitCostUsd: true,
        product: { select: { category: { select: { kind: true } } } },
        bomItem: { select: { kind: true } },
      },
    }),
  ]);

  const result = new Map<string, ProjectMetrics>();

  for (const p of projects) {
    const byCategory = Object.fromEntries(
      COST_CATEGORIES.map((c) => [c, { plan: zero(), actual: zero() }]),
    ) as ProjectMetrics["byCategory"];

    for (const row of bom.filter((r) => r.projectId === p.id)) {
      const cat: CostCategory = row.kind === "EQUIPMENT" ? "EQUIPMENT" : "MATERIAL";
      byCategory[cat].plan = add(byCategory[cat].plan, {
        uzs: n(row._sum.plannedCostUzs),
        usd: n(row._sum.plannedCostUsd),
        count: row._count,
      });
    }
    for (const row of budget.filter((r) => r.projectId === p.id)) {
      byCategory[row.category].plan = add(byCategory[row.category].plan, {
        uzs: n(row._sum.amountUzs),
        usd: n(row._sum.amountUsd),
        count: row._count,
      });
    }
    for (const row of expenses.filter((r) => r.projectId === p.id)) {
      byCategory[row.category].actual = add(byCategory[row.category].actual, {
        uzs: n(row._sum.amountUzs),
        usd: n(row._sum.amountUsd),
        count: row._count,
      });
    }

    for (const mv of issued.filter((r) => r.projectId === p.id)) {
      const kind = mv.product?.category.kind ?? mv.bomItem?.kind ?? "MATERIAL";
      const cat: CostCategory = kind === "EQUIPMENT" ? "EQUIPMENT" : "MATERIAL";
      const sign = mv.type === "RETURN" ? -1 : 1;
      const q = Number(mv.qty) * sign;
      byCategory[cat].actual = add(byCategory[cat].actual, {
        uzs: q * Number(mv.unitCostUzs),
        usd: q * Number(mv.unitCostUsd),
        count: 1,
      });
    }

    const po = orders.find((r) => r.projectId === p.id);
    const committedCost: Amount = { uzs: n(po?._sum.totalUzs), usd: n(po?._sum.totalUsd), count: po?._count ?? 0 };

    let plannedCost = zero();
    let actualCost = zero();
    let expectedCost = zero();
    for (const c of COST_CATEGORIES) {
      const { plan, actual } = byCategory[c];
      plannedCost = add(plannedCost, plan);
      actualCost = add(actualCost, actual);
      expectedCost = add(expectedCost, actual.uzs > plan.uzs ? actual : plan);
    }

    const pay = payments.find((r) => r.projectId === p.id);
    const received: Amount = {
      uzs: n(pay?._sum.amountUzs),
      usd: n(pay?._sum.amountUsd),
      count: pay?._count ?? 0,
    };

    const ms = milestones.filter((m) => m.projectId === p.id);
    const scheduled = ms.reduce((acc, m) => add(acc, { uzs: n(m.amountUzs), usd: n(m.amountUsd), count: 1 }), zero());
    const dueSoFar = ms
      .filter((m) => m.dueDate && m.dueDate < today)
      .reduce((acc, m) => add(acc, { uzs: n(m.amountUzs), usd: n(m.amountUsd), count: 1 }), zero());

    const contract = {
      uzs: n(p.contractAmountUzs),
      usd: n(p.contractAmountUsd),
      count: 1,
      rate: n(p.contractFxRate),
      fxDate: p.contractFxDate,
      source: p.contractFxSource,
      currency: p.contractCurrency,
      original: n(p.contractAmount),
    };

    const plannedProfit = sub(contract, plannedCost);
    const expectedProfit = sub(contract, expectedCost);
    const cashProfit = sub(received, actualCost);
    const plannedMargin = contract.uzs > 0 ? (plannedProfit.uzs / contract.uzs) * 100 : null;
    const expectedMargin = contract.uzs > 0 ? (expectedProfit.uzs / contract.uzs) * 100 : null;

    const clientDebt = sub(contract, received);
    const overdueRaw = sub(dueSoFar, received);
    const overdueDebt = overdueRaw.uzs > 0 ? overdueRaw : zero();

    const open = p.status === "ACTIVE" && p.stage !== "COMPLETED";

    result.set(p.id, {
      contract,
      plannedCost,
      committedCost,
      actualCost,
      received,
      scheduled,
      plannedProfit,
      expectedProfit,
      cashProfit,
      plannedMargin,
      expectedMargin,
      clientDebt: clientDebt.uzs > 0 ? clientDebt : zero(),
      overdueDebt,
      byCategory,
      delayed: open && !!p.plannedEndDate && p.plannedEndDate < today,
      overBudget: plannedCost.uzs > 0 && actualCost.uzs > plannedCost.uzs,
      marginDrop:
        plannedMargin !== null &&
        expectedMargin !== null &&
        plannedMargin - expectedMargin > MARGIN_DROP_THRESHOLD,
    });
  }

  return result;
}

export function sumAmounts(values: Amount[]): Amount {
  return values.reduce(add, zero());
}
