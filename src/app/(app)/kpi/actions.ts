"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, formObject, runAction, zDate, zText, type ActionState } from "@/lib/action";
import { bonusPct, coverage, KPI_COMPONENTS, parseBonusScale, sanitizeRule, type KpiSubjectKey, type RuleComponent, type SnapshotComponent } from "@/lib/kpi";
import { Prisma } from "@prisma/client";
import { toDateOnly } from "@/lib/utils";
import { calculatePeriod } from "@/server/kpi/compute";

const zSubject = z.enum(["EMPLOYEE", "GROUP", "CONTRACTOR"]);
const zMonth = z.string().regex(/^\d{4}-\d{2}$/);

export async function calculateKpi(_: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("kpi.manage", async (user) => {
    const d = z.object({ month: zMonth, subject: zSubject }).parse(formObject(formData));
    const existing = await db.kpiPeriod.findUnique({ where: { companyId_month_subject: { companyId: user.companyId, month: d.month, subject: d.subject } } });
    if (existing?.status === "APPROVED") fail("kpiApproved");
    const period = await calculatePeriod(db, user.companyId, d.subject, d.month);
    if (!period) fail("kpiNoRule");
    await db.$transaction((tx) => audit(tx, { companyId: user.companyId, userId: user.id }, "KpiPeriod", period.id, "update", null, { month: d.month, subject: d.subject, action: "calculate" }));
  });
  if (res?.ok) revalidatePath("/kpi");
  return res;
}

export async function setKpiPeriodStatus(formData: FormData) {
  await runAction("kpi.manage", async (user) => {
    const d = z.object({ id: zText, to: z.enum(["APPROVED", "CALCULATED"]) }).parse(formObject(formData));
    const p = await db.kpiPeriod.findFirst({ where: { id: d.id, companyId: user.companyId } });
    if (!p) fail("invalid");
    await db.$transaction(async (tx) => {
      await tx.kpiPeriod.update({
        where: { id: p.id },
        data: d.to === "APPROVED" ? { status: "APPROVED", approvedById: user.id, approvedAt: new Date() } : { status: "CALCULATED", approvedById: null, approvedAt: null },
      });
      // KPI bonus: fixed when an employee month is approved (salary × % of the reached step), cleared on reopening.
      if (p.subject === "EMPLOYEE") {
        const company = await tx.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { kpiBonusEnabled: true, kpiBonusScale: true } });
        const scale = company.kpiBonusEnabled ? parseBonusScale(company.kpiBonusScale) : [];
        const snaps = await tx.kpiSnapshot.findMany({ where: { periodId: p.id }, include: { employee: { select: { salary: true } } } });
        for (const s of snaps) {
          const pct = d.to === "APPROVED" && scale.length ? bonusPct(Number(s.score), coverage(s.components as SnapshotComponent[]), scale) : 0;
          const amount = pct ? (Number(s.employee?.salary ?? 0) * pct) / 100 : 0;
          await tx.kpiSnapshot.update({
            where: { id: s.id },
            data: pct ? { bonusPct: new Prisma.Decimal(pct), bonusUzs: new Prisma.Decimal(amount.toFixed(2)) } : { bonusPct: null, bonusUzs: null },
          });
        }
      }
      await audit(tx, { companyId: user.companyId, userId: user.id }, "KpiPeriod", p.id, "update", { status: p.status }, { status: d.to });
    });
  });
  revalidatePath("/kpi");
}

/** Save a new version of a formula. It applies from `effectiveFrom`; the previous version ends the day before. */
export async function saveKpiRule(subject: KpiSubjectKey, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("kpi.manage", async (user) => {
    const d = z.object({ name: zText, effectiveFrom: zDate }).parse(formObject(formData));
    const raw: RuleComponent[] = KPI_COMPONENTS.filter((c) => c.subjects.includes(subject)).map((c) => {
      const params: Record<string, number> = {};
      for (const p of Object.keys(c.params ?? {})) params[p] = Number(String(formData.get(`p_${c.key}_${p}`) ?? "").replace(",", "."));
      return { key: c.key, weight: Number(String(formData.get(`w_${c.key}`) ?? "0").replace(",", ".")) || 0, params };
    });
    const components = sanitizeRule(subject, raw);
    if (components.length === 0) fail("kpiEmptyRule");
    const from = toDateOnly(d.effectiveFrom);
    const dayBefore = new Date(from.getTime() - 86400000);
    await db.$transaction(async (tx) => {
      const last = await tx.kpiRule.findFirst({ where: { companyId: user.companyId, subject }, orderBy: { version: "desc" } });
      // Approved months must keep the formula they were calculated with.
      const approved = await tx.kpiPeriod.findFirst({ where: { companyId: user.companyId, subject, status: "APPROVED", month: { gte: from.toISOString().slice(0, 7) } } });
      if (approved) fail("kpiApprovedMonth", { month: approved.month });
      const current = await tx.kpiRule.findMany({ where: { companyId: user.companyId, subject, status: "ACTIVE" } });
      for (const r of current) {
        if (r.effectiveFrom >= from) fail("dateOrder");
        await tx.kpiRule.update({ where: { id: r.id }, data: { effectiveTo: dayBefore, status: "ARCHIVED" } });
      }
      const rule = await tx.kpiRule.create({
        data: { companyId: user.companyId, subject, name: d.name, version: (last?.version ?? 0) + 1, effectiveFrom: from, components, status: "ACTIVE", createdById: user.id },
      });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "KpiRule", rule.id, "create", last, rule);
    });
  });
  if (res?.ok) revalidatePath("/kpi/rules");
  return res;
}
