import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatQty } from "@/lib/format";
import { formatDate, isoDate, toDateOnly } from "@/lib/utils";
import { recordMoney } from "@/lib/money-value";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Money } from "@/components/money";
import { PoStatusBadge } from "@/components/po-bits";
import { deleteDraftOrder, receiveOrder, setOrderStatus } from "../actions";
import { ConfirmForm } from "@/components/forms/confirm-form";

export default async function OrderPage({ params }: PageProps<"/procurement/[id]">) {
  const { id } = await params;
  const user = await requirePermission("procurement.view");
  const o = await db.purchaseOrder.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      supplier: true,
      project: { select: { id: true, code: true, name: true } },
      warehouse: true,
      createdBy: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" }, include: { movements: { where: { type: "RECEIPT" } } } },
      payments: { orderBy: { date: "desc" } },
    },
  });
  if (!o) notFound();
  const t = await getTranslations();
  const canEdit = can(user.role, "procurement.edit");
  const canReceive = can(user.role, "warehouse.edit") && (o.status === "ORDERED" || o.status === "PARTIAL");
  const showMoney = can(user.role, "finance.view") || can(user.role, "procurement.edit") || can(user.role, "supplierPayments.edit");
  const received = (l: (typeof o.lines)[number]) => l.movements.reduce((s, m) => s + Number(m.qty), 0);
  const hasReceipts = o.lines.some((l) => l.movements.length > 0);
  const overdue =
    !!o.expectedDate && o.expectedDate < toDateOnly(new Date()) && (o.status === "ORDERED" || o.status === "PARTIAL");
  const receipts = o.lines
    .flatMap((l) => l.movements.map((m) => ({ ...m, line: l })))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const lineMoney = (l: (typeof o.lines)[number]) => ({
    uzs: Number(l.amountUzs),
    usd: Number(l.amountUsd),
    rate: Number(o.fxRate),
    fxDate: o.fxDate.toISOString(),
    source: o.fxSource,
    currency: o.currency,
    original: Number(l.amount),
  });

  return (
    <>
      <PageHeader
        title={<span className="num">{o.number}</span>}
        back={{ href: "/procurement", label: t("procurement.title") }}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/suppliers/${o.supplierId}`} className="hover:text-primary">
              {o.supplier.name}
            </Link>
            <span>·</span>
            {o.project ? (
              <Link href={`/projects/${o.project.id}?tab=materials`} className="hover:text-primary">
                {o.project.code} {o.project.name}
              </Link>
            ) : (
              <span>{t("procurement.stockOrder")}</span>
            )}
            <PoStatusBadge status={o.status} />
            {overdue && <Badge tone="danger">{t("procurement.overdue")}</Badge>}
          </div>
        }
        actions={
          canEdit && (
            <>
              {o.status === "DRAFT" && (
                <>
                  <form action={setOrderStatus}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value="ORDERED" />
                    <Button type="submit">{t("procurement.placeOrder")}</Button>
                  </form>
                  <ConfirmForm action={deleteDraftOrder} id={o.id} label={t("common.delete")} />
                </>
              )}
              {(o.status === "ORDERED" || o.status === "PARTIAL") && !hasReceipts && (
                <ConfirmForm action={setOrderStatus} id={o.id} label={t("procurement.cancelOrder")} extra={{ status: "CANCELLED" }} />
              )}
            </>
          )
        }
      />

      {o.status === "DRAFT" && (
        <div className="mb-4">
          <Notice tone="warning">{t("procurement.draftHint")}</Notice>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader
              title={t("procurement.lines")}
              action={showMoney && <Money value={{ uzs: Number(o.totalUzs), usd: Number(o.totalUsd), rate: Number(o.fxRate), fxDate: o.fxDate.toISOString(), source: o.fxSource, currency: o.currency, original: Number(o.totalAmount) }} />}
            />
            <ActionForm action={receiveOrder.bind(null, o.id)} resetOnSuccess>
              <Table>
                <thead>
                  <tr>
                    <Th>{t("procurement.product")}</Th>
                    <Th className="text-right">{t("procurement.qty")}</Th>
                    <Th className="text-right">{t("procurement.received")}</Th>
                    <Th className="text-right">{t("procurement.remaining")}</Th>
                    {showMoney && <Th className="text-right">{t("procurement.amount")}</Th>}
                    {canReceive && <Th className="text-right">{t("procurement.receiveQty")}</Th>}
                  </tr>
                </thead>
                <tbody>
                  {o.lines.map((l) => {
                    const rec = received(l);
                    const rem = Math.max(0, Number(l.qty) - rec);
                    return (
                      <tr key={l.id}>
                        <Td className="font-medium">{l.name}</Td>
                        <Td className="num text-right">
                          {formatQty(Number(l.qty))} <span className="text-muted">{l.unit}</span>
                        </Td>
                        <Td className="num text-right">{formatQty(rec)}</Td>
                        <Td className="num text-right">{rem > 0 ? formatQty(rem) : <Badge tone="success">✓</Badge>}</Td>
                        {showMoney && (
                          <Td className="text-right">
                            <Money size="sm" value={lineMoney(l)} />
                          </Td>
                        )}
                        {canReceive && (
                          <Td className="text-right">
                            <Input
                              name={`qty_${l.id}`}
                              inputMode="decimal"
                              defaultValue={rem > 0 ? String(+rem.toFixed(3)) : ""}
                              className="ml-auto w-24 text-right"
                              aria-label={t("procurement.receiveQty")}
                            />
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              {canReceive && (
                <div className="grid gap-3 border-t border-border p-5 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                  <Field label={t("common.date")} required>
                    <Input name="date" type="date" required defaultValue={isoDate(new Date())} />
                  </Field>
                  <Field label={t("procurement.document")}>
                    <Input name="document" />
                  </Field>
                  <Field label={t("warehouse.responsible")}>
                    <Input name="responsible" defaultValue={user.name} />
                  </Field>
                  <SubmitButton>{t("procurement.receive")}</SubmitButton>
                  {o.project && (
                    <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
                      <input type="checkbox" name="issue" className="size-4" />
                      {t("procurement.issueDirectly")}
                    </label>
                  )}
                </div>
              )}
            </ActionForm>
          </Card>

          <Card>
            <CardHeader title={t("warehouse.tabMovements")} />
            {receipts.length === 0 ? (
              <Empty>{t("common.noData")}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("common.date")}</Th>
                    <Th>{t("procurement.product")}</Th>
                    <Th className="text-right">{t("procurement.qty")}</Th>
                    <Th>{t("procurement.document")}</Th>
                    <Th>{t("warehouse.responsible")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((m) => (
                    <tr key={m.id}>
                      <Td className="num">{formatDate(m.date)}</Td>
                      <Td>{m.name}</Td>
                      <Td className="num text-right">
                        {formatQty(Number(m.qty))} <span className="text-muted">{m.unit}</span>
                      </Td>
                      <Td>{m.document ?? "—"}</Td>
                      <Td>{m.responsible ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {showMoney && (
            <Card>
              <CardHeader
                title={t("suppliers.payments")}
                action={
                  can(user.role, "supplierPayments.edit") && (
                    <Link href={`/suppliers/${o.supplierId}`} className="text-sm text-primary hover:underline">
                      {t("suppliers.addPayment")} →
                    </Link>
                  )
                }
              />
              {o.payments.length === 0 ? (
                <Empty>{t("common.noData")}</Empty>
              ) : (
                <Table>
                  <tbody>
                    {o.payments.map((p) => (
                      <tr key={p.id}>
                        <Td className="num">{formatDate(p.date)}</Td>
                        <Td>{t(`paymentMethod.${p.method}`)}</Td>
                        <Td>{p.reference ?? "—"}</Td>
                        <Td className="text-right">
                          <Money size="sm" value={recordMoney(p)} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}
        </div>

        <Card className="self-start">
          <CardHeader title={t("projects.info")} />
          <dl className="divide-y divide-border text-sm">
            {(
              [
                [t("procurement.supplier"), o.supplier.name],
                [t("procurement.warehouse"), o.warehouse.name],
                [t("procurement.orderDate"), formatDate(o.orderDate)],
                [t("procurement.expectedDate"), formatDate(o.expectedDate)],
                [t("procurement.paymentDueDate"), formatDate(o.paymentDueDate)],
                [t("procurement.invoiceNumber"), o.invoiceNumber],
                [t("expenses.createdBy"), o.createdBy?.name ?? null],
                [t("common.note"), o.note],
              ] as [string, string | null][]
            ).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[130px_1fr] gap-3 px-5 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="break-words">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
