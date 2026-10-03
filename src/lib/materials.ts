import "server-only";
import { db } from "./db";

/**
 * Material control for a project: plan -> ordered -> received -> issued -> used.
 * Rows are keyed by catalog product; BOM lines without a product are tracked through direct links.
 */
export type MaterialRow = {
  key: string;
  productId: string | null;
  bomItemIds: string[];
  name: string;
  unit: string;
  planned: number;
  ordered: number;
  received: number;
  issued: number;
  used: number;
  /** issued - used: material sitting on site */
  onSite: number;
  /** used - planned (positive = overuse) */
  variance: number;
  overuse: boolean;
};

const ACTIVE_PO = ["ORDERED", "PARTIAL", "RECEIVED"] as const;

export async function projectMaterials(projectId: string, overuseThreshold = 5): Promise<MaterialRow[]> {
  const [bom, poLines, movements] = await Promise.all([
    db.bomItem.findMany({ where: { projectId }, orderBy: [{ kind: "asc" }, { createdAt: "asc" }] }),
    db.purchaseOrderLine.findMany({
      where: { order: { projectId, status: { in: [...ACTIVE_PO] } } },
      include: { movements: { where: { type: "RECEIPT" }, select: { qty: true } } },
    }),
    db.stockMovement.findMany({
      where: { projectId, type: { in: ["ISSUE", "RETURN", "CONSUMPTION"] } },
      select: { type: true, productId: true, bomItemId: true, name: true, unit: true, qty: true },
    }),
  ]);

  const rows = new Map<string, MaterialRow>();
  const bomKey = new Map<string, string>(); // bomItemId -> row key
  const row = (key: string, init: { productId: string | null; name: string; unit: string }) => {
    let r = rows.get(key);
    if (!r) {
      r = { key, ...init, bomItemIds: [], planned: 0, ordered: 0, received: 0, issued: 0, used: 0, onSite: 0, variance: 0, overuse: false };
      rows.set(key, r);
    }
    return r;
  };
  const keyFor = (productId: string | null, bomItemId: string | null, fallback: string) =>
    productId ?? (bomItemId ? bomKey.get(bomItemId) ?? `bom:${bomItemId}` : fallback);

  for (const b of bom) {
    const key = b.productId ?? `bom:${b.id}`;
    bomKey.set(b.id, key);
    const r = row(key, { productId: b.productId, name: b.name, unit: b.unit });
    r.planned += Number(b.plannedQty);
    r.bomItemIds.push(b.id);
  }
  for (const l of poLines) {
    const r = row(keyFor(l.productId, l.bomItemId, `line:${l.id}`), { productId: l.productId, name: l.name, unit: l.unit });
    r.ordered += Number(l.qty);
    r.received += l.movements.reduce((s, m) => s + Number(m.qty), 0);
  }
  for (const m of movements) {
    const r = row(keyFor(m.productId, m.bomItemId, `name:${m.name}`), { productId: m.productId, name: m.name, unit: m.unit });
    const q = Number(m.qty);
    if (m.type === "ISSUE") r.issued += q;
    if (m.type === "RETURN") r.issued -= q;
    if (m.type === "CONSUMPTION") r.used += q;
  }
  for (const r of rows.values()) {
    r.onSite = r.issued - r.used;
    r.variance = r.used - r.planned;
    r.overuse = r.planned > 0 ? r.used > r.planned * (1 + overuseThreshold / 100) : r.used > 0;
  }
  return [...rows.values()];
}
