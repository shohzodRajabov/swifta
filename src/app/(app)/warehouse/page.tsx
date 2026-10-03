import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { MovementType, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { averageCost, stockLevels } from "@/lib/stock";
import { formatQty } from "@/lib/format";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Button, Card, Empty, Input, Notice, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { MovementForm } from "@/components/movement-form";

const TYPES: MovementType[] = ["RECEIPT", "ISSUE", "RETURN", "TRANSFER", "ADJUSTMENT", "CONSUMPTION"];
const FORM_TYPES = ["ISSUE", "RECEIPT", "RETURN", "TRANSFER", "ADJUSTMENT"] as const;
type Tab = "stock" | "movements" | "new";

export default async function WarehousePage({ searchParams }: PageProps<"/warehouse">) {
  const user = await requirePermission("warehouse.view");
  const sp = (await searchParams) as {
    tab?: string;
    warehouse?: string;
    low?: string;
    type?: string;
    project?: string;
    q?: string;
    form?: string;
  };
  const tab: Tab = sp.tab === "movements" || sp.tab === "new" ? sp.tab : "stock";
  const t = await getTranslations();
  const canEdit = can(user, "warehouse.edit");
  const showMoney = can(user, "finance.view") || canEdit;

  const [warehouses, products, projects] = await Promise.all([
    db.warehouse.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" } }),
    db.project.findMany({
      where: { companyId: user.companyId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const tabs = (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {(["stock", "movements", ...(canEdit ? (["new"] as const) : [])] as Tab[]).map((k) => (
        <Link
          key={k}
          href={k === "stock" ? "/warehouse" : `/warehouse?tab=${k}`}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
            tab === k ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t(k === "stock" ? "warehouse.tabStock" : k === "movements" ? "warehouse.tabMovements" : "warehouse.tabNew")}
        </Link>
      ))}
    </nav>
  );
  const header = <PageHeader title={t("warehouse.title")} />;

  if (tab === "new" && canEdit) {
    const form = (FORM_TYPES as readonly string[]).includes(sp.form ?? "") ? (sp.form as (typeof FORM_TYPES)[number]) : "ISSUE";
    return (
      <>
        {header}
        {tabs}
        <div className="mb-4 flex flex-wrap gap-1">
          {FORM_TYPES.map((f) => (
            <Link
              key={f}
              href={`/warehouse?tab=new&form=${f}`}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm",
                form === f ? "bg-primary text-primary-fg" : "bg-surface text-text hover:bg-surface-2 border border-border",
              )}
            >
              {f === "RECEIPT" ? t("warehouse.manualReceipt") : t(`movementType.${f}`)}
            </Link>
          ))}
        </div>
        <Card className="p-5">
          {products.length === 0 ? (
            <Notice>{t("warehouse.noProductsHint")}</Notice>
          ) : (
            <MovementForm
              key={form}
              type={form}
              items={products.map((p) => ({ id: p.id, label: `${p.sku} · ${p.name} · ${p.unit}` }))}
              warehouses={warehouses.map((w) => ({ id: w.id, label: w.name }))}
              projects={projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
              responsible={user.name}
            />
          )}
        </Card>
      </>
    );
  }

  if (tab === "movements") {
    const where: Prisma.StockMovementWhereInput = { companyId: user.companyId };
    if (sp.type && (TYPES as string[]).includes(sp.type)) where.type = sp.type as MovementType;
    if (sp.project) where.projectId = sp.project;
    if (sp.warehouse) where.OR = [{ warehouseId: sp.warehouse }, { toWarehouseId: sp.warehouse }];
    const moves = await db.stockMovement.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        warehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
        project: { select: { id: true, code: true } },
        poLine: { select: { order: { select: { id: true, number: true } } } },
        createdBy: { select: { name: true } },
      },
    });
    return (
      <>
        {header}
        {tabs}
        <Card>
          <form className="flex flex-wrap gap-2 border-b border-border p-3">
            <Select name="type" defaultValue={sp.type ?? ""} className="max-w-52">
              <option value="">
                {t("warehouse.type")}: {t("common.all")}
              </option>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`movementType.${x}`)}
                </option>
              ))}
            </Select>
            <Select name="warehouse" defaultValue={sp.warehouse ?? ""} className="max-w-48">
              <option value="">
                {t("warehouse.warehouse")}: {t("common.all")}
              </option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <Select name="project" defaultValue={sp.project ?? ""} className="max-w-60">
              <option value="">
                {t("warehouse.project")}: {t("common.all")}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
            <input type="hidden" name="tab" value="movements" />
            <Button type="submit" variant="secondary">
              {t("common.filter")}
            </Button>
          </form>
          {moves.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("common.date")}</Th>
                  <Th>{t("warehouse.type")}</Th>
                  <Th>{t("warehouse.product")}</Th>
                  <Th className="text-right">{t("warehouse.qty")}</Th>
                  <Th>{t("warehouse.warehouse")}</Th>
                  <Th>{t("warehouse.project")}</Th>
                  <Th>{t("warehouse.document")}</Th>
                  <Th>{t("warehouse.responsible")}</Th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <Td className="num">{formatDate(m.date)}</Td>
                    <Td>
                      <Badge tone={m.type === "RECEIPT" || m.type === "RETURN" ? "success" : m.type === "ISSUE" || m.type === "CONSUMPTION" ? "primary" : "neutral"}>
                        {t(`movementType.${m.type}`)}
                      </Badge>
                    </Td>
                    <Td>{m.name}</Td>
                    <Td className="num text-right">
                      {formatQty(Number(m.qty))} <span className="text-muted">{m.unit}</span>
                    </Td>
                    <Td className="text-xs">
                      {m.warehouse?.name ?? "—"}
                      {m.toWarehouse && ` → ${m.toWarehouse.name}`}
                    </Td>
                    <Td className="num text-xs">
                      {m.project ? (
                        <Link href={`/projects/${m.project.id}?tab=materials`} className="hover:text-primary">
                          {m.project.code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-xs">
                      {m.poLine ? (
                        <Link href={`/procurement/${m.poLine.order.id}`} className="num hover:text-primary">
                          {m.poLine.order.number}
                        </Link>
                      ) : null}
                      {m.document && <div>{m.document}</div>}
                      {!m.poLine && !m.document && "—"}
                    </Td>
                    <Td className="text-xs">{m.responsible ?? m.createdBy?.name ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </>
    );
  }

  // Stock tab
  const levels = await stockLevels(user.companyId);
  const avg = await averageCost(user.companyId, [...new Set(levels.map((l) => l.productId))]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const whById = new Map(warehouses.map((w) => [w.id, w]));
  let rows = levels
    .filter((l) => Math.abs(l.qty) > 1e-9 && productById.has(l.productId))
    .filter((l) => !sp.warehouse || l.warehouseId === sp.warehouse)
    .map((l) => {
      const p = productById.get(l.productId)!;
      const cost = avg.get(l.productId) ?? { uzs: 0, usd: 0 };
      return { ...l, product: p, warehouse: whById.get(l.warehouseId), cost, low: l.qty < Number(p.minStock) };
    });
  // Products with a minimum but no stock at all are "low" as well.
  for (const p of products) {
    if (Number(p.minStock) > 0 && !levels.some((l) => l.productId === p.id && l.qty > 0) && !sp.warehouse) {
      rows.push({ productId: p.id, warehouseId: "", qty: 0, product: p, warehouse: undefined, cost: avg.get(p.id) ?? { uzs: 0, usd: 0 }, low: true });
    }
  }
  if (sp.low) rows = rows.filter((r) => r.low);
  if (sp.q) {
    const q = sp.q.toLowerCase();
    rows = rows.filter((r) => r.product.name.toLowerCase().includes(q) || r.product.sku.toLowerCase().includes(q));
  }
  rows.sort((a, b) => Number(b.low) - Number(a.low) || a.product.name.localeCompare(b.product.name));
  const totalValue = rows.reduce(
    (s, r) => ({ uzs: s.uzs + r.qty * r.cost.uzs, usd: s.usd + r.qty * r.cost.usd, count: s.count + 1 }),
    { uzs: 0, usd: 0, count: 0 },
  );

  return (
    <>
      {header}
      {tabs}
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Input name="q" defaultValue={sp.q} placeholder={t("common.search")} className="max-w-xs" />
          <Select name="warehouse" defaultValue={sp.warehouse ?? ""} className="max-w-48">
            <option value="">
              {t("warehouse.warehouse")}: {t("common.all")}
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="low" value="1" defaultChecked={!!sp.low} className="size-4" />
            {t("warehouse.lowOnly")}
          </label>
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
          {showMoney && (
            <div className="ml-auto flex items-center gap-2 text-sm text-muted">
              {t("warehouse.totalValue")}: <Money value={totalValue} size="sm" />
            </div>
          )}
        </form>
        {rows.length === 0 ? (
          <Empty>{t("warehouse.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("warehouse.product")}</Th>
                <Th>{t("warehouse.warehouse")}</Th>
                <Th className="text-right">{t("warehouse.stock")}</Th>
                <Th className="text-right">{t("warehouse.minStock")}</Th>
                {showMoney && <Th className="text-right">{t("warehouse.avgCost")}</Th>}
                {showMoney && <Th className="text-right">{t("warehouse.value")}</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.productId}|${r.warehouseId}`}>
                  <Td>
                    <span className="font-medium">{r.product.name}</span>
                    {r.low && (
                      <Badge tone="danger" className="ml-2">
                        {t("warehouse.low")}
                      </Badge>
                    )}
                    <div className="num text-xs text-muted">{r.product.sku}</div>
                  </Td>
                  <Td>{r.warehouse?.name ?? "—"}</Td>
                  <Td className="num text-right font-medium">
                    {formatQty(r.qty)} <span className="text-muted">{r.product.unit}</span>
                  </Td>
                  <Td className="num text-right text-muted">{Number(r.product.minStock) ? formatQty(Number(r.product.minStock)) : "—"}</Td>
                  {showMoney && (
                    <Td className="text-right">
                      <Money size="sm" value={{ uzs: r.cost.uzs, usd: r.cost.usd, count: 1 }} />
                    </Td>
                  )}
                  {showMoney && (
                    <Td className="text-right">
                      <Money size="sm" value={{ uzs: r.qty * r.cost.uzs, usd: r.qty * r.cost.usd, count: 1 }} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
