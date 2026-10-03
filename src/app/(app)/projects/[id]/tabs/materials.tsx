import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { projectMaterials } from "@/lib/materials";
import { formatQty, formatPercent } from "@/lib/format";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Card, CardHeader, Empty, LinkButton, Table, Td, Th } from "@/components/ui";
import { PoStatusBadge } from "@/components/po-bits";
import { MovementForm } from "@/components/movement-form";

export async function MaterialsTab({ user, projectId }: { user: CurrentUser; projectId: string }) {
  const t = await getTranslations();
  const company = await db.company.findUnique({ where: { id: user.companyId }, select: { overuseThreshold: true } });
  const threshold = Number(company?.overuseThreshold ?? 5);
  const [rows, orders, warehouses] = await Promise.all([
    projectMaterials(projectId, threshold),
    db.purchaseOrder.findMany({
      where: { projectId },
      include: { supplier: { select: { name: true } } },
      orderBy: { orderDate: "desc" },
    }),
    db.warehouse.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" } }),
  ]);
  const canConsume = can(user, "materials.consume");
  const canMove = can(user, "warehouse.edit");
  const wh = warehouses.map((w) => ({ id: w.id, label: w.name }));
  const productRows = rows.filter((r) => r.productId);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={t("materials.title")}
          action={
            can(user, "procurement.edit") && (
              <LinkButton href={`/procurement/new?project=${projectId}`} variant="secondary" className="h-8">
                {t("procurement.createForProject")}
              </LinkButton>
            )
          }
        />
        {rows.length === 0 ? (
          <Empty>{t("materials.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("materials.pickRow")}</Th>
                <Th className="text-right">{t("materials.planned")}</Th>
                <Th className="text-right">{t("materials.ordered")}</Th>
                <Th className="text-right">{t("materials.received")}</Th>
                <Th className="text-right">{t("materials.issued")}</Th>
                <Th className="text-right">{t("materials.used")}</Th>
                <Th className="text-right">{t("materials.onSite")}</Th>
                <Th className="text-right">{t("materials.variance")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={cn(r.overuse && "bg-danger-soft/40")}>
                  <Td className="font-medium">
                    {r.name} <span className="text-xs font-normal text-muted">{r.unit}</span>
                  </Td>
                  <Td className="num text-right">{formatQty(r.planned)}</Td>
                  <Td className={cn("num text-right", r.ordered < r.planned && "text-warning")}>{formatQty(r.ordered)}</Td>
                  <Td className="num text-right">{formatQty(r.received)}</Td>
                  <Td className="num text-right">{formatQty(r.issued)}</Td>
                  <Td className="num text-right font-medium">{formatQty(r.used)}</Td>
                  <Td className="num text-right">{formatQty(r.onSite)}</Td>
                  <Td className="num text-right">
                    {r.used === 0 ? (
                      <span className="text-muted">—</span>
                    ) : r.variance > 0 ? (
                      <span className={r.overuse ? "font-semibold text-danger" : "text-warning"}>
                        {r.overuse && <AlertTriangle className="mr-1 inline size-3.5" aria-hidden />}+{formatQty(r.variance)}
                        <div className="text-[11px] font-normal">
                          {t("materials.overuse")} {r.planned > 0 && formatPercent((r.variance / r.planned) * 100)}
                        </div>
                      </span>
                    ) : (
                      // Below plan is normal while work is in progress.
                      <span className="text-muted">{formatQty(r.variance)}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {canConsume && rows.length > 0 && (
        <Card>
          <CardHeader title={t("materials.recordUse")} />
          <div className="p-5">
            <MovementForm
              type="CONSUMPTION"
              projectId={projectId}
              items={rows.map((r) => ({
                id: r.productId ?? (r.key.startsWith("bom:") ? r.key : ""),
                label: `${r.name} · ${r.unit} (${t("materials.onSite")}: ${formatQty(r.onSite)})`,
              })).filter((i) => i.id)}
              warehouses={wh}
              responsible={user.name}
            />
          </div>
        </Card>
      )}

      {canMove && productRows.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title={t("materials.issueToProject")} />
            <div className="p-5">
              <MovementForm
                type="ISSUE"
                projectId={projectId}
                items={productRows.map((r) => ({ id: r.productId!, label: `${r.name} · ${r.unit}` }))}
                warehouses={wh}
                responsible={user.name}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title={t("materials.returnToStock")} />
            <div className="p-5">
              <MovementForm
                type="RETURN"
                projectId={projectId}
                items={productRows
                  .filter((r) => r.onSite > 0)
                  .map((r) => ({ id: r.productId!, label: `${r.name} · ${formatQty(r.onSite)} ${r.unit}` }))}
                warehouses={wh}
                responsible={user.name}
              />
            </div>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader title={t("suppliers.orders")} />
        {orders.length === 0 ? (
          <Empty>{t("procurement.empty")}</Empty>
        ) : (
          <Table>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <Td>
                    <Link href={`/procurement/${o.id}`} className="num font-medium hover:text-primary">
                      {o.number}
                    </Link>
                  </Td>
                  <Td>{o.supplier.name}</Td>
                  <Td className="num">{formatDate(o.orderDate)}</Td>
                  <Td>
                    <PoStatusBadge status={o.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {rows.some((r) => r.overuse) && (
        <Badge tone="danger" className="self-start">
          {t("materials.overuse")}: {rows.filter((r) => r.overuse).length}
        </Badge>
      )}
    </div>
  );
}
