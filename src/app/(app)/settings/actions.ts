"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, formObject, runAction, zNumber, zOptText, zText, type ActionState } from "@/lib/action";
import { normalizePhone } from "@/lib/phone";
import { DEFAULT_RATING_WEIGHTS, DEFAULT_RELIABILITY_WEIGHTS, normalizeWeights } from "@/lib/contractor-score";

/** Contractor score weights from the form ({prefix}{component}); invalid values fall back to defaults. */
function weightsFrom<K extends string>(formData: FormData, prefix: string, defaults: Record<K, number>) {
  const raw: Record<string, number> = {};
  for (const k of Object.keys(defaults)) {
    const v = String(formData.get(prefix + k) ?? "").trim().replace(",", ".");
    raw[k] = v === "" ? NaN : Number(v);
  }
  return normalizeWeights(raw, defaults);
}

const zRate = zNumber.pipe(z.number().min(0).max(100));

export async function updateCompanySettings(_: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("settings.manage", async (user) => {
    const d = z
      .object({
        name: zText,
        normWorkDays: zNumber.pipe(z.number().int().min(1).max(31)),
        normHoursPerDay: zNumber.pipe(z.number().min(1).max(24)),
        salaryInputMode: z.enum(["NET", "GROSS"]),
        incomeTaxRate: zRate,
        socialTaxRate: zRate,
        approvalThresholdUzs: zNumber.pipe(z.number().min(0)),
        overuseThreshold: zRate,
        defaultContribution: z.enum(["EQUAL", "LEADER", "RULE", "EFFICIENCY"]),
        weightLeader: zNumber.pipe(z.number().min(0).max(10)),
        weightSenior: zNumber.pipe(z.number().min(0).max(10)),
        weightWorker: zNumber.pipe(z.number().min(0).max(10)),
        efficiencyMinSessions: zNumber.pipe(z.number().int().min(1).max(100)),
        overtimeMultiplier: zNumber.pipe(z.number().min(1).max(5)),
        maxDailyHours: zNumber.pipe(z.number().int().min(4).max(24)),
        contractorPhoneRequired: z.preprocess((v) => v === "on", z.boolean()),
      })
      .parse({ contractorPhoneRequired: formData.get("contractorPhoneRequired") ?? "", ...formObject(formData) });
    const before = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
    await db.$transaction(async (tx) => {
      const after = await tx.company.update({
        where: { id: user.companyId },
        data: {
          name: d.name,
          normWorkDays: d.normWorkDays,
          normHoursPerDay: new Prisma.Decimal(d.normHoursPerDay),
          salaryInputMode: d.salaryInputMode,
          incomeTaxRate: new Prisma.Decimal(d.incomeTaxRate),
          socialTaxRate: new Prisma.Decimal(d.socialTaxRate),
          approvalThresholdUzs: new Prisma.Decimal(d.approvalThresholdUzs),
          overuseThreshold: new Prisma.Decimal(d.overuseThreshold),
          defaultContribution: d.defaultContribution,
          contributionWeights: { LEADER: d.weightLeader, SENIOR: d.weightSenior, WORKER: d.weightWorker },
          efficiencyMinSessions: d.efficiencyMinSessions,
          overtimeMultiplier: new Prisma.Decimal(d.overtimeMultiplier),
          maxDailyHours: d.maxDailyHours,
          contractorPhoneRequired: d.contractorPhoneRequired,
          contractorRatingConfig: weightsFrom(formData, "rw_", DEFAULT_RATING_WEIGHTS),
          contractorReliabilityConfig: weightsFrom(formData, "lw_", DEFAULT_RELIABILITY_WEIGHTS),
        },
      });
      const strip = (c: typeof before) => ({ ...c, telegramBotToken: c.telegramBotToken ? "***" : null });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "Company", user.companyId, "update", strip(before), strip(after));
    });
  });
  if (res?.ok) revalidatePath("/settings/company");
  return res;
}

// ---- legal entities ---------------------------------------------------------

const entitySchema = z.object({
  name: zText,
  tin: zOptText,
  address: zOptText,
  bankDetails: zOptText,
  director: zOptText,
  phone: zOptText,
  taxRegime: z.enum(["GENERAL", "TURNOVER"]),
  vatRate: zRate,
  turnoverTaxRate: zRate,
  profitTaxRate: zRate,
  isDefault: z.preprocess((v) => v === "on", z.boolean()),
  active: z.preprocess((v) => v === "on", z.boolean()),
});

export async function saveLegalEntity(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("settings.manage", async (user) => {
    const d = entitySchema.parse({
      isDefault: formData.get("isDefault") ?? "",
      active: id ? (formData.get("active") ?? "") : "on",
      ...formObject(formData),
    });
    const data = {
      ...d,
      phone: d.phone ? (normalizePhone(d.phone) ?? d.phone) : null,
      vatRate: new Prisma.Decimal(d.vatRate),
      turnoverTaxRate: new Prisma.Decimal(d.turnoverTaxRate),
      profitTaxRate: new Prisma.Decimal(d.profitTaxRate),
    };
    const ctx = { companyId: user.companyId, userId: user.id };
    await db.$transaction(async (tx) => {
      if (d.isDefault) await tx.legalEntity.updateMany({ where: { companyId: user.companyId }, data: { isDefault: false } });
      if (id) {
        const before = await tx.legalEntity.findFirst({ where: { id, companyId: user.companyId } });
        if (!before) fail("invalid");
        const after = await tx.legalEntity.update({ where: { id }, data });
        await audit(tx, ctx, "LegalEntity", id, "update", before, after);
      } else {
        const e = await tx.legalEntity.create({ data: { ...data, companyId: user.companyId } });
        await audit(tx, ctx, "LegalEntity", e.id, "create", null, e);
      }
      // Always keep one default entity.
      if ((await tx.legalEntity.count({ where: { companyId: user.companyId, isDefault: true } })) === 0) {
        const first = await tx.legalEntity.findFirst({ where: { companyId: user.companyId, active: true }, orderBy: { createdAt: "asc" } });
        if (first) await tx.legalEntity.update({ where: { id: first.id }, data: { isDefault: true } });
      }
    });
  });
  if (res?.ok) revalidatePath("/settings/firms");
  return res;
}

// ---- statuses ---------------------------------------------------------------

const DOCS = [
  "CONTRACT", "SIGNED_CONTRACT", "ADDITIONAL_AGREEMENT", "COMMERCIAL_OFFER", "TECH_SPEC", "PROJECT_FILES", "DRAWING",
  "SPECIFICATION", "SMETA", "INVOICE", "PURCHASE_ORDER", "WAYBILL", "ACT", "COMPLETION_ACT", "HIDDEN_WORKS_ACT",
  "TEST_ACT", "PAYMENT_PROOF", "FINAL_DOCS", "WARRANTY", "PASSPORT", "CERTIFICATE", "PHOTO", "CORRESPONDENCE",
  "SERVICE_REPORT", "CONTRACTOR_DOC", "OTHER",
] as const;

export async function updateStatusGroup(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("settings.manage", async (user) => {
    const d = z.object({ name: zText, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).parse(formObject(formData));
    const before = await db.statusGroup.findFirst({ where: { id, companyId: user.companyId } });
    if (!before) fail("invalid");
    await db.$transaction(async (tx) => {
      const after = await tx.statusGroup.update({ where: { id }, data: d });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "StatusGroup", id, "update", before, after);
    });
  });
  if (res?.ok) revalidatePath("/settings/statuses");
  return res;
}

export async function saveStatus(groupId: string, id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("settings.manage", async (user) => {
    const group = await db.statusGroup.findFirst({ where: { id: groupId, companyId: user.companyId } });
    if (!group) fail("invalid");
    const d = z
      .object({
        code: zText.pipe(z.string().max(8)),
        name: zText,
        sortOrder: zNumber.pipe(z.number().int()),
        active: z.preprocess((v) => v === "on", z.boolean()),
      })
      .parse({ active: id ? (formData.get("active") ?? "") : "on", ...formObject(formData) });
    const requiredDocs = formData.getAll("requiredDocs").map(String).filter((c): c is (typeof DOCS)[number] => (DOCS as readonly string[]).includes(c));
    const ctx = { companyId: user.companyId, userId: user.id };
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.statusDef.findFirst({ where: { id, groupId } });
        if (!before) fail("invalid");
        const after = await tx.statusDef.update({ where: { id }, data: { ...d, requiredDocs } });
        await audit(tx, ctx, "StatusDef", id, "update", before, after);
      } else {
        const s = await tx.statusDef.create({ data: { ...d, requiredDocs, groupId } });
        await audit(tx, ctx, "StatusDef", s.id, "create", null, s);
      }
    });
  });
  if (res?.ok) revalidatePath("/settings/statuses");
  return res;
}

export async function deleteStatus(formData: FormData) {
  const id = String(formData.get("id"));
  await runAction("settings.manage", async (user) => {
    const s = await db.statusDef.findFirst({
      where: { id, group: { companyId: user.companyId } },
      include: { _count: { select: { projects: true, events: true } } },
    });
    if (!s) fail("invalid");
    // Statuses in use are deactivated instead of deleted, so history stays intact.
    await db.$transaction(async (tx) => {
      if (s._count.projects > 0 || s._count.events > 0) {
        await tx.statusDef.update({ where: { id }, data: { active: false } });
        await audit(tx, { companyId: user.companyId, userId: user.id }, "StatusDef", id, "update", { active: true }, { active: false });
      } else {
        await tx.statusDef.delete({ where: { id } });
        await audit(tx, { companyId: user.companyId, userId: user.id }, "StatusDef", id, "delete", s, null);
      }
    });
  });
  revalidatePath("/settings/statuses");
}

// ---- work types -------------------------------------------------------------

export async function saveWorkType(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("settings.manage", async (user) => {
    const d = z
      .object({
        name: zText,
        unit: zText,
        sortOrder: zNumber.pipe(z.number().int()),
        active: z.preprocess((v) => v === "on", z.boolean()),
      })
      .parse({ active: id ? (formData.get("active") ?? "") : "on", ...formObject(formData) });
    const ctx = { companyId: user.companyId, userId: user.id };
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.workType.findFirst({ where: { id, companyId: user.companyId } });
        if (!before) fail("invalid");
        const after = await tx.workType.update({ where: { id }, data: d });
        await audit(tx, ctx, "WorkType", id, "update", before, after);
      } else {
        const w = await tx.workType.create({ data: { ...d, companyId: user.companyId } });
        await audit(tx, ctx, "WorkType", w.id, "create", null, w);
      }
    });
  });
  if (res?.ok) revalidatePath("/settings/work-types");
  return res;
}
