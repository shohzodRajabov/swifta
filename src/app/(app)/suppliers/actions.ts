"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveMoney } from "@/lib/fx";
import { toDateOnly } from "@/lib/utils";
import {
  fail,
  formObject,
  runAction,
  zDate,
  zOptId,
  zOptNumber,
  zOptText,
  zPositive,
  zText,
  type ActionState,
} from "@/lib/action";

const schema = z.object({
  name: zText,
  contactPerson: zOptText,
  phone: zOptText,
  email: zOptText,
  address: zOptText,
  tin: zOptText,
  bankDetails: zOptText,
  paymentTerms: zOptText,
  leadTimeDays: zOptNumber.pipe(z.number().int().min(0).nullable()),
  note: zOptText,
});

export async function saveSupplier(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  let target = id ?? "";
  const res = await runAction("suppliers.edit", async (user) => {
    const data = schema.parse(formObject(formData));
    const ctx = { companyId: user.companyId, userId: user.id };
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.supplier.findFirst({ where: { id, companyId: user.companyId } });
        if (!before) fail("invalid");
        const after = await tx.supplier.update({ where: { id }, data });
        await audit(tx, ctx, "Supplier", id, "update", before, after);
      } else {
        const s = await tx.supplier.create({ data: { ...data, companyId: user.companyId } });
        await audit(tx, ctx, "Supplier", s.id, "create", null, s);
        target = s.id;
      }
    });
  });
  if (res?.ok) {
    revalidatePath("/suppliers");
    redirect(`/suppliers/${target}`);
  }
  return res;
}

export async function addSupplierPrice(supplierId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("suppliers.edit", async (user) => {
    const supplier = await db.supplier.findFirst({ where: { id: supplierId, companyId: user.companyId } });
    if (!supplier) fail("invalid");
    const data = z
      .object({
        productId: zText,
        amount: zPositive,
        currency: z.enum(["UZS", "USD"]),
        rate: zOptNumber,
        date: zDate,
        leadTimeDays: zOptNumber,
        note: zOptText,
      })
      .parse(formObject(formData));
    if (!(await db.product.findFirst({ where: { id: data.productId, companyId: user.companyId } }))) fail("invalid");
    const m = await resolveMoney({ amount: data.amount, currency: data.currency, date: data.date, manualRate: data.rate });
    await db.$transaction(async (tx) => {
      const p = await tx.supplierPrice.create({
        data: {
          supplierId,
          productId: data.productId,
          price: m.amount,
          currency: m.currency,
          priceUzs: m.amountUzs,
          priceUsd: m.amountUsd,
          fxRate: m.fxRate,
          date: toDateOnly(data.date),
          leadTimeDays: data.leadTimeDays ?? null,
          note: data.note,
        },
      });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "SupplierPrice", p.id, "create", null, p);
    });
  });
  if (res?.ok) revalidatePath(`/suppliers/${supplierId}`);
  return res;
}

export async function deleteSupplierPrice(formData: FormData) {
  const id = String(formData.get("id"));
  let supplierId = "";
  await runAction("suppliers.edit", async (user) => {
    const p = await db.supplierPrice.findFirst({ where: { id, supplier: { companyId: user.companyId } } });
    if (!p) fail("invalid");
    supplierId = p.supplierId;
    await db.$transaction(async (tx) => {
      await tx.supplierPrice.delete({ where: { id } });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "SupplierPrice", id, "delete", p, null);
    });
  });
  if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
}

export async function addSupplierPayment(supplierId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("supplierPayments.edit", async (user) => {
    const supplier = await db.supplier.findFirst({ where: { id: supplierId, companyId: user.companyId } });
    if (!supplier) fail("invalid");
    const data = z
      .object({
        orderId: zOptId,
        date: zDate,
        method: z.enum(["BANK", "CASH", "CARD", "OTHER"]),
        reference: zOptText,
        note: zOptText,
        amount: zPositive,
        currency: z.enum(["UZS", "USD"]),
        rate: zOptNumber,
      })
      .parse(formObject(formData));
    if (data.orderId && !(await db.purchaseOrder.findFirst({ where: { id: data.orderId, supplierId } }))) fail("invalid");
    const m = await resolveMoney({ amount: data.amount, currency: data.currency, date: data.date, manualRate: data.rate });
    await db.$transaction(async (tx) => {
      const p = await tx.supplierPayment.create({
        data: {
          supplierId,
          orderId: data.orderId,
          date: toDateOnly(data.date),
          method: data.method,
          reference: data.reference,
          note: data.note,
          ...m,
        },
      });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "SupplierPayment", p.id, "create", null, p);
    });
  });
  if (res?.ok) {
    revalidatePath(`/suppliers/${supplierId}`);
    revalidatePath("/procurement");
    revalidatePath("/");
  }
  return res;
}

export async function deleteSupplierPayment(formData: FormData) {
  const id = String(formData.get("id"));
  let supplierId = "";
  await runAction("supplierPayments.edit", async (user) => {
    const p = await db.supplierPayment.findFirst({ where: { id, supplier: { companyId: user.companyId } } });
    if (!p) fail("invalid");
    supplierId = p.supplierId;
    await db.$transaction(async (tx) => {
      await tx.supplierPayment.delete({ where: { id } });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "SupplierPayment", id, "delete", p, null);
    });
  });
  if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
}

