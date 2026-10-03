import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { COST_CATEGORIES, MANUAL_COST_CATEGORIES, sub, type ProjectMetrics } from "@/lib/metrics";
import { recordMoney } from "@/lib/money-value";
import { formatNumber } from "@/lib/format";
import { Badge, Card, CardHeader, Empty, Field, Input, Notice, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Money } from "@/components/money";
import { projectVatRate } from "@/server/projects/defaults";
import { addBudgetLine, deleteBudgetLine } from "@/app/(app)/projects/actions";

const SOURCE: Partial<Record<(typeof COST_CATEGORIES)[number], string>> = {
  EQUIPMENT: "budget.fromBom",
  MATERIAL: "budget.fromBom",
  LABOR: "budget.fromSessions",
  OUTSOURCING: "budget.fromContractors",
  SUBCONTRACTOR: "budget.fromContractors",
  TAX: "budget.fromActs",
};

export async function BudgetTab({
  user,
  projectId,
  metrics: m,
}: {
  user: CurrentUser;
  projectId: string;
  metrics: ProjectMetrics;
}) {
  const t = await getTranslations();
  const canEdit = can(user, "budget.edit");
  const [lines, defaultVat] = await Promise.all([
    db.budgetLine.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    projectVatRate(projectId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={t("budget.byCategory")}
          subtitle={m.regime === "GENERAL" ? t("finance.netOfVatNote") : t("finance.turnoverNote")}
        />
        <Table>
          <thead>
            <tr>
              <Th>{t("budget.category")}</Th>
              <Th className="text-right">{t("common.plan")}</Th>
              <Th className="text-right">{t("finance.openCommitments")}</Th>
              <Th className="text-right">{t("common.forecast")}</Th>
              <Th className="text-right">{t("common.actual")}</Th>
              <Th className="text-right">{t("common.difference")}</Th>
            </tr>
          </thead>
          <tbody>
            {COST_CATEGORIES.map((c) => {
              const v = m.byCategory[c];
              if (v.plan.uzs === 0 && v.actual.uzs === 0 && v.forecast.uzs === 0) return null;
              const diff = sub(v.plan, v.forecast);
              return (
                <tr key={c}>
                  <Td className="font-medium">
                    {t(`costCategory.${c}`)}
                    {SOURCE[c] && <Badge className="ml-2">{t(SOURCE[c]!)}</Badge>}
                  </Td>
                  <Td className="text-right">
                    <Money size="sm" value={v.plan} />
                  </Td>
                  <Td className="text-right">{v.committed.uzs > 0 ? <Money size="sm" value={v.committed} /> : <span className="text-muted">—</span>}</Td>
                  <Td className="text-right">
                    <Money size="sm" value={v.forecast} />
                  </Td>
                  <Td className="text-right">
                    <Money size="sm" value={v.actual} />
                  </Td>
                  <Td className="text-right">
                    <Money size="sm" value={diff} tone="auto" />
                    <div className="text-xs">
                      {diff.uzs < -0.5 ? (
                        <span className="text-danger">
                          {t("budget.over")} {v.plan.uzs > 0 && `${formatNumber((-diff.uzs / v.plan.uzs) * 100, 1)}%`}
                        </span>
                      ) : diff.uzs > 0.5 && v.actual.uzs > 0 ? (
                        <span className="text-success">{t("budget.under")}</span>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <Td>{t("common.total")}</Td>
              <Td className="text-right">
                <Money size="sm" value={m.cost.plan} />
              </Td>
              <Td className="text-right">
                <Money size="sm" value={m.cost.committed} />
              </Td>
              <Td className="text-right">
                <Money size="sm" value={m.cost.forecast} />
              </Td>
              <Td className="text-right">
                <Money size="sm" value={m.cost.actual} />
              </Td>
              <Td className="text-right">
                <Money size="sm" tone="auto" value={sub(m.cost.plan, m.cost.forecast)} />
              </Td>
            </tr>
          </tfoot>
        </Table>
      </Card>

      <Card>
        <CardHeader title={t("budget.title")} />
        {lines.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("budget.category")}</Th>
                <Th>{t("budget.description")}</Th>
                <Th className="text-right">{t("common.amount")}</Th>
                {canEdit && <Th />}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td>{t(`costCategory.${l.category}`)}</Td>
                  <Td>{l.description ?? "—"}</Td>
                  <Td className="text-right">
                    <Money size="sm" value={recordMoney(l)} />
                    {Number(l.vatRate) > 0 && <div className="text-[11px] text-muted">{t("common.vat")} {formatNumber(Number(l.vatRate), 0)}%</div>}
                  </Td>
                  {canEdit && (
                    <Td className="text-right">
                      <DeleteButton action={deleteBudgetLine} id={l.id} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {canEdit && (
          <ActionForm
            action={addBudgetLine.bind(null, projectId)}
            resetOnSuccess
            className="grid gap-4 border-t border-border p-5 md:grid-cols-2"
          >
            <Field label={t("budget.category")} required>
              <Select name="category" defaultValue="LABOR">
                {MANUAL_COST_CATEGORIES.filter((c) => c !== "EQUIPMENT" && c !== "MATERIAL").map((c) => (
                  <option key={c} value={c}>
                    {t(`costCategory.${c}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("budget.description")}>
              <Input name="description" />
            </Field>
            <MoneyInput label={t("common.amount")} vat defaultVat={defaultVat} />
            <div className="flex items-end">
              <SubmitButton>{t("budget.add")}</SubmitButton>
            </div>
            <div className="md:col-span-2">
              <Notice>{t("budget.bomNote")}</Notice>
            </div>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
