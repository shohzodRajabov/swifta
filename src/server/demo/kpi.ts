import type { DemoCtx } from "./generate";
import { calculatePeriod } from "@/server/kpi/compute";
import { DEFAULT_KPI_RULES } from "@/lib/kpi";

/**
 * KPI demo: the employee formula has two versions (v2 puts more weight on quality from two months ago) and
 * the last months are calculated; older ones approved, the latest still open for review.
 */
export async function seedKpi(ctx: DemoCtx) {
  const { db, companyId: cid, today } = ctx;
  const month = (back: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1)).toISOString().slice(0, 7);
  const v2From = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
  const v1 = await db.kpiRule.findFirst({ where: { companyId: cid, subject: "EMPLOYEE", version: 1 } });
  if (v1) {
    await db.kpiRule.update({ where: { id: v1.id }, data: { status: "ARCHIVED", effectiveTo: new Date(v2From.getTime() - 86400000) } });
    await db.kpiRule.create({
      data: {
        companyId: cid,
        subject: "EMPLOYEE",
        name: "Xodim KPI (sifatga urg'u)",
        version: 2,
        effectiveFrom: v2From,
        status: "ACTIVE",
        createdById: ctx.users.director,
        components: DEFAULT_KPI_RULES.EMPLOYEE.components.map((c) =>
          c.key === "quantity" ? { ...c, weight: 30 } : c.key === "firstPass" ? { ...c, weight: 20 } : c,
        ),
      },
    });
  }
  for (const back of [4, 3, 2, 1]) {
    for (const subject of ["EMPLOYEE", "GROUP", "CONTRACTOR"] as const) {
      const p = await calculatePeriod(db, cid, subject, month(back));
      if (p && back > 1) await db.kpiPeriod.update({ where: { id: p.id }, data: { status: "APPROVED", approvedById: ctx.users.director, approvedAt: new Date() } });
    }
  }
}
