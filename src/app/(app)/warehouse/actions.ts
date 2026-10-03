"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveMoney } from "@/lib/fx";
import { availableQty, averageCost } from "@/lib/stock";
import { projectMaterials } from "@/lib/materials";
import { toDateOnly } from "@/lib/utils";
import { fail, formObject, runAction, zDate, zOptId, zOptNumber, zOptText, type ActionState } from "@/lib/action";
import type { Permission } from "@/lib/permissions";

type Type = "RECEIPT" | "ISSUE" | "RETURN" | "TRANSFER" | "ADJUSTMENT" | "CONSUMPTION";

const schema = z.object({
  date: zDate,
  item: z.string().min(1), // productId, or "bom:<id>" for consumption of non-catalog BOM lines
  qty: zOptNumber,
  counted: zOptNumber,
  warehouseId: zOptId,
  toWarehouseId: zOptId,
  projectId: zOptId,
  responsible: zOptText,
  document: zOptText,
  note: zOptText,
  amount: zOptNumber,
  currency: z.enum(["UZS", "USD"]).default("UZS"),
  rate: zOptNumber,
});

/** Records a stock / material movement. Used by the warehouse page and the project materials tab. */
export async function recordMovement(type: Type, _: ActionState, formData: FormData): Promise<ActionState> {
  const permission: Permission = type === "CONSUMPTION" ? "materials.consume" : "warehouse.edit";
  let projectId: string | null = null;
  const res = await runAction(permission, async (user) => {
    const d = schema.parse(formObject(formData));
    const companyId = user.companyId;
    const date = toDateOnly(d.date);

    // Resolve the item
    let productId: string | null = null;
    let bomItemId: string | null = null;
    let name = "";
    let unit = "";
    if (d.item.startsWith("bom:")) {
      if (type !== "CONSUMPTION") fail("invalid");
      const bom = await db.bomItem.findFirst({ where: { id: d.item.slice(4), project: { companyId } } });
      if (!bom) fail("invalid");
      bomItemId = bom.id;
      name = bom.name;
      unit = bom.unit;
    } else {
      const p = await db.product.findFirst({ where: { id: d.item, companyId } });
      if (!p) fail("invalid");
      productId = p.id;
      name = p.name;
      unit = p.unit;
    }

    const own = async (model: "warehouse" | "project", id: string | null, required: boolean) => {
      if (!id) {
        if (required) fail("required");
        return;
      }
      const found =
        model === "warehouse"
          ? await db.warehouse.findFirst({ where: { id, companyId } })
          : await db.project.findFirst({ where: { id, companyId } });
      if (!found) fail("invalid");
    };
    const needsWarehouse = type !== "CONSUMPTION";
    const needsProject = type === "ISSUE" || type === "RETURN" || type === "CONSUMPTION";
    await own("warehouse", d.warehouseId, needsWarehouse);
    await own("warehouse", d.toWarehouseId, type === "TRANSFER");
    await own("project", d.projectId, needsProject);
    if (type === "TRANSFER" && d.warehouseId === d.toWarehouseId) fail("invalid");
    projectId = d.projectId;

    let qty: number;
    if (type === "ADJUSTMENT") {
      if (d.counted === null || d.counted < 0) fail("required");
      const current = await availableQty(companyId, productId!, d.warehouseId!);
      qty = d.counted - current;
      if (Math.abs(qty) < 1e-9) return; // nothing to correct
    } else {
      if (!d.qty || d.qty <= 0) fail("required");
      qty = d.qty;
    }

    if (type === "ISSUE" || type === "TRANSFER") {
      const available = await availableQty(companyId, productId!, d.warehouseId!);
      if (available + 1e-9 < qty) fail("notEnough");
    }
    if (type === "RETURN") {
      const rows = await projectMaterials(d.projectId!);
      const onSite = rows.find((r) => r.productId === productId)?.onSite ?? 0;
      if (onSite + 1e-9 < qty) fail("notEnough");
    }

    // Unit cost: purchase price for manual receipts, weighted average otherwise.
    let unitCostUzs = new Prisma.Decimal(0);
    let unitCostUsd = new Prisma.Decimal(0);
    if (type === "RECEIPT") {
      if (d.amount === null || d.amount < 0) fail("required");
      const m = await resolveMoney({ amount: d.amount, currency: d.currency, date, manualRate: d.rate });
      unitCostUzs = m.amountUzs;
      unitCostUsd = m.amountUsd;
    } else if (productId) {
      const avg = (await averageCost(companyId, [productId])).get(productId);
      if (avg) {
        unitCostUzs = new Prisma.Decimal(avg.uzs.toFixed(2));
        unitCostUsd = new Prisma.Decimal(avg.usd.toFixed(4));
      }
    }

    await db.$transaction(async (tx) => {
      const m = await tx.stockMovement.create({
        data: {
          companyId,
          type,
          date,
          productId,
          bomItemId,
          name,
          unit,
          qty: new Prisma.Decimal(qty),
          warehouseId: needsWarehouse ? d.warehouseId : null,
          toWarehouseId: type === "TRANSFER" ? d.toWarehouseId : null,
          projectId: needsProject ? d.projectId : null,
          unitCostUzs,
          unitCostUsd,
          responsible: d.responsible,
          document: d.document,
          note: d.note,
          createdById: user.id,
        },
      });
      await audit(tx, { companyId, userId: user.id }, "StockMovement", m.id, "create", null, m);
    });
  });
  if (res?.ok) {
    revalidatePath("/warehouse");
    revalidatePath("/");
    if (projectId) revalidatePath(`/projects/${projectId}`);
  }
  return res;
}
