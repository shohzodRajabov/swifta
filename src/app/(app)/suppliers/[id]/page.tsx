import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Pencil, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { supplierBalances } from "@/lib/suppliers";
import { recordMoney } from "@/lib/money-value";
import { formatDate, isoDate } from "@/lib/utils";
import { Card, CardHeader, Empty, Field, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Money } from "@/components/money";
import { PoStatusBadge } from "@/components/po-bits";
import { addSupplierPayment, addSupplierPrice, deleteSupplierPayment, deleteSupplierPrice } from "../actions";

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const { id } = await params;
  const user = await requirePermission("suppliers.view");
  const supplier = await db.supplier.findFirst({ where: { id, companyId: user.companyId } });
  if (!supplier) notFound();
  const t = await getTranslations();
  const canEdit = can(user.role, "suppliers.edit");
  const canPay = can(user.role, "supplierPayments.edit");
  const showMoney = can(user.role, "finance.view") || canPay;

  const [prices, orders, payments, products, balances] = await Promise.all([
    db.supplierPrice.findMany({ where: { supplierId: id }, include: { product: true }, orderBy: { date: "desc" } }),
    db.purchaseOrder.findMany({
      where: { supplierId: id },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { orderDate: "desc" },
    }),
    db.supplierPayment.findMany({ where: { supplierId: id }, include: { order: true }, orderBy: { date: "desc" } }),
    canEdit
      ? db.product.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    supplierBalances(user.companyId, [id]),
  ]);
  const b = balances.get(id);
  const zero = { uzs: 0, usd: 0, count: 0 };

  const info: [string, string | null][] = [
    [t("suppliers.contactPerson"), supplier.contactPerson],
    [t("suppliers.phone"), supplier.phone],
    [t("suppliers.email"), supplier.email],
    [t("suppliers.address"), supplier.address],
    [t("suppliers.tin"), supplier.tin],
    [t("suppliers.paymentTerms"), supplier.paymentTerms],
    [t("suppliers.leadTimeDays"), supplier.leadTimeDays?.toString() ?? null],
    [t("suppliers.bankDetails"), supplier.bankDetails],
    [t("common.note"), supplier.note],
  ];

  return (
    <>
      <PageHeader
        title={supplier.name}
        back={{ href: "/suppliers", label: t("suppliers.title") }}
        actions={
          <>
            {can(user.role, "procurement.edit") && (
              <LinkButton href={`/procurement/new?supplier=${id}`} variant="secondary">
                <Plus className="size-4" aria-hidden />
                {t("procurement.new")}
              </LinkButton>
            )}
            {canEdit && (
              <LinkButton href={`/suppliers/${id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden />
                {t("common.edit")}
              </LinkButton>
            )}
          </>
        }
      />

      {showMoney && (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          {(
            [
              ["suppliers.ordered", b?.ordered ?? zero],
              ["suppliers.receivedValue", b?.received ?? zero],
              ["suppliers.paid", b?.paid ?? zero],
              ["suppliers.debt", b?.debt ?? zero],
            ] as const
          ).map(([label, value]) => (
            <Card key={label} className="p-4">
              <div className="mb-1 text-xs text-muted">{t(label)}</div>
              <Money value={value} align="left" />
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title={t("suppliers.orders")} />
            {orders.length === 0 ? (
              <Empty>{t("procurement.empty")}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("procurement.number")}</Th>
                    <Th>{t("procurement.orderDate")}</Th>
                    <Th>{t("procurement.project")}</Th>
                    <Th>{t("procurement.status")}</Th>
                    {showMoney && <Th className="text-right">{t("procurement.total")}</Th>}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <Td>
                        <Link href={`/procurement/${o.id}`} className="num font-medium hover:text-primary">
                          {o.number}
                        </Link>
                      </Td>
                      <Td className="num">{formatDate(o.orderDate)}</Td>
                      <Td>{o.project?.name ?? <span className="text-muted">{t("procurement.stockOrder")}</span>}</Td>
                      <Td>
                        <PoStatusBadge status={o.status} />
                      </Td>
                      {showMoney && (
                        <Td className="text-right">
                          <Money
                            size="sm"
                            value={{ uzs: Number(o.totalUzs), usd: Number(o.totalUsd), rate: Number(o.fxRate), fxDate: o.fxDate.toISOString(), source: o.fxSource, currency: o.currency, original: Number(o.totalAmount) }}
                          />
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title={t("suppliers.prices")} />
            {prices.length === 0 ? (
              <Empty>{t("common.noData")}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("common.date")}</Th>
                    <Th>{t("procurement.product")}</Th>
                    <Th className="text-right">{t("procurement.unitPrice")}</Th>
                    <Th>{t("suppliers.leadTimeDays")}</Th>
                    {canEdit && <Th />}
                  </tr>
                </thead>
                <tbody>
                  {prices.map((p) => (
                    <tr key={p.id}>
                      <Td className="num">{formatDate(p.date)}</Td>
                      <Td>
                        <Link href={`/procurement?tab=prices&product=${p.productId}`} className="hover:text-primary">
                          {p.product.name}
                        </Link>
                        <span className="text-xs text-muted"> / {p.product.unit}</span>
                      </Td>
                      <Td className="text-right">
                        <Money
                          size="sm"
                          value={{ uzs: Number(p.priceUzs), usd: Number(p.priceUsd), rate: Number(p.fxRate), fxDate: p.date.toISOString(), source: "CBU", currency: p.currency, original: Number(p.price) }}
                        />
                      </Td>
                      <Td className="num">{p.leadTimeDays ?? "—"}</Td>
                      {canEdit && (
                        <Td className="text-right">
                          <DeleteButton action={deleteSupplierPrice} id={p.id} />
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {canEdit && (
              <ActionForm
                action={addSupplierPrice.bind(null, id)}
                resetOnSuccess
                className="grid gap-4 border-t border-border p-5 md:grid-cols-2"
              >
                <Field label={t("procurement.product")} required>
                  <Select name="productId" required defaultValue="">
                    <option value="" disabled>
                      —
                    </option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} · {p.name} · {p.unit}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t("common.date")} required>
                    <Input name="date" type="date" required defaultValue={isoDate(new Date())} />
                  </Field>
                  <Field label={t("suppliers.leadTimeDays")}>
                    <Input name="leadTimeDays" inputMode="numeric" />
                  </Field>
                </div>
                <MoneyInput label={t("procurement.unitPrice")} />
                <div className="flex items-end">
                  <SubmitButton>{t("suppliers.addPrice")}</SubmitButton>
                </div>
              </ActionForm>
            )}
          </Card>

          {showMoney && (
            <Card>
              <CardHeader title={t("suppliers.payments")} />
              {payments.length === 0 ? (
                <Empty>{t("common.noData")}</Empty>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>{t("common.date")}</Th>
                      <Th>{t("suppliers.order")}</Th>
                      <Th>{t("payments.method")}</Th>
                      <Th>{t("payments.reference")}</Th>
                      <Th className="text-right">{t("common.amount")}</Th>
                      {canPay && <Th />}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <Td className="num">{formatDate(p.date)}</Td>
                        <Td className="num">{p.order?.number ?? <span className="text-muted">—</span>}</Td>
                        <Td>{t(`paymentMethod.${p.method}`)}</Td>
                        <Td>{p.reference ?? "—"}</Td>
                        <Td className="text-right">
                          <Money size="sm" value={recordMoney(p)} />
                        </Td>
                        {canPay && (
                          <Td className="text-right">
                            <DeleteButton action={deleteSupplierPayment} id={p.id} />
                          </Td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {canPay && (
                <ActionForm
                  action={addSupplierPayment.bind(null, id)}
                  resetOnSuccess
                  className="grid gap-4 border-t border-border p-5 md:grid-cols-2"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t("common.date")} required>
                      <Input name="date" type="date" required defaultValue={isoDate(new Date())} />
                    </Field>
                    <Field label={t("payments.method")}>
                      <Select name="method" defaultValue="BANK">
                        {(["BANK", "CASH", "CARD", "OTHER"] as const).map((x) => (
                          <option key={x} value={x}>
                            {t(`paymentMethod.${x}`)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <MoneyInput label={t("common.amount")} />
                  <Field label={t("suppliers.order")}>
                    <Select name="orderId" defaultValue="">
                      <option value="">{t("suppliers.noOrder")}</option>
                      {orders
                        .filter((o) => o.status !== "CANCELLED" && o.status !== "DRAFT")
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.number}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label={t("payments.reference")}>
                    <Input name="reference" />
                  </Field>
                  <div className="md:col-span-2">
                    <SubmitButton>{t("suppliers.addPayment")}</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </Card>
          )}
        </div>

        <Card className="self-start">
          <CardHeader title={t("projects.info")} />
          <dl className="divide-y divide-border text-sm">
            {info.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[130px_1fr] gap-3 px-5 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="whitespace-pre-line break-words">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
