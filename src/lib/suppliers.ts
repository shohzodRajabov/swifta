import "server-only";
import { db } from "./db";
import type { Amount } from "./metrics";

export type SupplierBalance = {
  ordered: Amount; // commitment: active purchase orders
  received: Amount; // value of goods received
  paid: Amount;
  /** received - paid (negative = prepayment) */
  debt: Amount;
};

const zero = (): Amount => ({ uzs: 0, usd: 0, count: 0 });

export async function supplierBalances(companyId: string, supplierIds?: string[]): Promise<Map<string, SupplierBalance>> {
  const filter = supplierIds ? { in: supplierIds } : undefined;
  const [orders, receipts, payments] = await Promise.all([
    db.purchaseOrder.groupBy({
      by: ["supplierId"],
      where: { companyId, supplierId: filter, status: { in: ["ORDERED", "PARTIAL", "RECEIVED"] } },
      _sum: { totalUzs: true, totalUsd: true },
      _count: true,
    }),
    db.stockMovement.findMany({
      where: { companyId, type: "RECEIPT", poLine: { order: { supplierId: filter } } },
      select: { qty: true, unitCostUzs: true, unitCostUsd: true, poLine: { select: { order: { select: { supplierId: true } } } } },
    }),
    db.supplierPayment.groupBy({
      by: ["supplierId"],
      where: { supplier: { companyId }, supplierId: filter },
      _sum: { amountUzs: true, amountUsd: true },
      _count: true,
    }),
  ]);

  const out = new Map<string, SupplierBalance>();
  const get = (id: string) => {
    let b = out.get(id);
    if (!b) {
      b = { ordered: zero(), received: zero(), paid: zero(), debt: zero() };
      out.set(id, b);
    }
    return b;
  };
  for (const o of orders) {
    get(o.supplierId).ordered = { uzs: Number(o._sum.totalUzs ?? 0), usd: Number(o._sum.totalUsd ?? 0), count: o._count };
  }
  for (const r of receipts) {
    const b = get(r.poLine!.order.supplierId);
    const q = Number(r.qty);
    b.received = {
      uzs: b.received.uzs + q * Number(r.unitCostUzs),
      usd: b.received.usd + q * Number(r.unitCostUsd),
      count: b.received.count + 1,
    };
  }
  for (const p of payments) {
    get(p.supplierId).paid = { uzs: Number(p._sum.amountUzs ?? 0), usd: Number(p._sum.amountUsd ?? 0), count: p._count };
  }
  for (const b of out.values()) {
    b.debt = { uzs: b.received.uzs - b.paid.uzs, usd: b.received.usd - b.paid.usd, count: b.received.count + b.paid.count };
  }
  return out;
}
