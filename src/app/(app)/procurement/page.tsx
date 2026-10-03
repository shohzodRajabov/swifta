import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import type { Prisma, PurchaseOrderStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { projectMaterials } from "@/lib/materials";
import { formatQty } from "@/lib/format";
import { cn, formatDate, toDateOnly } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { PoStatusBadge } from "@/components/po-bits";

const STATUSES: PurchaseOrderStatus[] = ["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"];
type Tab = "orders" | "needs" | "prices";

export default async function ProcurementPage({ searchParams }: PageProps<"/procurement">) {
  const user = await requirePermission("procurement.view");
  const sp = (await searchParams) as { tab?: string; status?: string; supplier?: string; project?: string; product?: string };
  const tab: Tab = sp.tab === "needs" || sp.tab === "prices" ? sp.tab : "orders";
  const t = await getTranslations();
  const canEdit = can(user, "procurement.edit");
  const showMoney = can(user, "finance.view") || canEdit || can(user, "supplierPayments.edit");

  const tabs = (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {(["orders", "needs", "prices"] as const).map((k) => (
        <Link
          key={k}
          href={k === "orders" ? "/procurement" : `/procurement?tab=${k}`}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
            tab === k ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t(k === "orders" ? "procurement.tabOrders" : k === "needs" ? "procurement.tabNeeds" : "procurement.tabPrices")}
        </Link>
      ))}
    </nav>
  );
  const header = (
    <PageHeader
      title={t("procurement.title")}
      actions={
        canEdit && (
          <LinkButton href="/procurement/new">
            <Plus className="size-4" aria-hidden />
            {t("procurement.new")}
          </LinkButton>
        )
      }
    />
  );

  if (tab === "needs") {
    const projects = await db.project.findMany({
      where: { companyId: user.companyId, status: "ACTIVE", bomItems: { some: {} } },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, name: true },
    });
    const groups = (
      await Promise.all(
        projects.map(async (p) => ({
          p,
          rows: (await projectMaterials(p.id)).filter((r) => r.planned - r.ordered > 1e-9),
        })),
      )
    ).filter((g) => g.rows.length > 0);
    return (
      <>
        {header}
        {tabs}
        {groups.length === 0 ? (
          <Card>
            <Empty>{t("procurement.needsEmpty")}</Empty>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(({ p, rows }) => (
              <Card key={p.id}>
                <CardHeader
                  title={
                    <Link href={`/projects/${p.id}?tab=materials`} className="hover:text-primary">
                      <span className="num text-muted">{p.code}</span> {p.name}
                    </Link>
                  }
                  action={
                    canEdit && (
                      <LinkButton href={`/procurement/new?project=${p.id}`} variant="secondary" className="h-8">
                        {t("procurement.createForProject")}
                      </LinkButton>
                    )
                  }
                />
                <Table>
                  <thead>
                    <tr>
                      <Th>{t("procurement.product")}</Th>
                      <Th className="text-right">{t("materials.planned")}</Th>
                      <Th className="text-right">{t("materials.ordered")}</Th>
                      <Th className="text-right">{t("procurement.shortfall")}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <Td>{r.name}</Td>
                        <Td className="num text-right">{formatQty(r.planned)}</Td>
                        <Td className="num text-right">{formatQty(r.ordered)}</Td>
                        <Td className="num text-right font-medium text-warning">
                          {formatQty(r.planned - r.ordered)} <span className="text-muted">{r.unit}</span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            ))}
          </div>
        )}
      </>
    );
  }

  if (tab === "prices") {
    const prices = await db.supplierPrice.findMany({
      where: { supplier: { companyId: user.companyId } },
      include: { supplier: { select: { id: true, name: true } }, product: { select: { id: true, sku: true, name: true, unit: true } } },
      orderBy: [{ date: "desc" }],
    });
    // Latest quote per (product, supplier)
    const latest = new Map<string, (typeof prices)[number]>();
    for (const p of prices) {
      const k = `${p.productId}|${p.supplierId}`;
      if (!latest.has(k)) latest.set(k, p);
    }
    const byProduct = new Map<string, (typeof prices)[number][]>();
    for (const p of latest.values()) byProduct.set(p.productId, [...(byProduct.get(p.productId) ?? []), p]);
    const selected = sp.product ? (byProduct.get(sp.product) ?? []).sort((a, b) => Number(a.priceUzs) - Number(b.priceUzs)) : [];
    const products = [...byProduct.values()].map((list) => list[0].product);

    return (
      <>
        {header}
        {tabs}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title={t("procurement.tabPrices")} />
            {products.length === 0 ? (
              <Empty>{t("common.noData")}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("procurement.product")}</Th>
                    <Th className="text-right">{t("procurement.suppliersCount")}</Th>
                    <Th className="text-right">{t("procurement.minPrice")}</Th>
                    <Th className="text-right">{t("procurement.maxPrice")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const list = byProduct.get(p.id)!;
                    const sorted = [...list].sort((a, b) => Number(a.priceUzs) - Number(b.priceUzs));
                    const lo = sorted[0];
                    const hi = sorted[sorted.length - 1];
                    return (
                      <tr key={p.id} className={cn(sp.product === p.id && "bg-primary-soft/50")}>
                        <Td>
                          <Link href={`/procurement?tab=prices&product=${p.id}`} className="font-medium hover:text-primary">
                            {p.name}
                          </Link>
                          <div className="num text-xs text-muted">{p.sku}</div>
                        </Td>
                        <Td className="num text-right">{list.length}</Td>
                        <Td className="text-right">
                          <Money size="sm" value={{ uzs: Number(lo.priceUzs), usd: Number(lo.priceUsd), rate: Number(lo.fxRate), fxDate: lo.date.toISOString(), source: "CBU", currency: lo.currency, original: Number(lo.price) }} />
                        </Td>
                        <Td className="text-right">
                          <Money size="sm" value={{ uzs: Number(hi.priceUzs), usd: Number(hi.priceUsd), rate: Number(hi.fxRate), fxDate: hi.date.toISOString(), source: "CBU", currency: hi.currency, original: Number(hi.price) }} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
          <Card className="self-start">
            <CardHeader title={selected[0]?.product.name ?? t("procurement.comparePick")} />
            {selected.length === 0 ? (
              <Empty>{t("procurement.comparePick")}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("procurement.supplier")}</Th>
                    <Th>{t("common.date")}</Th>
                    <Th>{t("suppliers.leadTimeDays")}</Th>
                    <Th className="text-right">{t("procurement.unitPrice")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {selected.map((p, i) => (
                    <tr key={p.id}>
                      <Td>
                        <Link href={`/suppliers/${p.supplier.id}`} className="hover:text-primary">
                          {p.supplier.name}
                        </Link>
                        {i === 0 && (
                          <Badge tone="success" className="ml-2">
                            {t("procurement.best")}
                          </Badge>
                        )}
                      </Td>
                      <Td className="num">{formatDate(p.date)}</Td>
                      <Td className="num">{p.leadTimeDays ?? "—"}</Td>
                      <Td className="text-right">
                        <Money size="sm" value={{ uzs: Number(p.priceUzs), usd: Number(p.priceUsd), rate: Number(p.fxRate), fxDate: p.date.toISOString(), source: "CBU", currency: p.currency, original: Number(p.price) }} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </>
    );
  }

  const where: Prisma.PurchaseOrderWhereInput = { companyId: user.companyId };
  if (sp.status && (STATUSES as string[]).includes(sp.status)) where.status = sp.status as PurchaseOrderStatus;
  if (sp.supplier) where.supplierId = sp.supplier;
  if (sp.project) where.projectId = sp.project;
  const [orders, suppliers, projects] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      include: { supplier: { select: { name: true } }, project: { select: { code: true, name: true } } },
      orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
      take: 300,
    }),
    db.supplier.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "desc" }, select: { id: true, code: true, name: true } }),
  ]);
  const today = toDateOnly(new Date());

  return (
    <>
      {header}
      {tabs}
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-border p-3">
          <Select name="status" defaultValue={sp.status ?? ""} className="max-w-48">
            <option value="">
              {t("procurement.status")}: {t("common.all")}
            </option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`poStatus.${s}`)}
              </option>
            ))}
          </Select>
          <Select name="supplier" defaultValue={sp.supplier ?? ""} className="max-w-56">
            <option value="">
              {t("procurement.supplier")}: {t("common.all")}
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select name="project" defaultValue={sp.project ?? ""} className="max-w-64">
            <option value="">
              {t("procurement.project")}: {t("common.all")}
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
        </form>
        {orders.length === 0 ? (
          <Empty>{t("procurement.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("procurement.number")}</Th>
                <Th>{t("procurement.supplier")}</Th>
                <Th>{t("procurement.project")}</Th>
                <Th>{t("procurement.orderDate")}</Th>
                <Th>{t("procurement.expectedDate")}</Th>
                <Th>{t("procurement.status")}</Th>
                {showMoney && <Th className="text-right">{t("procurement.total")}</Th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const overdue = !!o.expectedDate && o.expectedDate < today && (o.status === "ORDERED" || o.status === "PARTIAL");
                return (
                  <tr key={o.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/procurement/${o.id}`} className="num font-medium hover:text-primary">
                        {o.number}
                      </Link>
                    </Td>
                    <Td>{o.supplier.name}</Td>
                    <Td>{o.project ? `${o.project.code} · ${o.project.name}` : <span className="text-muted">{t("procurement.stockOrder")}</span>}</Td>
                    <Td className="num">{formatDate(o.orderDate)}</Td>
                    <Td className="num">
                      {formatDate(o.expectedDate)}
                      {overdue && (
                        <Badge tone="danger" className="ml-1">
                          {t("procurement.overdue")}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <PoStatusBadge status={o.status} />
                    </Td>
                    {showMoney && (
                      <Td className="text-right">
                        <Money size="sm" value={{ uzs: Number(o.totalUzs), usd: Number(o.totalUsd), rate: Number(o.fxRate), fxDate: o.fxDate.toISOString(), source: o.fxSource, currency: o.currency, original: Number(o.totalAmount) }} />
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
