import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { COST_CATEGORIES, type ProjectMetrics } from "@/lib/metrics";
import { recordMoney } from "@/lib/money-value";
import { Badge, Card, CardHeader, Empty, Field, Input, Notice, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Money } from "@/components/money";
import { addBudgetLine, deleteBudgetLine } from "@/app/(app)/projects/actions";

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
  const canEdit = can(user.role, "budget.edit");
  const lines = await db.budgetLine.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t("budget.byCategory")} subtitle={t("budget.bomNote")} />
        <Table>
          <thead>
            <tr>
              <Th>{t("budget.category")}</Th>
              <Th className="text-right">{t("common.plan")}</Th>
              <Th className="text-right">{t("common.actual")}</Th>
              <Th className="text-right">{t("common.difference")}</Th>
            </tr>
          </thead>
          <tbody>
            {COST_CATEGORIES.map((c) => {
              const { plan, actual } = m.byCategory[c];
              if (plan.uzs === 0 && actual.uzs === 0) return null;
              const diff = { uzs: plan.uzs - actual.uzs, usd: plan.usd - actual.usd, count: plan.count + actual.count };
              return (
                <tr key={c}>
                  <Td className="font-medium">
                    {t(`costCategory.${c}`)}
                    {(c === "EQUIPMENT" || c === "MATERIAL") && (
                      <Badge className="ml-2">{t("budget.fromBom")}</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Money size="sm" value={plan} />
                  </Td>
                  <Td className="text-right">
                    <Money size="sm" value={actual} />
                  </Td>
                  <Td className="text-right">
                    <Money size="sm" value={diff} tone="auto" />
                    <div className="text-xs">
                      {diff.uzs < 0 ? (
                        <span className="text-danger">{t("budget.over")}</span>
                      ) : diff.uzs > 0 && actual.uzs > 0 ? (
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
                <Money size="sm" value={m.plannedCost} />
              </Td>
              <Td className="text-right">
                <Money size="sm" value={m.actualCost} />
              </Td>
              <Td className="text-right">
                <Money
                  size="sm"
                  tone="auto"
                  value={{
                    uzs: m.plannedCost.uzs - m.actualCost.uzs,
                    usd: m.plannedCost.usd - m.actualCost.usd,
                    count: m.plannedCost.count + m.actualCost.count,
                  }}
                />
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
                {COST_CATEGORIES.filter((c) => c !== "EQUIPMENT" && c !== "MATERIAL").map((c) => (
                  <option key={c} value={c}>
                    {t(`costCategory.${c}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("budget.description")}>
              <Input name="description" />
            </Field>
            <MoneyInput label={t("common.amount")} />
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
