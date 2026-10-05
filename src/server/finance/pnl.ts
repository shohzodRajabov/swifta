import "server-only";
import type { TaxRegime } from "@prisma/client";
import { db } from "@/lib/db";
import { add, sub, zero, type Amount } from "@/lib/metrics";
import { hourlyCost } from "@/lib/payroll";
import { netOf } from "@/lib/vat";

/**
 * Company profit & loss for a period (management accounting).
 * Revenue = signed acts; direct costs = approved expenses, issued materials, approved labour sessions,
 * idle/travel days charged to projects, verified contractor work, turnover tax, service tickets (labour, other, parts
 * not charged to a project); service revenue = ticket charges + contracts spread evenly over their months;
 * overhead = approved overhead.
 * Values are net of VAT for legal entities under the general regime.
 */
export type PnlRow = {
  revenue: Amount;
  direct: Amount;
  gross: Amount;
  overhead: Amount;
  operating: Amount;
  profitTax: Amount;
  net: Amount;
};

export type PnlResult = {
  entities: { id: string; name: string; regime: TaxRegime; row: PnlRow }[];
  total: PnlRow;
  months: { month: string; revenue: number; direct: number; overhead: number; net: number }[];
  directByCategory: Record<string, Amount>;
};

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function computePnl(companyId: string, from: Date | null, to: Date | null): Promise<PnlResult> {
  const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  const [company, entities, acts, expenses, issued, sessions, idle, outsource, overheads, tickets, serviceParts, contracts] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId } }),
    db.legalEntity.findMany({ where: { companyId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    db.act.findMany({
      where: { project: { companyId }, status: "SIGNED", date: range },
      select: { date: true, amountUzs: true, amountUsd: true, vatRate: true, project: { select: { legalEntityId: true } } },
    }),
    db.expense.findMany({
      where: { project: { companyId }, approval: "APPROVED", date: range },
      select: { date: true, category: true, amountUzs: true, amountUsd: true, vatRate: true, project: { select: { legalEntityId: true } } },
    }),
    db.stockMovement.findMany({
      where: { companyId, type: { in: ["ISSUE", "RETURN"] }, projectId: { not: null }, date: range },
      select: {
        date: true,
        type: true,
        qty: true,
        unitCostUzs: true,
        unitCostUsd: true,
        unitCostNetUzs: true,
        unitCostNetUsd: true,
        project: { select: { legalEntityId: true } },
        product: { select: { category: { select: { kind: true } } } },
      },
    }),
    db.workSession.findMany({
      where: { companyId, status: "APPROVED", date: range },
      select: { date: true, laborCostUzs: true, laborCostUsd: true, project: { select: { legalEntityId: true } } },
    }),
    db.attendanceDay.findMany({
      where: { companyId, projectId: { not: null }, type: { in: ["WORKSHOP", "TRAVEL", "OFFICE", "IDLE_MATERIAL", "IDLE_CLIENT", "IDLE_OTHER"] }, date: range },
      select: { date: true, employee: { select: { salary: true, normDays: true } }, project: { select: { legalEntityId: true } } },
    }),
    db.taskAssignment.findMany({
      where: { kind: "CONTRACTOR", outsourceStatus: "VERIFIED", task: { companyId }, verifiedAt: range },
      select: {
        verifiedAt: true,
        actualUzs: true,
        actualUsd: true,
        agreedUzs: true,
        agreedUsd: true,
        vatRate: true,
        contractor: { select: { kind: true } },
        task: { select: { project: { select: { legalEntityId: true } } } },
      },
    }),
    db.overheadExpense.findMany({
      where: { companyId, approval: "APPROVED", date: range },
      select: { date: true, amountUzs: true, amountUsd: true, vatRate: true, legalEntityId: true },
    }),
    // Service: resolved tickets (labour / other costs, charges) and parts not charged to a project.
    db.serviceTicket.findMany({
      where: { companyId, status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: range },
      select: { resolvedAt: true, laborCostUzs: true, otherCostUzs: true, chargeUzs: true, project: { select: { legalEntityId: true } } },
    }),
    db.stockMovement.findMany({
      where: { companyId, type: "ISSUE", projectId: null, serviceTicketId: { not: null }, date: range },
      select: { date: true, qty: true, unitCostUzs: true, unitCostUsd: true },
    }),
    db.serviceContract.findMany({
      where: { companyId, status: { not: "CANCELLED" } },
      select: { startDate: true, endDate: true, amountUzs: true, amountUsd: true, vatRate: true, project: { select: { legalEntityId: true } } },
    }),
  ]);

  const defaultEntity = entities.find((e) => e.isDefault) ?? entities[0];
  const entityOf = (id: string | null | undefined) => entities.find((e) => e.id === id) ?? defaultEntity;
  const rows = new Map<string, PnlRow>();
  const blank = (): PnlRow => ({ revenue: zero(), direct: zero(), gross: zero(), overhead: zero(), operating: zero(), profitTax: zero(), net: zero() });
  for (const e of entities) rows.set(e.id, blank());
  const months = new Map<string, { revenue: number; direct: number; overhead: number }>();
  const month = (d: Date) => {
    const k = d.toISOString().slice(0, 7);
    if (!months.has(k)) months.set(k, { revenue: 0, direct: 0, overhead: 0 });
    return months.get(k)!;
  };
  const directByCategory: Record<string, Amount> = {};
  const addDirect = (entityId: string | null | undefined, date: Date, cat: string, a: Amount) => {
    const e = entityOf(entityId);
    if (!e) return;
    const r = rows.get(e.id)!;
    r.direct = add(r.direct, a);
    month(date).direct += a.uzs;
    directByCategory[cat] = add(directByCategory[cat] ?? zero(), a);
  };
  const valued = (entityId: string | null | undefined, uzs: unknown, usd: unknown, vat: unknown): Amount => {
    const general = entityOf(entityId)?.taxRegime === "GENERAL";
    return general
      ? { uzs: netOf(n(uzs), n(vat)), usd: netOf(n(usd), n(vat)), count: 1 }
      : { uzs: n(uzs), usd: n(usd), count: 1 };
  };

  for (const a of acts) {
    const e = entityOf(a.project.legalEntityId);
    if (!e) continue;
    const v = valued(e.id, a.amountUzs, a.amountUsd, a.vatRate);
    rows.get(e.id)!.revenue = add(rows.get(e.id)!.revenue, v);
    month(a.date).revenue += v.uzs;
    if (e.taxRegime === "TURNOVER" && n(e.turnoverTaxRate) > 0) {
      const k = n(e.turnoverTaxRate) / 100;
      addDirect(e.id, a.date, "TAX", { uzs: n(a.amountUzs) * k, usd: n(a.amountUsd) * k, count: 1 });
    }
  }
  for (const x of expenses) addDirect(x.project.legalEntityId, x.date, x.category, valued(x.project.legalEntityId, x.amountUzs, x.amountUsd, x.vatRate));
  for (const m of issued) {
    const general = entityOf(m.project?.legalEntityId)?.taxRegime === "GENERAL";
    const q = n(m.qty) * (m.type === "RETURN" ? -1 : 1);
    const cat = m.product?.category.kind === "EQUIPMENT" ? "EQUIPMENT" : "MATERIAL";
    addDirect(m.project?.legalEntityId, m.date, cat, {
      uzs: q * n(general ? m.unitCostNetUzs : m.unitCostUzs),
      usd: q * n(general ? m.unitCostNetUsd : m.unitCostUsd),
      count: 1,
    });
  }
  for (const s of sessions) addDirect(s.project.legalEntityId, s.date, "LABOR", { uzs: n(s.laborCostUzs), usd: n(s.laborCostUsd), count: 1 });
  for (const d of idle) {
    const day = hourlyCost(company, d.employee) * n(company.normHoursPerDay);
    addDirect(d.project?.legalEntityId, d.date, "LABOR", { uzs: day, usd: 0, count: 1 });
  }
  for (const o of outsource) {
    const entityId = o.task.project.legalEntityId;
    const cat = o.contractor?.kind === "COMPANY" ? "SUBCONTRACTOR" : "OUTSOURCING";
    addDirect(entityId, o.verifiedAt ?? new Date(), cat, valued(entityId, o.actualUzs ?? o.agreedUzs, o.actualUsd ?? o.agreedUsd, o.vatRate));
  }
  // ---- service ----
  const addRevenue = (entityId: string | null | undefined, date: Date, a: Amount) => {
    const e = entityOf(entityId);
    if (!e) return;
    rows.get(e.id)!.revenue = add(rows.get(e.id)!.revenue, a);
    month(date).revenue += a.uzs;
  };
  for (const x of tickets) {
    const at = x.resolvedAt ?? new Date();
    const cost = n(x.laborCostUzs) + n(x.otherCostUzs);
    if (cost) addDirect(x.project?.legalEntityId, at, "SERVICE", { uzs: cost, usd: 0, count: 1 });
    if (n(x.chargeUzs)) addRevenue(x.project?.legalEntityId, at, { uzs: n(x.chargeUzs), usd: 0, count: 1 });
  }
  for (const m of serviceParts) addDirect(null, m.date, "SERVICE", { uzs: n(m.qty) * n(m.unitCostUzs), usd: n(m.qty) * n(m.unitCostUsd), count: 1 });
  // Service contracts are recognised evenly over their months (within the period).
  for (const c of contracts) {
    const months: Date[] = [];
    for (let d = new Date(Date.UTC(c.startDate.getUTCFullYear(), c.startDate.getUTCMonth(), 1)); d <= c.endDate; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d);
    if (months.length === 0) continue;
    const per = valued(c.project?.legalEntityId, n(c.amountUzs) / months.length, n(c.amountUsd) / months.length, c.vatRate);
    for (const d of months) {
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      if ((from && end < from) || (to && d > to) || d > new Date()) continue;
      addRevenue(c.project?.legalEntityId, d, per);
    }
  }

  for (const o of overheads) {
    const e = entityOf(o.legalEntityId);
    if (!e) continue;
    const v = valued(e.id, o.amountUzs, o.amountUsd, o.vatRate);
    rows.get(e.id)!.overhead = add(rows.get(e.id)!.overhead, v);
    month(o.date).overhead += v.uzs;
  }

  const total = blank();
  const out: PnlResult["entities"] = [];
  for (const e of entities) {
    const r = rows.get(e.id)!;
    r.gross = sub(r.revenue, r.direct);
    r.operating = sub(r.gross, r.overhead);
    const rate = e.taxRegime === "GENERAL" ? n(e.profitTaxRate) / 100 : 0;
    r.profitTax = r.operating.uzs > 0 ? { uzs: r.operating.uzs * rate, usd: r.operating.usd * rate, count: 1 } : zero();
    r.net = sub(r.operating, r.profitTax);
    for (const k of Object.keys(total) as (keyof PnlRow)[]) total[k] = add(total[k], r[k]);
    out.push({ id: e.id, name: e.name, regime: e.taxRegime, row: r });
  }

  return {
    entities: out,
    total,
    months: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, v]) => ({ month: m, ...v, net: v.revenue - v.direct - v.overhead })),
    directByCategory,
  };
}
