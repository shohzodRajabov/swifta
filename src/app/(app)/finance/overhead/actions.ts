"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveMoney } from "@/lib/fx";
import { toDateOnly } from "@/lib/utils";
import { fail, formObject, runAction, zDate, zOptId, zOptNumber, zOptText, zPositive, zText, zVat, type ActionState } from "@/lib/action";
import { approvalFor } from "@/server/finance/approval";

const CATEGORIES = [
  "OFFICE_RENT",
  "OFFICE_SALARY",
  "VEHICLE",
  "FUEL",
  "UTILITIES",
  "COMMUNICATION",
  "MARKETING",
  "BANK_FEES",
  "TAXES_FEES",
  "TOOLS",
  "WORKSHOP",
  "OTHER",
] as const;

export async function addOverhead(_: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("overhead.edit", async (user) => {
    const d = z
      .object({
        category: z.enum(CATEGORIES),
        legalEntityId: zOptId,
        date: zDate,
        description: zText,
        supplier: zOptText,
        reference: zOptText,
        amount: zPositive,
        currency: z.enum(["UZS", "USD"]),
        rate: zOptNumber,
        vatRate: zVat,
      })
      .parse(formObject(formData));
    if (d.legalEntityId && !(await db.legalEntity.findFirst({ where: { id: d.legalEntityId, companyId: user.companyId } })))
      fail("invalid");
    const m = await resolveMoney({ amount: d.amount, currency: d.currency, date: d.date, manualRate: d.rate });
    const approval = await approvalFor(user, m.amountUzs);
    await db.$transaction(async (tx) => {
      const o = await tx.overheadExpense.create({
        data: {
          companyId: user.companyId,
          legalEntityId: d.legalEntityId,
          category: d.category,
          date: toDateOnly(d.date),
          description: d.description,
          supplier: d.supplier,
          reference: d.reference,
          ...m,
          vatRate: new Prisma.Decimal(d.vatRate),
          approval,
          ...(approval === "APPROVED" ? { approvedById: user.id, approvedAt: new Date() } : {}),
          createdById: user.id,
        },
      });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "OverheadExpense", o.id, "create", null, o);
    });
    if (approval === "PENDING") return { pending: "1" };
  });
  if (res?.ok) revalidatePath("/finance/overhead");
  return res;
}

export async function deleteOverhead(formData: FormData) {
  const id = String(formData.get("id"));
  await runAction("overhead.edit", async (user) => {
    const o = await db.overheadExpense.findFirst({ where: { id, companyId: user.companyId } });
    if (!o || o.source === "PAYROLL") fail("inUse");
    await db.$transaction(async (tx) => {
      await tx.overheadExpense.delete({ where: { id } });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "OverheadExpense", id, "delete", o, null);
    });
  });
  revalidatePath("/finance/overhead");
}


