"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveMoney } from "@/lib/fx";
import { toDateOnly } from "@/lib/utils";
import { addMonths } from "date-fns";
import {
  fail,
  formObject,
  runAction,
  zDate,
  zNumber,
  zOptDate,
  zOptId,
  zOptNumber,
  zOptText,
  zPositive,
  zText,
  zVat,
  type ActionState,
} from "@/lib/action";
import type { CurrentUser } from "@/lib/auth";
import { accessibleProject } from "@/server/projects/access";
import { approvalFor } from "@/server/finance/approval";
import { missingDocuments } from "@/server/projects/status";

const zCurrency = z.enum(["UZS", "USD"]);
const zCategory = z.enum([
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
  "OTHER",
]);

const ctxOf = (user: CurrentUser) => ({ companyId: user.companyId, userId: user.id });

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

// ---- project ---------------------------------------------------------------

const projectSchema = z.object({
  name: zText,
  clientId: zText,
  ownerId: zOptId,
  legalEntityId: zOptId,
  objectType: zOptText,
  address: zOptText,
  siteContactName: zOptText,
  siteContactPhone: zOptText,
  siteContactEmail: zOptText,
  contractNumber: zOptText,
  contractDate: zOptDate,
  managerId: zOptId,
  engineerId: zOptId,
  chiefEngineerId: zOptId,
  foremanId: zOptId,
  installTeam: zOptText,
  startDate: zOptDate,
  plannedEndDate: zOptDate,
  actualEndDate: zOptDate,
  warrantyMonths: zOptNumber,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  status: z.enum(["ACTIVE", "ON_HOLD", "CLOSED", "CANCELLED"]).default("ACTIVE"),
  note: zOptText,
  amount: zOptNumber,
  currency: zCurrency,
  rate: zOptNumber,
  vatRate: zVat,
});

type ProjectInput = z.infer<typeof projectSchema>;

async function contractMoney(data: ProjectInput) {
  const m = await resolveMoney({
    amount: data.amount ?? 0,
    currency: data.currency,
    date: data.contractDate ?? new Date(),
    manualRate: data.rate,
  });
  return {
    contractAmount: m.amount,
    contractCurrency: m.currency,
    contractFxRate: m.fxRate,
    contractFxDate: m.fxDate,
    contractFxSource: m.fxSource,
    contractAmountUzs: m.amountUzs,
    contractAmountUsd: m.amountUsd,
    contractVatRate: new Prisma.Decimal(data.vatRate),
  };
}

async function validateRefs(user: CurrentUser, data: ProjectInput) {
  const companyId = user.companyId;
  const client = await db.client.findFirst({ where: { id: data.clientId, companyId } });
  if (!client) fail("required");
  if (data.ownerId && !(await db.client.findFirst({ where: { id: data.ownerId, companyId } }))) fail("invalid");
  if (data.legalEntityId && !(await db.legalEntity.findFirst({ where: { id: data.legalEntityId, companyId } }))) fail("invalid");
  for (const uid of [data.managerId, data.engineerId, data.chiefEngineerId, data.foremanId]) {
    if (uid && !(await db.user.findFirst({ where: { id: uid, companyId } }))) fail("invalid");
  }
}

function fields(data: ProjectInput) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { amount, currency, rate, vatRate, warrantyMonths, ...rest } = data;
  return { ...rest, ownerId: rest.ownerId ?? rest.clientId, warrantyMonths: warrantyMonths ?? null };
}

export async function createProject(_: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction("projects.edit", async (user) => {
    const data = projectSchema.parse(formObject(formData));
    await validateRefs(user, data);
    const money = await contractMoney(data);
    const year = new Date().getFullYear();
    const first = await db.statusDef.findFirst({
      where: { group: { companyId: user.companyId }, active: true },
      orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });
    const legalEntityId =
      data.legalEntityId ??
      (await db.legalEntity.findFirst({ where: { companyId: user.companyId, isDefault: true } }))?.id ??
      null;
    const created = await db.$transaction(async (tx) => {
      const count = await tx.project.count({
        where: { companyId: user.companyId, code: { startsWith: `OB-${year}-` } },
      });
      const code = `OB-${year}-${String(count + 1).padStart(3, "0")}`;
      const p = await tx.project.create({
        data: { ...fields(data), legalEntityId, ...money, code, companyId: user.companyId, statusId: first?.id },
      });
      await tx.projectStageEvent.create({ data: { projectId: p.id, statusId: first?.id, userId: user.id } });
      await audit(tx, ctxOf(user), "Project", p.id, "create", null, p);
      return p;
    });
    id = created.id;
  });
  if (res?.ok) redirect(`/projects/${id}`);
  return res;
}

export async function updateProject(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("projects.edit", async (user) => {
    const before = await accessibleProject(user, id);
    const data = projectSchema.parse(formObject(formData));
    await validateRefs(user, data);

    const contractChanged =
      !new Prisma.Decimal(data.amount ?? 0).equals(before.contractAmount) ||
      data.currency !== before.contractCurrency ||
      !new Prisma.Decimal(data.vatRate).equals(before.contractVatRate) ||
      (data.rate ?? null) !== (before.contractFxSource === "MANUAL" ? Number(before.contractFxRate) : null) ||
      (data.contractDate?.getTime() ?? null) !== (before.contractDate?.getTime() ?? null);
    const money = contractChanged ? await contractMoney(data) : {};

    await db.$transaction(async (tx) => {
      const after = await tx.project.update({ where: { id }, data: { ...fields(data), ...money } });
      if (contractChanged) {
        // Keep the payment schedule proportional to the new contract value.
        const milestones = await tx.paymentMilestone.findMany({ where: { projectId: id } });
        for (const m of milestones) {
          await tx.paymentMilestone.update({
            where: { id: m.id },
            data: {
              amountUzs: after.contractAmountUzs.mul(m.percent).div(100).toDecimalPlaces(2),
              amountUsd: after.contractAmountUsd.mul(m.percent).div(100).toDecimalPlaces(2),
            },
          });
        }
      }
      if (after.warrantyStart && after.warrantyMonths) {
        await tx.project.update({
          where: { id },
          data: { warrantyEnd: toDateOnly(addMonths(after.warrantyStart, after.warrantyMonths)) },
        });
      }
      await audit(tx, ctxOf(user), "Project", id, "update", before, after);
    });
  });
  if (res?.ok) {
    refresh(id);
    redirect(`/projects/${id}`);
  }
  return res;
}

/** Move a project to another status; statuses may require documents to be present first. */
export async function changeStatus(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("projects.status", async (user) => {
    const before = await accessibleProject(user, id);
    const { statusId, note } = z.object({ statusId: zText, note: zOptText }).parse(formObject(formData));
    if (statusId === before.statusId) return;
    const status = await db.statusDef.findFirst({
      where: { id: statusId, group: { companyId: user.companyId } },
      include: { group: true },
    });
    if (!status) fail("invalid");
    const missing = await missingDocuments(id, status.requiredDocs);
    if (missing.length > 0) {
      const t = await getTranslations("docCategory");
      fail("missingDocs", { docs: missing.map((c) => t(c)).join(", ") });
    }
    const today = toDateOnly(new Date());
    const finishing = status.group.code === "DONE" || status.group.code === "SERVICE";
    await db.$transaction(async (tx) => {
      const after = await tx.project.update({
        where: { id },
        data: {
          statusId,
          ...(finishing && !before.actualEndDate ? { actualEndDate: today } : {}),
          // Warranty starts on handover (first time the project is finished).
          ...(finishing && !before.warrantyStart
            ? {
                warrantyStart: today,
                warrantyEnd: before.warrantyMonths ? toDateOnly(addMonths(today, before.warrantyMonths)) : null,
              }
            : {}),
        },
      });
      await tx.projectStageEvent.create({ data: { projectId: id, statusId, userId: user.id, note } });
      await audit(tx, ctxOf(user), "Project", id, "update", { statusId: before.statusId }, { statusId: after.statusId, note });
    });
  });
  if (res?.ok) refresh(id);
  return res;
}

// ---- BOM (plan) ------------------------------------------------------------

export async function addBomItem(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("bom.edit", async (user) => {
    await accessibleProject(user, projectId);
    const data = z
      .object({
        productId: zOptId,
        name: zOptText,
        kind: z.enum(["EQUIPMENT", "MATERIAL"]),
        unit: zOptText,
        plannedQty: zPositive,
        amount: zNumber,
        currency: zCurrency,
        rate: zOptNumber,
        vatRate: zVat,
      })
      .parse(formObject(formData));

    let name = data.name;
    let unit = data.unit;
    let kind = data.kind;
    if (data.productId) {
      const product = await db.product.findFirst({
        where: { id: data.productId, companyId: user.companyId },
        include: { category: true },
      });
      if (!product) fail("invalid");
      name = name ?? `${product.name}${product.model ? ` (${product.model})` : ""}`;
      unit = unit ?? product.unit;
      kind = product.category.kind;
    }
    if (!name || !unit) fail("required");

    const price = await resolveMoney({ amount: data.amount, currency: data.currency, date: new Date(), manualRate: data.rate });
    const qty = new Prisma.Decimal(data.plannedQty);
    await db.$transaction(async (tx) => {
      const item = await tx.bomItem.create({
        data: {
          projectId,
          productId: data.productId,
          kind,
          name: name!,
          unit: unit!,
          plannedQty: qty,
          unitPrice: price.amount,
          currency: price.currency,
          fxRate: price.fxRate,
          fxDate: price.fxDate,
          fxSource: price.fxSource,
          unitPriceUzs: price.amountUzs,
          plannedCostUzs: price.amountUzs.mul(qty).toDecimalPlaces(2),
          plannedCostUsd: price.amountUsd.mul(qty).toDecimalPlaces(2),
          vatRate: new Prisma.Decimal(data.vatRate),
        },
      });
      await audit(tx, ctxOf(user), "BomItem", item.id, "create", null, item);
    });
  });
  if (res?.ok) refresh(projectId);
  return res;
}

export async function deleteBomItem(formData: FormData) {
  const id = String(formData.get("id"));
  let projectId = "";
  await runAction("bom.edit", async (user) => {
    const item = await db.bomItem.findFirst({ where: { id, project: { companyId: user.companyId } } });
    if (!item) fail("invalid");
    await accessibleProject(user, item.projectId);
    projectId = item.projectId;
    await db.$transaction(async (tx) => {
      await tx.bomItem.delete({ where: { id } });
      await audit(tx, ctxOf(user), "BomItem", id, "delete", item, null);
    });
  });
  if (projectId) refresh(projectId);
}

// ---- Budget lines (plan) ---------------------------------------------------

export async function addBudgetLine(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("budget.edit", async (user) => {
    await accessibleProject(user, projectId);
    const data = z
      .object({
        category: zCategory,
        description: zOptText,
        amount: zPositive,
        currency: zCurrency,
        rate: zOptNumber,
        vatRate: zVat,
      })
      .parse(formObject(formData));
    const m = await resolveMoney({ amount: data.amount, currency: data.currency, date: new Date(), manualRate: data.rate });
    await db.$transaction(async (tx) => {
      const line = await tx.budgetLine.create({
        data: { projectId, category: data.category, description: data.description, ...m, vatRate: new Prisma.Decimal(data.vatRate) },
      });
      await audit(tx, ctxOf(user), "BudgetLine", line.id, "create", null, line);
    });
  });
  if (res?.ok) refresh(projectId);
  return res;
}

export async function deleteBudgetLine(formData: FormData) {
  const id = String(formData.get("id"));
  let projectId = "";
  await runAction("budget.edit", async (user) => {
    const line = await db.budgetLine.findFirst({ where: { id, project: { companyId: user.companyId } } });
    if (!line) fail("invalid");
    await accessibleProject(user, line.projectId);
    projectId = line.projectId;
    await db.$transaction(async (tx) => {
      await tx.budgetLine.delete({ where: { id } });
      await audit(tx, ctxOf(user), "BudgetLine", id, "delete", line, null);
    });
  });
  if (projectId) refresh(projectId);
}

// ---- Contract amendments (additional agreements) ---------------------------

export async function addAmendment(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("projects.edit", async (user) => {
    await accessibleProject(user, projectId);
    const data = z
      .object({
        number: zOptText,
        date: zDate,
        description: zText,
        amount: zNumber,
        currency: zCurrency,
        rate: zOptNumber,
        vatRate: zVat,
      })
      .parse(formObject(formData));
    const m = await resolveMoney({ amount: data.amount, currency: data.currency, date: data.date, manualRate: data.rate });
    await db.$transaction(async (tx) => {
      const count = await tx.contractAmendment.count({ where: { projectId } });
      const a = await tx.contractAmendment.create({
        data: {
          projectId,
          number: data.number ?? String(count + 1),
          date: toDateOnly(data.date),
          description: data.description,
          ...m,
          vatRate: new Prisma.Decimal(data.vatRate),
          createdById: user.id,
        },
      });
      await audit(tx, ctxOf(user), "ContractAmendment", a.id, "create", null, a);
    });
  });
  if (res?.ok) refresh(projectId);
  return res;
}

export async function deleteAmendment(formData: FormData) {
  const id = String(formData.get("id"));
  let projectId = "";
  await runAction("projects.edit", async (user) => {
    const a = await db.contractAmendment.findFirst({ where: { id, project: { companyId: user.companyId } } });
    if (!a) fail("invalid");
    await accessibleProject(user, a.projectId);
    projectId = a.projectId;
    await db.$transaction(async (tx) => {
      await tx.contractAmendment.delete({ where: { id } });
      await audit(tx, ctxOf(user), "ContractAmendment", id, "delete", a, null);
    });
  });
  if (projectId) refresh(projectId);
}

// ---- Acts of completed works (actual revenue) ------------------------------

export async function addAct(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("acts.edit", async (user) => {
    await accessibleProject(user, projectId);
    const data = z
      .object({
        number: zOptText,
        date: zDate,
        periodFrom: zOptDate,
        periodTo: zOptDate,
        note: zOptText,
        signed: z.preprocess((v) => v === "on", z.boolean()),
        amount: zPositive,
        currency: zCurrency,
        rate: zOptNumber,
        vatRate: zVat,
      })
      .parse({ signed: formData.get("signed") ?? "", ...formObject(formData) });
    const m = await resolveMoney({ amount: data.amount, currency: data.currency, date: data.date, manualRate: data.rate });
    await db.$transaction(async (tx) => {
      const count = await tx.act.count({ where: { projectId } });
      const a = await tx.act.create({
        data: {
          projectId,
          number: data.number ?? `AKT-${count + 1}`,
          date: toDateOnly(data.date),
          periodFrom: data.periodFrom,
          periodTo: data.periodTo,
          note: data.note,
          status: data.signed ? "SIGNED" : "DRAFT",
          signedAt: data.signed ? new Date() : null,
          ...m,
          vatRate: new Prisma.Decimal(data.vatRate),
          createdById: user.id,
        },
      });
      await audit(tx, ctxOf(user), "Act", a.id, "create", null, a);
    });
  });
  if (res?.ok) refresh(projectId);
  return res;
}

export async function setActStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const status = z.enum(["SIGNED", "CANCELLED", "DELETE"]).parse(formData.get("status"));
  let projectId = "";
  await runAction("acts.edit", async (user) => {
    const a = await db.act.findFirst({ where: { id, project: { companyId: user.companyId } } });
    if (!a) fail("invalid");
    await accessibleProject(user, a.projectId);
    projectId = a.projectId;
    await db.$transaction(async (tx) => {
      if (status === "DELETE") {
        if (a.status === "SIGNED") fail("inUse");
        await tx.act.delete({ where: { id } });
        await audit(tx, ctxOf(user), "Act", id, "delete", a, null);
        return;
      }
      const after = await tx.act.update({
        where: { id },
        data: { status, signedAt: status === "SIGNED" ? new Date() : a.signedAt },
      });
      await audit(tx, ctxOf(user), "Act", id, "update", { status: a.status }, { status: after.status });
    });
  });
  if (projectId) refresh(projectId);
}

// ---- Payment schedule (plan) & client payments (cash) ----------------------

export async function addMilestone(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("payments.edit", async (user) => {
    const project = await accessibleProject(user, projectId);
    const data = z
      .object({ name: zText, percent: zPositive.pipe(z.number().max(100)), dueDate: zOptDate })
      .parse(formObject(formData));
    const pct = new Prisma.Decimal(data.percent);
    await db.$transaction(async (tx) => {
      const count = await tx.paymentMilestone.count({ where: { projectId } });
      const m = await tx.paymentMilestone.create({
        data: {
          projectId,
          name: data.name,
          percent: pct,
          dueDate: data.dueDate,
          sortOrder: count,
          amountUzs: project.contractAmountUzs.mul(pct).div(100).toDecimalPlaces(2),
          amountUsd: project.contractAmountUsd.mul(pct).div(100).toDecimalPlaces(2),
        },
      });
      await audit(tx, ctxOf(user), "PaymentMilestone", m.id, "create", null, m);
    });
  });
  if (res?.ok) refresh(projectId);
  return res;
}

export async function deleteMilestone(formData: FormData) {
  const id = String(formData.get("id"));
  let projectId = "";
  await runAction("payments.edit", async (user) => {
    const m = await db.paymentMilestone.findFirst({
      where: { id, project: { companyId: user.companyId } },
      include: { _count: { select: { payments: true } } },
    });
    if (!m || m._count.payments > 0) fail("inUse");
    await accessibleProject(user, m.projectId);
    projectId = m.projectId;
    await db.$transaction(async (tx) => {
      await tx.paymentMilestone.delete({ where: { id } });
      await audit(tx, ctxOf(user), "PaymentMilestone", id, "delete", m, null);
    });
  });
  if (projectId) refresh(projectId);
}

export async function addPayment(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("payments.edit", async (user) => {
    await accessibleProject(user, projectId);
    const data = z
      .object({
        date: zDate,
        milestoneId: zOptId,
        method: z.enum(["BANK", "CASH", "CARD", "OTHER"]),
        reference: zOptText,
        note: zOptText,
        amount: zPositive,
        currency: zCurrency,
        rate: zOptNumber,
      })
      .parse(formObject(formData));
    if (data.milestoneId && !(await db.paymentMilestone.findFirst({ where: { id: data.milestoneId, projectId } })))
      fail("invalid");
    const m = await resolveMoney({ amount: data.amount, currency: data.currency, date: data.date, manualRate: data.rate });
    await db.$transaction(async (tx) => {
      const p = await tx.clientPayment.create({
        data: {
          projectId,
          milestoneId: data.milestoneId,
          date: toDateOnly(data.date),
          method: data.method,
          reference: data.reference,
          note: data.note,
          ...m,
        },
      });
      await audit(tx, ctxOf(user), "ClientPayment", p.id, "create", null, p);
    });
  });
  if (res?.ok) refresh(projectId);
  return res;
}

export async function deletePayment(formData: FormData) {
  const id = String(formData.get("id"));
  let projectId = "";
  await runAction("payments.edit", async (user) => {
    const p = await db.clientPayment.findFirst({ where: { id, project: { companyId: user.companyId } } });
    if (!p) fail("invalid");
    await accessibleProject(user, p.projectId);
    projectId = p.projectId;
    await db.$transaction(async (tx) => {
      await tx.clientPayment.delete({ where: { id } });
      await audit(tx, ctxOf(user), "ClientPayment", id, "delete", p, null);
    });
  });
  if (projectId) refresh(projectId);
}

// ---- Expenses (actual) -----------------------------------------------------

const expenseSchema = z.object({
  projectId: zText,
  category: zCategory,
  date: zDate,
  description: zText,
  supplier: zOptText,
  reference: zOptText,
  amount: zPositive,
  currency: zCurrency,
  rate: zOptNumber,
  vatRate: zVat,
});

export async function addExpense(_: ActionState, formData: FormData): Promise<ActionState> {
  let projectId = "";
  const res = await runAction("expenses.edit", async (user) => {
    const data = expenseSchema.parse(formObject(formData));
    await accessibleProject(user, data.projectId);
    projectId = data.projectId;
    const m = await resolveMoney({ amount: data.amount, currency: data.currency, date: data.date, manualRate: data.rate });
    const approval = await approvalFor(user, m.amountUzs);
    await db.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: {
          projectId: data.projectId,
          category: data.category,
          date: toDateOnly(data.date),
          description: data.description,
          supplier: data.supplier,
          reference: data.reference,
          createdById: user.id,
          ...m,
          vatRate: new Prisma.Decimal(data.vatRate),
          approval,
          ...(approval === "APPROVED" ? { approvedById: user.id, approvedAt: new Date() } : {}),
        },
      });
      await audit(tx, ctxOf(user), "Expense", e.id, "create", null, e);
    });
    if (approval === "PENDING") return { pending: "1" };
  });
  if (res?.ok) {
    refresh(projectId);
    revalidatePath("/finance");
  }
  return res;
}

export async function deleteExpense(formData: FormData) {
  const id = String(formData.get("id"));
  let projectId = "";
  await runAction("expenses.edit", async (user) => {
    const e = await db.expense.findFirst({ where: { id, project: { companyId: user.companyId } } });
    if (!e) fail("invalid");
    await accessibleProject(user, e.projectId);
    projectId = e.projectId;
    await db.$transaction(async (tx) => {
      await tx.expense.delete({ where: { id } });
      await audit(tx, ctxOf(user), "Expense", id, "delete", e, null);
    });
  });
  if (projectId) {
    refresh(projectId);
    revalidatePath("/finance");
  }
}
