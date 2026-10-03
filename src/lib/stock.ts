import "server-only";
import { Prisma, type MovementType } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient | typeof db;

/** Signed effect of a movement on a given warehouse's stock. */
export function stockEffect(m: {
  type: MovementType;
  qty: Prisma.Decimal | number;
  warehouseId: string | null;
  toWarehouseId: string | null;
}, warehouseId: string): number {
  const q = Number(m.qty);
  switch (m.type) {
    case "RECEIPT":
    case "RETURN":
      return m.warehouseId === warehouseId ? q : 0;
    case "ADJUSTMENT":
      return m.warehouseId === warehouseId ? q : 0;
    case "ISSUE":
      return m.warehouseId === warehouseId ? -q : 0;
    case "TRANSFER":
      return (m.toWarehouseId === warehouseId ? q : 0) - (m.warehouseId === warehouseId ? q : 0);
    default:
      return 0; // CONSUMPTION happens on site
  }
}

export type StockRow = { productId: string; warehouseId: string; qty: number };

/** Current stock per (product, warehouse) for a company. */
export async function stockLevels(companyId: string, tx: Tx = db): Promise<StockRow[]> {
  const rows = await tx.stockMovement.groupBy({
    by: ["productId", "type", "warehouseId", "toWarehouseId"],
    where: { companyId, productId: { not: null }, type: { not: "CONSUMPTION" } },
    _sum: { qty: true },
  });
  const map = new Map<string, number>();
  const bump = (productId: string, warehouseId: string | null, delta: number) => {
    if (!warehouseId || delta === 0) return;
    const k = `${productId}|${warehouseId}`;
    map.set(k, (map.get(k) ?? 0) + delta);
  };
  for (const r of rows) {
    const q = Number(r._sum.qty ?? 0);
    const pid = r.productId!;
    switch (r.type) {
      case "RECEIPT":
      case "RETURN":
      case "ADJUSTMENT":
        bump(pid, r.warehouseId, q);
        break;
      case "ISSUE":
        bump(pid, r.warehouseId, -q);
        break;
      case "TRANSFER":
        bump(pid, r.warehouseId, -q);
        bump(pid, r.toWarehouseId, q);
        break;
    }
  }
  return [...map.entries()].map(([k, qty]) => {
    const [productId, warehouseId] = k.split("|");
    return { productId, warehouseId, qty };
  });
}

export async function availableQty(companyId: string, productId: string, warehouseId: string, tx: Tx = db) {
  const levels = await stockLevels(companyId, tx);
  return levels.find((l) => l.productId === productId && l.warehouseId === warehouseId)?.qty ?? 0;
}

/** Weighted average purchase cost of a product (UZS and USD per unit) from all receipts. */
export async function averageCost(
  companyId: string,
  productIds: string[],
  tx: Tx = db,
): Promise<Map<string, { uzs: number; usd: number }>> {
  const receipts = await tx.stockMovement.findMany({
    where: { companyId, type: "RECEIPT", productId: { in: productIds } },
    select: { productId: true, qty: true, unitCostUzs: true, unitCostUsd: true },
  });
  const acc = new Map<string, { q: number; uzs: number; usd: number }>();
  for (const r of receipts) {
    const a = acc.get(r.productId!) ?? { q: 0, uzs: 0, usd: 0 };
    const q = Number(r.qty);
    a.q += q;
    a.uzs += q * Number(r.unitCostUzs);
    a.usd += q * Number(r.unitCostUsd);
    acc.set(r.productId!, a);
  }
  const out = new Map<string, { uzs: number; usd: number }>();
  for (const [k, a] of acc) out.set(k, { uzs: a.q ? a.uzs / a.q : 0, usd: a.q ? a.usd / a.q : 0 });
  return out;
}
