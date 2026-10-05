import { getTranslations } from "next-intl/server";
import type { KpiSubject } from "@prisma/client";
import { requireAnyPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatDate, isoDate } from "@/lib/utils";
import { Badge, Card, CardHeader, Field, Input, Notice, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { KPI_COMPONENTS, type RuleComponent } from "@/lib/kpi";
import { saveKpiRule } from "../actions";

const SUBJECTS: KpiSubject[] = ["EMPLOYEE", "GROUP", "CONTRACTOR"];

export default async function KpiRulesPage() {
  const user = await requireAnyPermission("kpi.view", "kpi.manage");
  const t = await getTranslations();
  const manage = can(user, "kpi.manage");
  const rules = await db.kpiRule.findMany({ where: { companyId: user.companyId }, orderBy: [{ subject: "asc" }, { version: "desc" }] });
  const d = new Date();
  const nextMonth = isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));

  return (
    <>
      <PageHeader title={t("kpi.rules")} back={{ href: "/kpi", label: t("kpi.title") }} subtitle={t("kpi.rulesHint")} />
      <div className="mb-6">
        <Notice>{t("kpi.versionHint")}</Notice>
      </div>
      <div className="flex flex-col gap-6">
        {SUBJECTS.map((subject) => {
          const list = rules.filter((r) => r.subject === subject);
          const active = list.find((r) => r.status === "ACTIVE") ?? list[0];
          const comps = (active?.components ?? []) as RuleComponent[];
          const catalog = KPI_COMPONENTS.filter((c) => c.subjects.includes(subject));
          return (
            <Card key={subject}>
              <CardHeader title={t(`kpi.subject_${subject}`)} subtitle={active ? `${active.name} · v${active.version} · ${t("kpi.since", { date: formatDate(active.effectiveFrom) })}` : undefined} />
              <div className="grid gap-6 p-5 lg:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("kpi.versions")}</div>
                  <ul className="space-y-2 text-sm">
                    {list.map((r) => (
                      <li key={r.id} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            v{r.version} · {r.name}
                          </span>
                          <Badge tone={r.status === "ACTIVE" ? "success" : "neutral"}>{t(`kpi.ruleStatus_${r.status}`)}</Badge>
                          <span className="num ml-auto text-xs text-muted">
                            {formatDate(r.effectiveFrom)} — {r.effectiveTo ? formatDate(r.effectiveTo) : t("groups.now")}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(r.components as RuleComponent[]).map((c) => (
                            <Badge key={c.key}>
                              {t(`kpiComponent.${c.key}`)} {c.weight}%
                            </Badge>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                {manage && (
                  <ActionForm action={saveKpiRule.bind(null, subject)} className="flex flex-col gap-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t("kpi.newVersion")}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={t("common.name")} required>
                        <Input name="name" required defaultValue={active?.name} />
                      </Field>
                      <Field label={t("kpi.effectiveFrom")} required>
                        <Input type="date" name="effectiveFrom" required defaultValue={nextMonth} />
                      </Field>
                    </div>
                    <table className="text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted">
                          <th className="py-1 font-medium">{t("kpi.component")}</th>
                          <th className="w-24 py-1 font-medium">{t("kpi.weight")}</th>
                          <th className="w-40 py-1 font-medium">{t("kpi.params")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catalog.map((c) => {
                          const cur = comps.find((x) => x.key === c.key);
                          return (
                            <tr key={c.key} className="border-t border-border">
                              <td className="py-1.5 pr-2">
                                <div>{t(`kpiComponent.${c.key}`)}</div>
                                <div className="text-xs text-muted">{t(`kpiComponent.${c.key}_hint`)}</div>
                              </td>
                              <td className="py-1.5">
                                <Input name={`w_${c.key}`} inputMode="decimal" defaultValue={cur?.weight ?? 0} className="h-8 w-20" />
                              </td>
                              <td className="py-1.5">
                                {Object.entries(c.params ?? {}).map(([p, def]) => (
                                  <label key={p} className="flex items-center gap-1 text-xs text-muted">
                                    {t(`kpiParam.${p}`)}
                                    <Input name={`p_${c.key}_${p}`} inputMode="decimal" defaultValue={cur?.params?.[p] ?? def} className="h-7 w-16 text-xs" />
                                  </label>
                                ))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs text-muted">{t("kpi.weightHint")}</p>
                    <div>
                      <SubmitButton>{t("kpi.saveVersion")}</SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
