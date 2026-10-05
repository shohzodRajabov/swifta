"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getUsdRate } from "@/lib/fx";
import { unitCosts } from "@/lib/stock";
import { toDateOnly } from "@/lib/utils";
import { fail, formObject, runAction, zDate, zOptDate, zOptId, zOptNumber, zOptText, zText, type ActionState } from "@/lib/action";
import type { CurrentUser } from "@/lib/auth";

const lineSchema = z.object({
  productId: z.string().nullable().optional(),
  bomItemId: z.string().nullable().optional(),
  name: z.string().trim().optional().default(""),
  unit: z.string().trim().optional().default(""),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
});

const orderSchema = z.object({
  supplierId: zText,
  projectId: zOptId,
  warehouseId: zText,
  orderDate: zDate,
  expectedDate: zOptDate,
  paymentDueDate: zOptDate,
  invoiceNumber: zOptText,
  note: zOptText,
  currency: z.enum(["UZS", "USD"]),
  rate: zOptNumber,
  lines: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v) : v), z.array(lineSchema)),
});

const ctxOf = (u: CurrentUser) => ({ companyId: u.companyId, userId: u.id });

function refresh(id?: string) {
  revalidatePath("/procurement");
  if (id) revalidatePath(`/procurement/${id}`);
  revalidatePath("/warehouse");
  revalidatePath("/");
}

export async function createOrder(_: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction("procurement.edit", async (user) => {
    const data = orderSchema.parse(formObject(formData));
    const lines = data.lines.filter((l) => l.qty > 0);
    if (lines.length === 0) fail("linesRequired");

    const [supplier, warehouse, project] = await Promise.all([
      db.supplier.findFirst({ where: { id: data.supplierId, companyId: user.companyId } }),
      db.warehouse.findFirst({ where: { id: data.warehouseId, companyId: user.companyId } }),
      data.projectId ? db.project.findFirst({ where: { id: data.projectId, companyId: user.companyId } }) : null,
    ]);
    if (!supplier || !warehouse || (data.projectId && !project)) fail("invalid");

    // Resolve names/units from the catalog and validate BOM links.
    const products = await db.product.findMany({
      where: { companyId: user.companyId, id: { in: lines.map((l) => l.productId).filter((x): x is string => !!x) } },
    });
    const bomIds = lines.map((l) => l.bomItemId).filter((x): x is string => !!x);
    const boms = bomIds.length ? await db.bomItem.findMany({ where: { id: { in: bomIds }, projectId: data.projectId ?? "-" } }) : [];

    const quote =
      data.rate && data.rate > 0
        ? { rate: new Prisma.Decimal(data.rate), date: toDateOnly(data.orderDate), source: "MANUAL" }
        : await getUsdRate(data.orderDate);
    const toUzs = (v: Prisma.Decimal) => (data.currency === "UZS" ? v : v.mul(quote.rate));
    const toUsd = (v: Prisma.Decimal) => (data.currency === "USD" ? v : v.div(quote.rate));

    const prepared = lines.map((l, i) => {
      const product = l.productId ? products.find((p) => p.id === l.productId) : undefined;
      if (l.productId && !product) fail("invalid");
      const bom = l.bomItemId ? boms.find((b) => b.id === l.bomItemId) : undefined;
      const name = l.name || product?.name || bom?.name || "";
      const unit = l.unit || product?.unit || bom?.unit || "";
      if (!name || !unit) fail("required");
      const qty = new Prisma.Decimal(l.qty);
      const unitPrice = new Prisma.Decimal(l.unitPrice);
      const amount = qty.mul(unitPrice).toDecimalPlaces(2);
      return {
        productId: product?.id ?? null,
        bomItemId: bom?.id ?? null,
        name,
        unit,
        qty,
        unitPrice,
        amount,
        amountUzs: toUzs(amount).toDecimalPlaces(2),
        amountUsd: toUsd(amount).toDecimalPlaces(2),
        sortOrder: i,
      };
    });
    const sum = (k: "amount" | "amountUzs" | "amountUsd") =>
      prepared.reduce((s, l) => s.add(l[k]), new Prisma.Decimal(0));

    const year = data.orderDate.getFullYear();
    const order = await db.$transaction(async (tx) => {
      const count = await tx.purchaseOrder.count({ where: { companyId: user.companyId, number: { startsWith: `PO-${year}-` } } });
      const o = await tx.purchaseOrder.create({
        data: {
          companyId: user.companyId,
          number: `PO-${year}-${String(count + 1).padStart(3, "0")}`,
          supplierId: data.supplierId,
          projectId: data.projectId,
          warehouseId: data.warehouseId,
          orderDate: toDateOnly(data.orderDate),
          expectedDate: data.expectedDate,
          paymentDueDate: data.paymentDueDate,
          invoiceNumber: data.invoiceNumber,
          note: data.note,
          createdById: user.id,
          currency: data.currency,
          fxRate: quote.rate,
          fxDate: quote.date,
          fxSource: quote.source,
          totalAmount: sum("amount"),
          totalUzs: sum("amountUzs"),
          totalUsd: sum("amountUsd"),
          lines: { create: prepared },
        },
        include: { lines: true },
      });
      await audit(tx, ctxOf(user), "PurchaseOrder", o.id, "create", null, o);
      return o;
    });
    id = order.id;
  });
  if (res?.ok) {
    refresh();
    redirect(`/procurement/${id}`);
  }
  return res;
}

async function ownOrder(user: CurrentUser, id: string) {
  const o = await db.purchaseOrder.findFirst({ where: { id, companyId: user.companyId }, include: { lines: true } });
  if (!o) fail("invalid");
  return o;
}

export async function setOrderStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const status = z.enum(["ORDERED", "CANCELLED"]).parse(formData.get("status"));
  await runAction("procurement.edit", async (user) => {
    const o = await ownOrder(user, id);
    if (status === "ORDERED" && o.status !== "DRAFT") fail("invalid");
    if (status === "CANCELLED") {
      const received = await db.stockMovement.count({ where: { poLine: { orderId: id } } });
      if (received > 0) fail("inUse");
    }
    await db.$transaction(async (tx) => {
      await tx.purchaseOrder.update({ where: { id }, data: { status } });
      await audit(tx, ctxOf(user), "PurchaseOrder", id, "update", { status: o.status }, { status });
    });
  });
  refresh(id);
}

export async function deleteDraftOrder(formData: FormData) {
  const id = String(formData.get("id"));
  let ok = false;
  await runAction("procurement.edit", async (user) => {
    const o = await ownOrder(user, id);
    if (o.status !== "DRAFT") fail("inUse");
    await db.$transaction(async (tx) => {
      await tx.purchaseOrder.delete({ where: { id } });
      await audit(tx, ctxOf(user), "PurchaseOrder", id, "delete", o, null);
    });
    ok = true;
  });
  if (ok) {
    refresh();
    redirect("/procurement");
  }
}

/** Receive goods for an order. Field `qty_<lineId>` per line; optional direct issue to the project. */
export async function receiveOrder(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("warehouse.edit", async (user) => {
    const o = await ownOrder(user, id);
    if (o.status !== "ORDERED" && o.status !== "PARTIAL") fail("invalid");
    const { date, document, note, issue, responsible } = z
      .object({
        date: zDate,
        document: zOptText,
        note: zOptText,
        responsible: zOptText,
        issue: z.preprocess((v) => v === "on", z.boolean()),
      })
      .parse({ issue: formData.get("issue") ?? "", ...formObject(formData) });

    const already = await db.stockMovement.groupBy({
      by: ["poLineId"],
      where: { type: "RECEIPT", poLine: { orderId: id } },
      _sum: { qty: true },
    });
    const receivedOf = (lineId: string) => Number(already.find((a) => a.poLineId === lineId)?._sum.qty ?? 0);

    const moves = o.lines
      .map((l) => {
        const raw = String(formData.get(`qty_${l.id}`) ?? "").replace(",", ".").trim();
        const qty = raw ? Number(raw) : 0;
        if (!isFinite(qty) || qty < 0) fail("invalid");
        return { line: l, qty };
      })
      .filter((m) => m.qty > 0);
    if (moves.length === 0) fail("required");

    await db.$transaction(async (tx) => {
      for (const { line, qty } of moves) {
        const q = new Prisma.Decimal(qty);
        const costs = unitCosts(line.amountUzs.div(line.qty), line.amountUsd.div(line.qty), Number(o.vatRate));
        const base = {
          companyId: user.companyId,
          date: toDateOnly(date),
          productId: line.productId,
          bomItemId: line.bomItemId,
          name: line.name,
          unit: line.unit,
          qty: q,
          ...costs,
          document,
          note,
          responsible,
          createdById: user.id,
        };
        const r = await tx.stockMovement.create({
          data: { ...base, type: "RECEIPT", warehouseId: o.warehouseId, poLineId: line.id, projectId: o.projectId },
        });
        await audit(tx, ctxOf(user), "StockMovement", r.id, "create", null, r);
        if (issue && o.projectId) {
          const i = await tx.stockMovement.create({
            data: { ...base, type: "ISSUE", warehouseId: o.warehouseId, projectId: o.projectId },
          });
          await audit(tx, ctxOf(user), "StockMovement", i.id, "create", null, i);
        }
      }
      const fully = o.lines.every((l) => {
        const extra = moves.find((m) => m.line.id === l.id)?.qty ?? 0;
        return receivedOf(l.id) + extra >= Number(l.qty) - 1e-9;
      });
      const status = fully ? "RECEIVED" : "PARTIAL";
      if (status !== o.status) {
        await tx.purchaseOrder.update({ where: { id }, data: { status } });
        await audit(tx, ctxOf(user), "PurchaseOrder", id, "update", { status: o.status }, { status });
      }
    });
  });
  if (res?.ok) {
    refresh(id);
    const o = await db.purchaseOrder.findUnique({ where: { id }, select: { projectId: true } });
    if (o?.projectId) revalidatePath(`/projects/${o.projectId}`);
  }
  return res;
}
