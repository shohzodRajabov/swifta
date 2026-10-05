import "server-only";
import { Prisma, type CostCategory, type StatusGroupCode, type TaxRegime } from "@prisma/client";
import { db } from "./db";
import { toDateOnly } from "./utils";
import { FINISHED_GROUPS } from "./statuses";
import { hourlyCost } from "./payroll";

/** A money total in both currencies. USD is the sum of per-record USD values (each at its own rate). */
export type Amount = { uzs: number; usd: number; count: number };

export const zero = (): Amount => ({ uzs: 0, usd: 0, count: 0 });
export const add = (a: Amount, b: Amount): Amount => ({ uzs: a.uzs + b.uzs, usd: a.usd + b.usd, count: a.count + b.count });
export const sub = (a: Amount, b: Amount): Amount => ({ uzs: a.uzs - b.uzs, usd: a.usd - b.usd, count: a.count + b.count });
const maxOf = (a: Amount, b: Amount): Amount => (b.uzs > a.uzs ? b : a);
const clamp0 = (a: Amount): Amount => (a.uzs > 0 ? a : zero());
const n = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));

/** gross -> value used for profit: net of VAT under the general regime, gross otherwise. */
function valued(regime: TaxRegime, uzs: number, usd: number, vatRate: number, count = 1): Amount {
  if (regime === "GENERAL" && vatRate > 0) {
    const k = 100 / (100 + vatRate);
    return { uzs: uzs * k, usd: usd * k, count };
  }
  return { uzs, usd, count };
}

export const COST_CATEGORIES: CostCategory[] = [
  "EQUIPMENT",
  "MATERIAL",
  "LABOR",
  "OUTSOURCING",
  "SUBCONTRACTOR",
  "TRANSPORT",
  "WAREHOUSE",
  "TOOLS",
  "HOTEL",
  "CUSTOMS",
  "INSTALLATION",
  "TAX",
  "OTHER",
];

/** Categories the user can plan / spend on directly (TAX is computed). */
export const MANUAL_COST_CATEGORIES = COST_CATEGORIES.filter((c) => c !== "TAX");

export type CategoryValues = { plan: Amount; committed: Amount; forecast: Amount; actual: Amount };

export type ProjectMetrics = {
  regime: TaxRegime;
  groupCode: StatusGroupCode | null;
  /** Contract incl. amendments, gross (as signed); `contract` keeps the original fx details for display. */
  contract: Amount & { rate: number; fxDate: Date; source: string; currency: string; original: number };
  contractTotalGross: Amount;
  amendments: Amount;
  revenue: { plan: Amount; forecast: Amount; actual: Amount };
  /** Money received from the customer (gross, cash). */
  received: Amount;
  /** Signed acts (gross) minus payments received (never negative). */
  receivable: Amount;
  /** Payments received beyond signed acts: an advance — work we still owe the customer (contract liability). */
  advance: Amount;
  /** USD contracts (M10): payments valued at their actual rates minus the same USD at the contract rate (UZS; + = gain). */
  fxDiff: number | null;
  /** Payment-schedule instalments past due and not yet paid. */
  overdueDebt: Amount;
  scheduled: Amount;
  actsGross: Amount;
  cost: CategoryValues;
  byCategory: Record<CostCategory, CategoryValues>;
  profit: { plan: Amount; forecast: Amount; actual: Amount };
  margin: { plan: number | null; forecast: number | null; actual: number | null };
  delayed: boolean;
  overBudget: boolean;
  marginDrop: boolean;
  finished: boolean;
};

type ProjectLite = {
  id: string;
  status: string;
  plannedEndDate: Date | null;
  contractAmount: Prisma.Decimal;
  contractCurrency: string;
  contractAmountUzs: Prisma.Decimal;
  contractAmountUsd: Prisma.Decimal;
  contractFxRate: Prisma.Decimal;
  contractFxDate: Date;
  contractFxSource: string;
  contractVatRate: Prisma.Decimal;
};

const MARGIN_DROP_THRESHOLD = 5; // percentage points
const ACTIVE_PO = ["ORDERED", "PARTIAL", "RECEIVED"] as const;
const IDLE_TYPES = ["WORKSHOP", "TRAVEL", "OFFICE", "IDLE_MATERIAL", "IDLE_CLIENT", "IDLE_OTHER"] as const;

export async function computeMetrics(projects: ProjectLite[]): Promise<Map<string, ProjectMetrics>> {
  const ids = projects.map((p) => p.id);
  const result = new Map<string, ProjectMetrics>();
  if (ids.length === 0) return result;
  const today = toDateOnly(new Date());

  const [
    meta,
    amendments,
    acts,
    bom,
    budget,
    expenses,
    payments,
    milestones,
    issued,
    poLines,
    sessions,
    idleDays,
    outsource,
  ] = await Promise.all([
    db.project.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        company: { select: { normWorkDays: true, normHoursPerDay: true, salaryInputMode: true, incomeTaxRate: true, socialTaxRate: true } },
        legalEntity: { select: { taxRegime: true, turnoverTaxRate: true } },
        statusDef: { select: { group: { select: { code: true } } } },
      },
    }),
    db.contractAmendment.findMany({
      where: { projectId: { in: ids } },
      select: { projectId: true, amountUzs: true, amountUsd: true, vatRate: true },
    }),
    db.act.findMany({
      where: { projectId: { in: ids }, status: "SIGNED" },
      select: { projectId: true, amountUzs: true, amountUsd: true, vatRate: true },
    }),
    db.bomItem.findMany({
      where: { projectId: { in: ids } },
      select: { projectId: true, kind: true, plannedCostUzs: true, plannedCostUsd: true, vatRate: true },
    }),
    db.budgetLine.findMany({
      where: { projectId: { in: ids } },
      select: { projectId: true, category: true, amountUzs: true, amountUsd: true, vatRate: true },
    }),
    db.expense.findMany({
      where: { projectId: { in: ids }, approval: "APPROVED" },
      select: { projectId: true, category: true, amountUzs: true, amountUsd: true, vatRate: true },
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
    db.stockMovement.findMany({
      where: { projectId: { in: ids }, type: { in: ["ISSUE", "RETURN"] } },
      select: {
        projectId: true,
        type: true,
        qty: true,
        unitCostUzs: true,
        unitCostUsd: true,
        unitCostNetUzs: true,
        unitCostNetUsd: true,
        product: { select: { category: { select: { kind: true } } } },
        bomItem: { select: { kind: true } },
      },
    }),
    db.purchaseOrderLine.findMany({
      where: { order: { projectId: { in: ids }, status: { in: [...ACTIVE_PO] } } },
      select: {
        amountUzs: true,
        amountUsd: true,
        order: { select: { projectId: true, vatRate: true } },
        product: { select: { category: { select: { kind: true } } } },
        bomItem: { select: { kind: true } },
      },
    }),
    db.workSession.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, status: "APPROVED" },
      _sum: { laborCostUzs: true, laborCostUsd: true },
      _count: true,
    }),
    db.attendanceDay.findMany({
      where: { projectId: { in: ids }, type: { in: [...IDLE_TYPES] } },
      select: { projectId: true, date: true, employee: { select: { salary: true, normDays: true } } },
    }),
    db.taskAssignment.findMany({
      where: { kind: "CONTRACTOR", task: { projectId: { in: ids } }, outsourceStatus: { notIn: ["CANCELLED", "REJECTED"] } },
      select: {
        agreedUzs: true,
        agreedUsd: true,
        actualUzs: true,
        actualUsd: true,
        vatRate: true,
        outsourceStatus: true,
        fxRate: true,
        contractor: { select: { kind: true } },
        task: { select: { projectId: true } },
      },
    }),
  ]);

  for (const p of projects) {
    const m = meta.find((x) => x.id === p.id);
    const regime: TaxRegime = m?.legalEntity?.taxRegime ?? "GENERAL";
    const turnoverRate = n(m?.legalEntity?.turnoverTaxRate);
    const groupCode = m?.statusDef?.group.code ?? null;
    const company = m?.company;

    const byCategory = Object.fromEntries(
      COST_CATEGORIES.map((c) => [c, { plan: zero(), committed: zero(), forecast: zero(), actual: zero() }]),
    ) as Record<CostCategory, CategoryValues>;
    const committedTotal = Object.fromEntries(COST_CATEGORIES.map((c) => [c, zero()])) as Record<CostCategory, Amount>;

    // ---- revenue ----
    const contractVat = n(p.contractVatRate);
    const contractGross: Amount = { uzs: n(p.contractAmountUzs), usd: n(p.contractAmountUsd), count: 1 };
    let amendGross = zero();
    let revenuePlan = valued(regime, contractGross.uzs, contractGross.usd, contractVat);
    for (const a of amendments.filter((x) => x.projectId === p.id)) {
      amendGross = add(amendGross, { uzs: n(a.amountUzs), usd: n(a.amountUsd), count: 1 });
      revenuePlan = add(revenuePlan, valued(regime, n(a.amountUzs), n(a.amountUsd), n(a.vatRate)));
    }
    let actsGross = zero();
    let revenueActual = zero();
    for (const a of acts.filter((x) => x.projectId === p.id)) {
      actsGross = add(actsGross, { uzs: n(a.amountUzs), usd: n(a.amountUsd), count: 1 });
      revenueActual = add(revenueActual, valued(regime, n(a.amountUzs), n(a.amountUsd), n(a.vatRate)));
    }
    const contractTotalGross = add(contractGross, amendGross);

    // ---- plan ----
    for (const b of bom.filter((x) => x.projectId === p.id)) {
      const cat: CostCategory = b.kind === "EQUIPMENT" ? "EQUIPMENT" : "MATERIAL";
      byCategory[cat].plan = add(byCategory[cat].plan, valued(regime, n(b.plannedCostUzs), n(b.plannedCostUsd), n(b.vatRate)));
    }
    for (const b of budget.filter((x) => x.projectId === p.id)) {
      byCategory[b.category].plan = add(byCategory[b.category].plan, valued(regime, n(b.amountUzs), n(b.amountUsd), n(b.vatRate)));
    }

    // ---- actual: approved expenses ----
    for (const e of expenses.filter((x) => x.projectId === p.id)) {
      byCategory[e.category].actual = add(byCategory[e.category].actual, valued(regime, n(e.amountUzs), n(e.amountUsd), n(e.vatRate)));
    }
    // ---- actual: materials issued to the project ----
    for (const mv of issued.filter((x) => x.projectId === p.id)) {
      const kind = mv.product?.category.kind ?? mv.bomItem?.kind ?? "MATERIAL";
      const cat: CostCategory = kind === "EQUIPMENT" ? "EQUIPMENT" : "MATERIAL";
      const q = Number(mv.qty) * (mv.type === "RETURN" ? -1 : 1);
      const net = regime === "GENERAL";
      byCategory[cat].actual = add(byCategory[cat].actual, {
        uzs: q * n(net ? mv.unitCostNetUzs : mv.unitCostUzs),
        usd: q * n(net ? mv.unitCostNetUsd : mv.unitCostUsd),
        count: 1,
      });
    }
    // ---- commitments: purchase orders ----
    for (const l of poLines.filter((x) => x.order.projectId === p.id)) {
      const kind = l.product?.category.kind ?? l.bomItem?.kind ?? "MATERIAL";
      const cat: CostCategory = kind === "EQUIPMENT" ? "EQUIPMENT" : "MATERIAL";
      committedTotal[cat] = add(committedTotal[cat], valued(regime, n(l.amountUzs), n(l.amountUsd), n(l.order.vatRate)));
    }
    // ---- actual: internal labour (approved work sessions + idle/travel days charged to the project) ----
    const s = sessions.find((x) => x.projectId === p.id);
    if (s) {
      byCategory.LABOR.actual = add(byCategory.LABOR.actual, {
        uzs: n(s._sum.laborCostUzs),
        usd: n(s._sum.laborCostUsd),
        count: s._count,
      });
    }
    if (company) {
      for (const d of idleDays.filter((x) => x.projectId === p.id)) {
        const perHour = hourlyCost(company, d.employee);
        const dayCost = perHour * n(company.normHoursPerDay);
        const rate = n(p.contractFxRate) || 1;
        byCategory.LABOR.actual = add(byCategory.LABOR.actual, { uzs: dayCost, usd: dayCost / rate, count: 1 });
      }
    }
    // ---- outsourcing / subcontractors ----
    for (const o of outsource.filter((x) => x.task.projectId === p.id)) {
      const cat: CostCategory = o.contractor?.kind === "COMPANY" ? "SUBCONTRACTOR" : "OUTSOURCING";
      if (o.agreedUzs) committedTotal[cat] = add(committedTotal[cat], valued(regime, n(o.agreedUzs), n(o.agreedUsd), n(o.vatRate)));
      if (o.outsourceStatus === "VERIFIED" && o.actualUzs) {
        byCategory[cat].actual = add(byCategory[cat].actual, valued(regime, n(o.actualUzs), n(o.actualUsd), n(o.vatRate)));
      }
    }
    // ---- turnover tax ----
    if (regime === "TURNOVER" && turnoverRate > 0) {
      const k = turnoverRate / 100;
      byCategory.TAX.plan = { uzs: contractTotalGross.uzs * k, usd: contractTotalGross.usd * k, count: 1 };
      byCategory.TAX.actual = { uzs: actsGross.uzs * k, usd: actsGross.usd * k, count: actsGross.count };
    }

    // ---- forecast = max(plan, actual + open commitments) per category ----
    const cost: CategoryValues = { plan: zero(), committed: zero(), forecast: zero(), actual: zero() };
    for (const c of COST_CATEGORIES) {
      const v = byCategory[c];
      v.committed = clamp0(sub(committedTotal[c], v.actual));
      v.forecast = maxOf(v.plan, add(v.actual, v.committed));
      cost.plan = add(cost.plan, v.plan);
      cost.committed = add(cost.committed, v.committed);
      cost.forecast = add(cost.forecast, v.forecast);
      cost.actual = add(cost.actual, v.actual);
    }

    // ---- cash & receivables ----
    const pay = payments.find((r) => r.projectId === p.id);
    const received: Amount = { uzs: n(pay?._sum.amountUzs), usd: n(pay?._sum.amountUsd), count: pay?._count ?? 0 };
    const ms = milestones.filter((x) => x.projectId === p.id);
    const scheduled = ms.reduce((acc, x) => add(acc, { uzs: n(x.amountUzs), usd: n(x.amountUsd), count: 1 }), zero());
    const dueSoFar = ms
      .filter((x) => x.dueDate && x.dueDate < today)
      .reduce((acc, x) => add(acc, { uzs: n(x.amountUzs), usd: n(x.amountUsd), count: 1 }), zero());

    const revenue = { plan: revenuePlan, forecast: revenuePlan, actual: revenueActual };
    const profit = {
      plan: sub(revenue.plan, cost.plan),
      forecast: sub(revenue.forecast, cost.forecast),
      actual: sub(revenue.actual, cost.actual),
    };
    const pct = (num: Amount, den: Amount) => (den.uzs > 0 ? (num.uzs / den.uzs) * 100 : null);
    const margin = {
      plan: pct(profit.plan, revenue.plan),
      forecast: pct(profit.forecast, revenue.forecast),
      actual: pct(profit.actual, revenue.actual),
    };
    const finished = !!groupCode && FINISHED_GROUPS.includes(groupCode);
    const open = p.status === "ACTIVE" && !finished;

    result.set(p.id, {
      regime,
      groupCode,
      contract: {
        ...contractGross,
        rate: n(p.contractFxRate),
        fxDate: p.contractFxDate,
        source: p.contractFxSource,
        currency: p.contractCurrency,
        original: n(p.contractAmount),
      },
      contractTotalGross,
      amendments: amendGross,
      revenue,
      received,
      receivable: clamp0(sub(actsGross, received)),
      advance: clamp0(sub(received, actsGross)),
      fxDiff: p.contractCurrency === "USD" && received.count > 0 ? received.uzs - received.usd * n(p.contractFxRate) : null,
      overdueDebt: clamp0(sub(dueSoFar, received)),
      scheduled,
      actsGross,
      cost,
      byCategory,
      profit,
      margin,
      delayed: open && !!p.plannedEndDate && p.plannedEndDate < today,
      overBudget: cost.plan.uzs > 0 && cost.actual.uzs > cost.plan.uzs,
      marginDrop: margin.plan !== null && margin.forecast !== null && margin.plan - margin.forecast > MARGIN_DROP_THRESHOLD,
      finished,
    });
  }

  return result;
}

export function sumAmounts(values: Amount[]): Amount {
  return values.reduce(add, zero());
}
