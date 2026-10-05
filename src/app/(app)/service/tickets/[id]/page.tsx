import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ServiceTicketStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatNumber, formatQty } from "@/lib/format";
import { slaHours, slaStatus, type Prio } from "@/lib/sla";
import { formatDate, formatDateTime } from "@/lib/utils";
import { stockLevels } from "@/lib/stock";
import { Badge, Card, CardHeader, Empty, Field, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { PriorityBadge } from "@/components/project-bits";
import { SlaBadge, TicketStatusBadge } from "@/components/service-bits";
import { Attachments } from "@/components/attachments";
import { ticketCost } from "@/server/service/service";
import { addPart, removePart, setTicketStatus, updateTicket } from "../../actions";

const FLOW: Record<ServiceTicketStatus, ServiceTicketStatus[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: ["NEW"],
};

export default async function TicketPage({ params }: PageProps<"/service/tickets/[id]">) {
  const { id } = await params;
  const user = await requirePermission("service.view");
  const ticket = await db.serviceTicket.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      client: { select: { id: true, name: true, phone: true, contactPerson: true } },
      project: { select: { id: true, name: true, warrantyEnd: true, address: true } },
      serviceContract: { select: { id: true, number: true, slaResponseHours: true, slaResolveHours: true, slaText: true } },
      responsible: { select: { name: true } },
      parts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();
  const t = await getTranslations();
  const edit = can(user, "service.edit");
  const showMoney = can(user, "finance.view") || edit;
  const sla = slaStatus(ticket, slaHours(ticket.priority as Prio, ticket.serviceContract));
  const cost = ticketCost(ticket);
  const [users, products, warehouses, levels] = edit
    ? await Promise.all([
        db.user.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.product.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true } }),
        db.warehouse.findMany({ where: { companyId: user.companyId, active: true }, select: { id: true, name: true } }),
        stockLevels(user.companyId),
      ])
    : [[], [], [], []];
  const inStock = products.filter((p) => levels.some((l) => l.productId === p.id && l.qty > 0));
  const closed = ticket.status === "CLOSED" || ticket.status === "CANCELLED";

  return (
    <>
      <PageHeader
        title={
          <>
            <span className="num text-muted">S-{ticket.number}</span> {ticket.title}
          </>
        }
        back={{ href: "/service", label: t("service.title") }}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} />
            {ticket.isWarranty && <Badge tone="success">{t("service.warranty")}</Badge>}
            {ticket.planned && <Badge tone="primary">{t("service.planned")}</Badge>}
            {ticket.priority !== "MEDIUM" && <PriorityBadge priority={ticket.priority} />}
            {!ticket.planned && <SlaBadge state={sla.response} kind="response" />}
            {!ticket.planned && <SlaBadge state={sla.resolve} kind="resolve" />}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted">{t("service.problem")}</div>
            <p className="mt-1 whitespace-pre-line">{ticket.problem}</p>
            {ticket.diagnosis && (
              <>
                <div className="mt-4 text-xs uppercase tracking-wide text-muted">{t("service.diagnosis")}</div>
                <p className="mt-1 whitespace-pre-line">{ticket.diagnosis}</p>
              </>
            )}
            {ticket.solution && (
              <>
                <div className="mt-4 text-xs uppercase tracking-wide text-muted">{t("service.solution")}</div>
                <p className="mt-1 whitespace-pre-line">{ticket.solution}</p>
              </>
            )}
          </Card>

          {edit && FLOW[ticket.status].length > 0 && (
            <Card>
              <CardHeader title={t("tasks.changeStatus")} />
              <div className="flex flex-wrap gap-2 p-5">
                {FLOW[ticket.status].map((to) => (
                  <ActionForm key={to} action={setTicketStatus.bind(null, ticket.id)}>
                    <input type="hidden" name="to" value={to} />
                    <SubmitButton variant={to === "CANCELLED" ? "secondary" : "primary"}>{t(`service.to_${to}`)}</SubmitButton>
                  </ActionForm>
                ))}
              </div>
            </Card>
          )}

          {edit && (
            <Card>
              <CardHeader title={t("service.work")} subtitle={ticket.isWarranty ? t("service.warrantyNoCharge") : undefined} />
              <ActionForm action={updateTicket.bind(null, ticket.id)} className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label={t("service.diagnosis")} className="sm:col-span-2">
                  <Textarea name="diagnosis" defaultValue={ticket.diagnosis ?? ""} />
                </Field>
                <Field label={t("service.solution")} hint={t("service.solutionHint")} className="sm:col-span-2">
                  <Textarea name="solution" defaultValue={ticket.solution ?? ""} />
                </Field>
                <Field label={t("service.responsible")}>
                  <Select name="responsibleUserId" defaultValue={ticket.responsibleUserId ?? ""}>
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("projects.priority")}>
                  <Select name="priority" defaultValue={ticket.priority}>
                    {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((p) => (
                      <option key={p} value={p}>
                        {t(`priority.${p}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("service.laborHours")}>
                  <Input name="laborHours" inputMode="decimal" defaultValue={ticket.laborHours ? String(Number(ticket.laborHours)) : ""} />
                </Field>
                <Field label={t("service.laborCost")} hint={t("service.laborCostHint")}>
                  <Input name="laborCostUzs" inputMode="decimal" defaultValue={Number(ticket.laborCostUzs) ? String(Number(ticket.laborCostUzs)) : ""} />
                </Field>
                <Field label={t("service.otherCost")} hint={t("service.otherCostHint")}>
                  <Input name="otherCostUzs" inputMode="decimal" defaultValue={Number(ticket.otherCostUzs) ? String(Number(ticket.otherCostUzs)) : ""} />
                </Field>
                <Field label={t("service.charge")} hint={ticket.isWarranty ? t("service.warrantyNoCharge") : t("service.chargeHint")}>
                  <Input name="chargeUzs" inputMode="decimal" disabled={ticket.isWarranty} defaultValue={Number(ticket.chargeUzs) ? String(Number(ticket.chargeUzs)) : ""} />
                </Field>
                <div className="sm:col-span-2">
                  <SubmitButton>{t("common.save")}</SubmitButton>
                </div>
              </ActionForm>
            </Card>
          )}

          <Card>
            <CardHeader title={t("service.parts")} subtitle={ticket.isWarranty ? t("service.partsWarrantyHint") : t("service.partsHint")} />
            {ticket.parts.length === 0 ? (
              <Empty>{t("common.noData")}</Empty>
            ) : (
              <Table>
                <tbody>
                  {ticket.parts.map((p) => (
                    <tr key={p.id}>
                      <Td>{p.name}</Td>
                      <Td className="num text-right">
                        {formatQty(Number(p.qty))} {p.unit}
                      </Td>
                      {showMoney && <Td className="num text-right">{formatNumber(Math.round(Number(p.qty) * Number(p.unitCostUzs)))}</Td>}
                      <Td className="w-10">{edit && !closed && <DeleteButton action={removePart} id={p.id} label="×" />}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {edit && !closed && (
              <ActionForm action={addPart.bind(null, ticket.id)} resetOnSuccess className="grid gap-2 border-t border-border p-4 sm:grid-cols-[1fr_10rem_6rem_auto] sm:items-end">
                <Field label={t("warehouse.product")}>
                  <Select name="productId" required defaultValue="">
                    <option value="" disabled>
                      —
                    </option>
                    {inStock.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatQty(levels.filter((l) => l.productId === p.id).reduce((s, l) => s + l.qty, 0))} {p.unit})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("warehouse.warehouse")}>
                  <Select name="warehouseId" defaultValue={warehouses[0]?.id}>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("common.quantity")}>
                  <Input name="qty" inputMode="decimal" required />
                </Field>
                <SubmitButton variant="secondary">{t("common.add")}</SubmitButton>
              </ActionForm>
            )}
          </Card>

          <Card>
            <CardHeader title={t("attachments.title")} subtitle={t("service.photosHint")} />
            <div className="p-5">
              <Attachments entityType="ticket" entityId={ticket.id} canUpload={edit} />
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-5">
            <dl className="space-y-1.5 text-sm">
              {(
                [
                  [t("clients.client"), ticket.client ? <Link href={`/clients/${ticket.client.id}`} className="text-primary">{ticket.client.name}</Link> : null],
                  [t("clients.contactPerson"), ticket.client?.contactPerson],
                  [t("clients.phone"), ticket.client?.phone],
                  [t("projects.project"), ticket.project ? <Link href={`/projects/${ticket.project.id}`} className="text-primary">{ticket.project.name}</Link> : null],
                  [t("service.warrantyUntil"), ticket.project?.warrantyEnd ? formatDate(ticket.project.warrantyEnd) : null],
                  [t("service.contract"), ticket.serviceContract ? <Link href={`/service/contracts/${ticket.serviceContract.id}`} className="text-primary">{ticket.serviceContract.number}</Link> : null],
                  [t("service.siteAddress"), ticket.siteAddress],
                  [t("service.responsible"), ticket.responsible?.name ?? "—"],
                  [t("service.reportedAt"), formatDateTime(ticket.reportedAt)],
                  [t("service.respondedAt"), ticket.respondedAt ? formatDateTime(ticket.respondedAt) : "—"],
                  [t("service.responseDue"), ticket.planned ? null : formatDateTime(sla.responseDue)],
                  [t("service.resolveDue"), formatDateTime(sla.resolveDue)],
                  [t("service.resolvedAt"), ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : null],
                ] as [string, React.ReactNode][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
            </dl>
            {ticket.serviceContract?.slaText && <p className="mt-3 border-t border-border pt-3 text-xs text-muted">{ticket.serviceContract.slaText}</p>}
          </Card>
          {showMoney && (
            <Card className="p-5">
              <div className="text-xs uppercase tracking-wide text-muted">{t("service.money")}</div>
              <dl className="mt-2 space-y-1 text-sm">
                {(
                  [
                    [t("service.laborCost"), Number(ticket.laborCostUzs)],
                    [t("service.parts"), cost.parts],
                    [t("service.otherCost"), Number(ticket.otherCostUzs)],
                    [t("service.totalCost"), cost.total],
                    [t("service.charge"), Number(ticket.chargeUzs)],
                    [t("service.result"), Number(ticket.chargeUzs) - cost.total],
                  ] as [string, number][]
                ).map(([k, v], i) => (
                  <div key={k} className={`flex justify-between ${i === 3 || i === 5 ? "border-t border-border pt-1 font-semibold" : ""}`}>
                    <dt className={i === 3 || i === 5 ? "" : "text-muted"}>{k}</dt>
                    <dd className={`num ${i === 5 && v < 0 ? "text-danger" : ""}`}>{formatNumber(Math.round(v))}</dd>
                  </div>
                ))}
              </dl>
              {ticket.isWarranty && <p className="mt-2 text-xs text-muted">{t("service.warrantyCostHint")}</p>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
