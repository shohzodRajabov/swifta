"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveMoney } from "@/lib/fx";
import { STAGES } from "@/lib/stages";
import { toDateOnly } from "@/lib/utils";
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
  type ActionState,
} from "@/lib/action";
import type { CurrentUser } from "@/lib/auth";

const zCurrency = z.enum(["UZS", "USD"]);
const zCategory = z.enum([
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
]);

async function ownProject(user: CurrentUser, id: string) {
  const p = await db.project.findFirst({ where: { id, companyId: user.companyId } });
  if (!p) fail("invalid");
  return p;
}

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
  address: zOptText,
  contractNumber: zOptText,
  contractDate: zOptDate,
  managerId: zOptId,
  engineerId: zOptId,
  installTeam: zOptText,
  startDate: zOptDate,
  plannedEndDate: zOptDate,
  actualEndDate: zOptDate,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  status: z.enum(["ACTIVE", "ON_HOLD", "CLOSED", "CANCELLED"]).default("ACTIVE"),
  note: zOptText,
  amount: zOptNumber,
  currency: zCurrency,
  rate: zOptNumber,
});

async function contractMoney(data: z.infer<typeof projectSchema>) {
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
  };
}

async function validateRefs(user: CurrentUser, data: z.infer<typeof projectSchema>) {
  const client = await db.client.findFirst({ where: { id: data.clientId, companyId: user.companyId } });
  if (!client) fail("required");
  for (const uid of [data.managerId, data.engineerId]) {
    if (uid && !(await db.user.findFirst({ where: { id: uid, companyId: user.companyId } }))) fail("invalid");
  }
}

function fields(data: z.infer<typeof projectSchema>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { amount, currency, rate, ...rest } = data;
  return rest;
}

export async function createProject(_: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction("projects.edit", async (user) => {
    const data = projectSchema.parse(formObject(formData));
    await validateRefs(user, data);
    const money = await contractMoney(data);
    const year = new Date().getFullYear();
    const created = await db.$transaction(async (tx) => {
      const count = await tx.project.count({
        where: { companyId: user.companyId, code: { startsWith: `OB-${year}-` } },
      });
      const code = `OB-${year}-${String(count + 1).padStart(3, "0")}`;
      const p = await tx.project.create({
        data: { ...fields(data), ...money, code, companyId: user.companyId },
      });
      await tx.projectStageEvent.create({ data: { projectId: p.id, stage: p.stage, userId: user.id } });
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
    const before = await ownProject(user, id);
    const data = projectSchema.parse(formObject(formData));
    await validateRefs(user, data);

    const contractChanged =
      !new Prisma.Decimal(data.amount ?? 0).equals(before.contractAmount) ||
      data.currency !== before.contractCurrency ||
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
      await audit(tx, ctxOf(user), "Project", id, "update", before, after);
    });
  });
  if (res?.ok) {
    refresh(id);
    redirect(`/projects/${id}`);
  }
  return res;
}

export async function changeStage(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("projects.stage", async (user) => {
    const before = await ownProject(user, id);
    const { stage, note } = z
      .object({ stage: z.enum(STAGES as [string, ...string[]]), note: zOptText })
      .parse(formObject(formData));
    if (stage === before.stage) return;
    await db.$transaction(async (tx) => {
      const after = await tx.project.update({
        where: { id },
        data: {
          stage: stage as (typeof STAGES)[number],
          ...(stage === "COMPLETED" && !before.actualEndDate ? { actualEndDate: toDateOnly(new Date()) } : {}),
        },
      });
      await tx.projectStageEvent.create({
        data: { projectId: id, stage: after.stage, userId: user.id, note },
      });
      await audit(tx, ctxOf(user), "Project", id, "update", { stage: before.stage }, { stage: after.stage, note });
    });
  });
  if (res?.ok) refresh(id);
  return res;
}

// ---- BOM (plan) ------------------------------------------------------------

export async function addBomItem(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("bom.edit", async (user) => {
    await ownProject(user, projectId);
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

    const price = await resolveMoney({
      amount: data.amount,
      currency: data.currency,
      date: new Date(),
      manualRate: data.rate,
    });
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
    await ownProject(user, projectId);
    const data = z
      .object({ category: zCategory, description: zOptText, amount: zPositive, currency: zCurrency, rate: zOptNumber })
      .parse(formObject(formData));
    const m = await resolveMoney({ amount: data.amount, currency: data.currency, date: new Date(), manualRate: data.rate });
    await db.$transaction(async (tx) => {
      const line = await tx.budgetLine.create({
        data: { projectId, category: data.category, description: data.description, ...m },
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
    projectId = line.projectId;
    await db.$transaction(async (tx) => {
      await tx.budgetLine.delete({ where: { id } });
      await audit(tx, ctxOf(user), "BudgetLine", id, "delete", line, null);
    });
  });
  if (projectId) refresh(projectId);
}

// ---- Payment schedule (plan) & client payments (actual) --------------------

export async function addMilestone(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("payments.edit", async (user) => {
    const project = await ownProject(user, projectId);
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
    await ownProject(user, projectId);
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
});

export async function addExpense(_: ActionState, formData: FormData): Promise<ActionState> {
  let projectId = "";
  const res = await runAction("expenses.edit", async (user) => {
    const data = expenseSchema.parse(formObject(formData));
    await ownProject(user, data.projectId);
    projectId = data.projectId;
    const m = await resolveMoney({ amount: data.amount, currency: data.currency, date: data.date, manualRate: data.rate });
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
        },
      });
      await audit(tx, ctxOf(user), "Expense", e.id, "create", null, e);
    });
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
