"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { resolveMoney } from "@/lib/fx";
import { normalizePhone } from "@/lib/phone";
import { toDateOnly } from "@/lib/utils";
import { fail, formObject, runAction, zDate, zNumber, zOptDate, zOptId, zOptNumber, zOptText, zText, zVat, type ActionState } from "@/lib/action";
import type { CurrentUser } from "@/lib/auth";
import { approvalFor } from "@/server/finance/approval";
import { accessibleProject } from "@/server/projects/access";
import { nextContractorNumber, snapshotScore } from "@/server/contractors/score";

const ctx = (u: CurrentUser) => ({ companyId: u.companyId, userId: u.id });
const zCurrency = z.enum(["UZS", "USD"]);
const list = (v: FormDataEntryValue[] | string | null) =>
  [...new Set((Array.isArray(v) ? v.map(String) : String(v ?? "").split(",")).map((x) => x.trim()).filter(Boolean))];

// ---- contractor card -------------------------------------------------------------

export async function saveContractor(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  let target = id ?? "";
  const res = await runAction("contractors.edit", async (user) => {
    const d = z
      .object({
        kind: z.enum(["INDIVIDUAL", "BRIGADE", "COMPANY"]),
        name: zText,
        phone: zOptText,
        phone2: zOptText,
        email: zOptText,
        address: zOptText,
        tin: zOptText,
        bankDetails: zOptText,
        note: zOptText,
        availability: z.enum(["AVAILABLE", "BUSY", "UNAVAILABLE", "BLACKLISTED"]),
        active: z.preprocess((v) => v === "on", z.boolean()),
      })
      .parse({ active: id ? (formData.get("active") ?? "") : "on", ...formObject(formData) });
    const company = await db.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { contractorPhoneRequired: true } });
    const phone = d.phone ? normalizePhone(d.phone) : null;
    const phone2 = d.phone2 ? normalizePhone(d.phone2) : null;
    if ((d.phone && !phone) || (d.phone2 && !phone2)) fail("phoneInvalid");
    if (company.contractorPhoneRequired && !phone) fail("contractorPhoneRequired");
    const data = {
      ...d,
      phone,
      phone2,
      specializations: list([...formData.getAll("specializations"), ...list(String(formData.get("specializationsExtra") ?? ""))]),
      regions: list(String(formData.get("regions") ?? "")),
    };
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.contractor.findFirst({ where: { id, companyId: user.companyId } });
        if (!before) fail("invalid");
        const after = await tx.contractor.update({ where: { id }, data });
        await audit(tx, ctx(user), "Contractor", id, "update", before, after);
      } else {
        const c = await tx.contractor.create({ data: { ...data, companyId: user.companyId, number: await nextContractorNumber(tx, user.companyId) } });
        await audit(tx, ctx(user), "Contractor", c.id, "create", null, c);
        target = c.id;
      }
    });
  });
  if (res?.ok) {
    revalidatePath("/contractors");
    redirect(`/contractors/${target}`);
  }
  return res;
}

export async function addContact(contractorId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("contractors.edit", async (user) => {
    const d = z.object({ name: zText, phone: zOptText, role: zOptText }).parse(formObject(formData));
    if (!(await db.contractor.findFirst({ where: { id: contractorId, companyId: user.companyId } }))) fail("invalid");
    const phone = d.phone ? normalizePhone(d.phone) : null;
    if (d.phone && !phone) fail("phoneInvalid");
    await db.contractorContact.create({ data: { contractorId, name: d.name, phone, role: d.role } });
  });
  if (res?.ok) revalidatePath(`/contractors/${contractorId}`);
  return res;
}

export async function deleteContact(formData: FormData) {
  let contractorId = "";
  await runAction("contractors.edit", async (user) => {
    const c = await db.contractorContact.findFirst({ where: { id: String(formData.get("id")), contractor: { companyId: user.companyId } } });
    if (!c) fail("invalid");
    contractorId = c.contractorId;
    await db.contractorContact.delete({ where: { id: c.id } });
  });
  if (contractorId) revalidatePath(`/contractors/${contractorId}`);
}

// ---- payments ----------------------------------------------------------------------

export async function addContractorPayment(contractorId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("contractorPayments.edit", async (user) => {
    const d = z
      .object({
        assignmentId: zOptId,
        projectId: zOptId,
        date: zDate,
        method: z.enum(["CASH", "BANK", "CARD", "OTHER"]).default("CASH"),
        reference: zOptText,
        note: zOptText,
        amount: zNumber,
        currency: zCurrency,
        rate: zOptNumber,
      })
      .parse(formObject(formData));
    if (d.amount <= 0) fail("invalid");
    const contractor = await db.contractor.findFirst({ where: { id: contractorId, companyId: user.companyId } });
    if (!contractor) fail("invalid");
    let projectId = d.projectId;
    if (d.assignmentId) {
      const a = await db.taskAssignment.findFirst({ where: { id: d.assignmentId, contractorId }, select: { task: { select: { projectId: true } } } });
      if (!a) fail("invalid");
      projectId = a.task.projectId;
    }
    if (projectId) await accessibleProject(user, projectId);
    const money = await resolveMoney({ amount: d.amount, currency: d.currency, date: d.date, manualRate: d.rate });
    const approval = await approvalFor(user, money.amountUzs);
    await db.$transaction(async (tx) => {
      const p = await tx.contractorPayment.create({
        data: {
          contractorId,
          assignmentId: d.assignmentId,
          projectId,
          date: toDateOnly(d.date),
          method: d.method,
          reference: d.reference,
          note: d.note,
          ...money,
          approval,
          approvedById: approval === "APPROVED" ? user.id : null,
          approvedAt: approval === "APPROVED" ? new Date() : null,
          createdById: user.id,
        },
      });
      await audit(tx, ctx(user), "ContractorPayment", p.id, "create", null, p);
    });
  });
  if (res?.ok) {
    revalidatePath(`/contractors/${contractorId}`);
    revalidatePath("/tasks");
  }
  return res;
}

export async function deleteContractorPayment(formData: FormData) {
  let contractorId = "";
  await runAction("contractorPayments.edit", async (user) => {
    const p = await db.contractorPayment.findFirst({ where: { id: String(formData.get("id")), contractor: { companyId: user.companyId } } });
    if (!p) fail("invalid");
    if (p.approval === "APPROVED" && !can(user, "finance.approve")) fail("forbidden");
    contractorId = p.contractorId;
    await db.$transaction(async (tx) => {
      await tx.contractorPayment.delete({ where: { id: p.id } });
      await audit(tx, ctx(user), "ContractorPayment", p.id, "delete", p, null);
    });
  });
  if (contractorId) revalidatePath(`/contractors/${contractorId}`);
}

// ---- outsource work (a task assigned to a contractor) ------------------------------------

const canManageOutsource = (u: CurrentUser) => can(u, "tasks.manage") || can(u, "contractors.edit");
const canRecordOutsource = (u: CurrentUser) => canManageOutsource(u) || can(u, "outsource.verify") || can(u, "sessions.record");

async function loadAssignment(user: CurrentUser, id: string) {
  const a = await db.taskAssignment.findFirst({
    where: { id, kind: "CONTRACTOR", task: { companyId: user.companyId } },
    include: { task: true, contractor: true },
  });
  if (!a) fail("invalid");
  await accessibleProject(user, a.task.projectId);
  return a;
}

const outsourceSchema = z.object({
  contactName: zOptText,
  contactPhone: zOptText,
  plannedQty: zOptNumber,
  plannedCostUzs: zOptNumber,
  amount: zOptNumber,
  currency: zCurrency.default("UZS"),
  rate: zOptNumber,
  vatRate: zVat,
  startDate: zOptDate,
  deadline: zOptDate,
  note: zOptText,
});

async function agreedMoney(d: z.infer<typeof outsourceSchema>, date: Date) {
  if (d.amount === null || d.amount <= 0) return null;
  const m = await resolveMoney({ amount: d.amount, currency: d.currency, date, manualRate: d.rate });
  return { agreedAmount: m.amount, currency: m.currency, fxRate: m.fxRate, fxDate: m.fxDate, fxSource: m.fxSource, agreedUzs: m.amountUzs, agreedUsd: m.amountUsd };
}

export async function assignContractor(taskId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction(["tasks.manage", "contractors.edit"], async (user) => {
    const contractorId = z.string().min(1).parse(formData.get("contractorId"));
    const d = outsourceSchema.parse(formObject(formData));
    const [task, contractor, company] = await Promise.all([
      db.task.findFirst({ where: { id: taskId, companyId: user.companyId } }),
      db.contractor.findFirst({ where: { id: contractorId, companyId: user.companyId } }),
      db.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { contractorPhoneRequired: true } }),
    ]);
    if (!task || !contractor) fail("invalid");
    await accessibleProject(user, task.projectId);
    if (!contractor.active || contractor.availability === "BLACKLISTED") fail("contractorBlacklisted");
    const contactPhone = d.contactPhone ? normalizePhone(d.contactPhone) : contractor.phone;
    if (d.contactPhone && !contactPhone) fail("phoneInvalid");
    if (company.contractorPhoneRequired && !contactPhone) fail("contractorPhoneRequired");
    if (d.startDate && d.deadline && d.deadline < d.startDate) fail("dateOrder");
    const money = await agreedMoney(d, d.startDate ?? new Date());
    await db.$transaction(async (tx) => {
      const a = await tx.taskAssignment.create({
        data: {
          taskId,
          kind: "CONTRACTOR",
          contractorId,
          contactName: d.contactName ?? contractor.name,
          contactPhone,
          plannedQty: d.plannedQty !== null ? new Prisma.Decimal(d.plannedQty) : task.plannedQty,
          plannedCostUzs: d.plannedCostUzs !== null ? new Prisma.Decimal(d.plannedCostUzs) : null,
          ...(money ?? {}),
          vatRate: new Prisma.Decimal(d.vatRate),
          outsourceStatus: "ASSIGNED",
          startDate: d.startDate,
          deadline: d.deadline ?? task.deadline,
          note: d.note,
        },
      });
      if (task.status === "NEW") {
        await tx.task.update({ where: { id: taskId }, data: { status: "ASSIGNED" } });
        await tx.taskEvent.create({ data: { taskId, type: "STATUS", userId: user.id, fromStatus: "NEW", toStatus: "ASSIGNED" } });
      }
      await tx.taskEvent.create({ data: { taskId, type: "COMMENT", userId: user.id, note: `Contractor: ${contractor.name}` } });
      await audit(tx, ctx(user), "TaskAssignment", a.id, "create", null, a);
    });
  });
  if (res?.ok) revalidatePath(`/tasks/${taskId}`);
  return res;
}

/** Change agreed terms (CASE 8: the value of a contractor task changes) — the old value stays in the audit log. */
export async function updateOutsource(assignmentId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let taskId = "";
  const res = await runAction(["tasks.manage", "contractors.edit"], async (user) => {
    const a = await loadAssignment(user, assignmentId);
    taskId = a.taskId;
    if (a.outsourceStatus === "VERIFIED" || a.outsourceStatus === "CANCELLED") fail("outsourceClosed");
    const d = outsourceSchema.parse(formObject(formData));
    const money = await agreedMoney(d, a.fxDate ?? a.startDate ?? new Date());
    const changed = money && (!a.agreedUzs || !money.agreedUzs.equals(a.agreedUzs));
    await db.$transaction(async (tx) => {
      const after = await tx.taskAssignment.update({
        where: { id: a.id },
        data: {
          contactName: d.contactName ?? a.contactName,
          contactPhone: d.contactPhone ? normalizePhone(d.contactPhone) : a.contactPhone,
          plannedQty: d.plannedQty !== null ? new Prisma.Decimal(d.plannedQty) : a.plannedQty,
          plannedCostUzs: d.plannedCostUzs !== null ? new Prisma.Decimal(d.plannedCostUzs) : a.plannedCostUzs,
          ...(money ?? {}),
          vatRate: new Prisma.Decimal(d.vatRate),
          startDate: d.startDate ?? a.startDate,
          deadline: d.deadline ?? a.deadline,
          note: d.note ?? a.note,
        },
      });
      if (changed)
        await tx.taskEvent.create({
          data: {
            taskId: a.taskId,
            type: "COMMENT",
            userId: user.id,
            note: `${a.contractor?.name}: kelishilgan summa ${a.agreedAmount ? `${Number(a.agreedAmount).toLocaleString("ru-RU")} ${a.currency}` : "—"} → ${Number(money!.agreedAmount).toLocaleString("ru-RU")} ${money!.currency}${d.note ? ` (${d.note})` : ""}`,
          },
        });
      await audit(tx, ctx(user), "TaskAssignment", a.id, "update", a, after);
    });
  });
  if (res?.ok) revalidatePath(`/tasks/${taskId}`);
  return res;
}

/** Progress of outsource work: start, completed (with actual qty / cost), verify (with quality), reject, resume, cancel. */
export async function outsourceStep(assignmentId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let taskId = "";
  let contractorId = "";
  const res = await runAction(["tasks.manage", "contractors.edit", "outsource.verify", "sessions.record"], async (user) => {
    const d = z
      .object({
        step: z.enum(["START", "COMPLETE", "VERIFY", "REJECT", "RESUME", "CANCEL"]),
        completedQty: zOptNumber,
        actualAmount: zOptNumber,
        completedAt: zOptDate,
        qualityScore: zOptNumber,
        note: zOptText,
      })
      .parse(formObject(formData));
    const a = await loadAssignment(user, assignmentId);
    taskId = a.taskId;
    contractorId = a.contractorId!;
    const s = a.outsourceStatus ?? "ASSIGNED";
    const allowed: Record<string, string[]> = {
      START: ["ASSIGNED"],
      COMPLETE: ["ASSIGNED", "IN_PROGRESS"],
      VERIFY: ["COMPLETED"],
      REJECT: ["COMPLETED"],
      RESUME: ["REJECTED"],
      CANCEL: ["ASSIGNED", "IN_PROGRESS", "REJECTED"],
    };
    if (!allowed[d.step].includes(s)) fail("badTransition");
    if (["VERIFY", "REJECT"].includes(d.step) && !can(user, "outsource.verify")) fail("forbidden");
    if (d.step === "CANCEL" && !canManageOutsource(user)) fail("forbidden");
    if (!canRecordOutsource(user)) fail("forbidden");

    const data: Prisma.TaskAssignmentUncheckedUpdateInput = {};
    let note = "";
    if (d.step === "START") {
      data.outsourceStatus = "IN_PROGRESS";
      data.startDate = a.startDate ?? toDateOnly(new Date());
    }
    if (d.step === "COMPLETE") {
      const qty = d.completedQty ?? (a.plannedQty ? Number(a.plannedQty) : null);
      if (qty === null || qty <= 0) fail("required");
      const at = d.completedAt ?? new Date();
      if (at > new Date()) fail("futureDate");
      const amount = d.actualAmount ?? (a.agreedAmount ? Number(a.agreedAmount) : null);
      if (amount !== null) {
        const m = await resolveMoney({ amount, currency: a.currency, date: at, manualRate: a.fxSource === "MANUAL" && a.fxRate ? Number(a.fxRate) : null });
        data.actualUzs = m.amountUzs;
        data.actualUsd = m.amountUsd;
      }
      data.outsourceStatus = "COMPLETED";
      data.completedQty = new Prisma.Decimal(qty);
      data.completedAt = at;
      note = `${qty} ${a.task.unit ?? ""}${amount !== null ? ` · ${amount.toLocaleString("ru-RU")} ${a.currency}` : ""}`;
    }
    if (d.step === "VERIFY") {
      const q = Math.round(d.qualityScore ?? 0);
      if (q < 1 || q > 5) fail("qualityRequired");
      data.outsourceStatus = "VERIFIED";
      data.qualityScore = q;
      data.verifiedById = user.id;
      data.verifiedAt = new Date();
      note = `★${q}`;
    }
    if (d.step === "REJECT") {
      if (!d.note) fail("required");
      data.outsourceStatus = "REJECTED";
      data.reworkCount = a.reworkCount + 1;
    }
    if (d.step === "RESUME") data.outsourceStatus = "IN_PROGRESS";
    if (d.step === "CANCEL") data.outsourceStatus = "CANCELLED";

    await db.$transaction(async (tx) => {
      const after = await tx.taskAssignment.update({ where: { id: a.id }, data });
      await tx.taskEvent.create({
        data: {
          taskId: a.taskId,
          type: d.step === "REJECT" ? "PROBLEM" : "COMMENT",
          userId: user.id,
          note: `${a.contractor?.name} — ${OUTSOURCE_LABEL[d.step]}${note ? `: ${note}` : ""}${d.note ? ` (${d.note})` : ""}`,
        },
      });
      if (d.step === "REJECT")
        await tx.remark.create({
          data: {
            companyId: user.companyId,
            projectId: a.task.projectId,
            number: ((await tx.remark.findFirst({ where: { companyId: user.companyId }, orderBy: { number: "desc" }, select: { number: true } }))?.number ?? 0) + 1,
            taskId: a.taskId,
            locationId: a.task.locationId,
            description: `${a.contractor?.name}: ${d.note}`,
            priority: "HIGH",
            status: "ASSIGNED",
            responsibleUserId: a.task.responsibleId ?? user.id,
            createdById: user.id,
          },
        });
      await audit(tx, ctx(user), "TaskAssignment", a.id, "update", { outsourceStatus: s }, { outsourceStatus: after.outsourceStatus, note: d.note });
      if (["VERIFY", "REJECT", "CANCEL"].includes(d.step)) await snapshotScore(tx, user.companyId, a.contractorId!);
      // The task follows its outsource work when only contractors perform it.
      const others = await tx.taskAssignment.findMany({ where: { taskId: a.taskId }, select: { kind: true, outsourceStatus: true } });
      const onlyContractors = others.every((o) => o.kind === "CONTRACTOR");
      const live = others.filter((o) => o.outsourceStatus !== "CANCELLED");
      let to: "IN_PROGRESS" | "COMPLETED" | null = null;
      if (onlyContractors && d.step === "START" && ["NEW", "ASSIGNED", "ACCEPTED"].includes(a.task.status)) to = "IN_PROGRESS";
      if (onlyContractors && d.step === "COMPLETE" && live.every((o) => o.outsourceStatus === "COMPLETED" || o.outsourceStatus === "VERIFIED") && ["NEW", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "REWORK"].includes(a.task.status)) to = "COMPLETED";
      if (onlyContractors && d.step === "REJECT" && ["COMPLETED", "INSPECTION"].includes(a.task.status)) to = "IN_PROGRESS";
      if (to) {
        await tx.task.update({
          where: { id: a.taskId },
          data: { status: to, ...(to === "COMPLETED" ? { actualFinish: new Date(), reportedPercent: 100 } : { actualStart: a.task.actualStart ?? new Date() }) },
        });
        await tx.taskEvent.create({ data: { taskId: a.taskId, type: "STATUS", userId: user.id, fromStatus: a.task.status, toStatus: to } });
      }
    });
  });
  if (res?.ok) {
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath(`/contractors/${contractorId}`);
  }
  return res;
}

const OUTSOURCE_LABEL: Record<string, string> = {
  START: "ishni boshladi",
  COMPLETE: "bajarildi deb belgilandi",
  VERIFY: "ish tasdiqlandi",
  REJECT: "ish qaytarildi (qayta ishlash)",
  RESUME: "qayta ishlash boshlandi",
  CANCEL: "bekor qilindi",
};
