import { getTranslations } from "next-intl/server";
import type { OverheadCategory } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { recordMoney } from "@/lib/money-value";
import { OVERHEAD_CATEGORIES } from "@/lib/overhead";
import { dateFilter, resolvePeriod } from "@/lib/period";
import { formatDate, isoDate } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Money } from "@/components/money";
import { FinanceTabs } from "@/components/finance-tabs";
import { PeriodFields } from "@/components/period-filter";
import { pendingApprovalsCount } from "@/server/finance/pending";
import { addOverhead, deleteOverhead } from "./actions";
import { UT } from "@/components/user-text";

export default async function OverheadPage({ searchParams }: PageProps<"/finance/overhead">) {
  const user = await requirePermission("overhead.view");
  const sp = (await searchParams) as { period?: string; from?: string; to?: string; category?: string };
  const t = await getTranslations();
  const period = resolvePeriod(sp, "month");
  const canEdit = can(user, "overhead.edit");
  const category = (OVERHEAD_CATEGORIES as readonly string[]).includes(sp.category ?? "") ? (sp.category as OverheadCategory) : undefined;
  const [rows, entities, pending] = await Promise.all([
    db.overheadExpense.findMany({
      where: { companyId: user.companyId, date: dateFilter(period), ...(category ? { category } : {}) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { legalEntity: { select: { name: true } } },
      take: 500,
    }),
    db.legalEntity.findMany({ where: { companyId: user.companyId, active: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    can(user, "finance.approve") ? pendingApprovalsCount(user.companyId) : Promise.resolve(0),
  ]);
  const approved = rows.filter((r) => r.approval === "APPROVED");
  const byCat = new Map<string, { uzs: number; usd: number; count: number }>();
  for (const r of approved) {
    const a = byCat.get(r.category) ?? { uzs: 0, usd: 0, count: 0 };
    byCat.set(r.category, { uzs: a.uzs + Number(r.amountUzs), usd: a.usd + Number(r.amountUsd), count: a.count + 1 });
  }
  const total = [...byCat.values()].reduce((a, b) => ({ uzs: a.uzs + b.uzs, usd: a.usd + b.usd, count: a.count + b.count }), { uzs: 0, usd: 0, count: 0 });
  const defaultVat = entities[0]?.taxRegime === "GENERAL" ? Number(entities[0].vatRate) : 0;

  return (
    <>
      <PageHeader title={t("finance.title")} />
      <FinanceTabs user={user} active="overhead" pending={pending} />
      <div className="flex flex-col gap-6">
        <Card>
          <form className="flex flex-wrap items-center gap-2 p-3">
            <PeriodFields period={period} />
            <Select name="category" defaultValue={sp.category ?? ""} className="w-56">
              <option value="">
                {t("finance.category")}: {t("common.all")}
              </option>
              {OVERHEAD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`overheadCategory.${c}`)}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              {t("common.filter")}
            </Button>
            <div className="ml-auto text-sm text-muted">
              {t("common.total")}: <Money value={total} size="sm" />
            </div>
          </form>
          {byCat.size > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border p-3">
              {[...byCat.entries()].map(([c, v]) => (
                <Badge key={c} className="gap-2 py-1">
                  {t(`overheadCategory.${c}`)}: <span className="num">{formatNumber(Math.round(v.uzs))}</span>
                </Badge>
              ))}
            </div>
          )}
        </Card>

        {canEdit && (
          <Card>
            <CardHeader title={t("finance.addOverhead")} subtitle={t("finance.overheadHint")} />
            <ActionForm action={addOverhead} resetOnSuccess className="grid gap-4 p-5 md:grid-cols-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("common.date")} required>
                  <Input name="date" type="date" required defaultValue={isoDate(new Date())} />
                </Field>
                <Field label={t("finance.category")} required>
                  <Select name="category" defaultValue="OFFICE_RENT">
                    {OVERHEAD_CATEGORIES.filter((c) => c !== "PAYROLL_UNALLOCATED").map((c) => (
                      <option key={c} value={c}>
                        {t(`overheadCategory.${c}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <MoneyInput label={t("common.amount")} vat defaultVat={defaultVat} />
              <Field label={t("finance.description")} required>
                <Input name="description" required />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("expenses.supplier")}>
                  <Input name="supplier" />
                </Field>
                <Field label={t("projects.legalEntity")}>
                  <Select name="legalEntityId" defaultValue={entities[0]?.id ?? ""}>
                    {entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="md:col-span-2">
                <SubmitButton>{t("common.add")}</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        )}

        <Card>
          <CardHeader title={t("finance.tab_overhead")} />
          {rows.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("common.date")}</Th>
                  <Th>{t("finance.category")}</Th>
                  <Th>{t("finance.description")}</Th>
                  <Th>{t("projects.legalEntity")}</Th>
                  <Th className="text-right">{t("common.amount")}</Th>
                  {canEdit && <Th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td className="num">{formatDate(r.date)}</Td>
                    <Td>
                      <Badge>{t(`overheadCategory.${r.category}`)}</Badge>
                    </Td>
                    <Td>
                      <UT>{r.description}</UT>
                      {r.supplier && <div className="text-xs text-muted">{r.supplier}</div>}
                    </Td>
                    <Td className="text-xs">{r.legalEntity?.name ?? "—"}</Td>
                    <Td className="text-right">
                      <Money size="sm" value={recordMoney(r)} />
                      {r.approval !== "APPROVED" && (
                        <Badge tone={r.approval === "PENDING" ? "warning" : "danger"} className="mt-1">
                          {t(`approval.${r.approval}`)}
                        </Badge>
                      )}
                    </Td>
                    {canEdit && <Td className="text-right">{r.source !== "PAYROLL" && <DeleteButton action={deleteOverhead} id={r.id} />}</Td>}
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
