import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { employerMonthlyCost, grossSalary } from "@/lib/payroll";
import { formatUzs } from "@/lib/format";
import { Card, CardHeader, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { DEFAULT_BONUS_SCALE, formatBonusScale, parseBonusScale } from "@/lib/kpi";
import { updateCompanySettings } from "../actions";
import { DEFAULT_RATING_WEIGHTS, DEFAULT_RELIABILITY_WEIGHTS, RATING_COMPONENTS, RELIABILITY_COMPONENTS, normalizeWeights } from "@/lib/contractor-score";

export default async function CompanySettingsPage() {
  const user = await requirePermission("settings.manage");
  const t = await getTranslations();
  const c = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
  const w = (c.contributionWeights ?? {}) as Record<string, number>;
  const example = 6_000_000;
  const rw = normalizeWeights(c.contractorRatingConfig, DEFAULT_RATING_WEIGHTS);
  const lw = normalizeWeights(c.contractorReliabilityConfig, DEFAULT_RELIABILITY_WEIGHTS);

  return (
    <>
      <PageHeader title={t("settings.company.title")} back={{ href: "/settings", label: t("settings.title") }} />
      <ActionForm action={updateCompanySettings} className="flex max-w-4xl flex-col gap-6">
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <CardHeader title={t("settings.company.general")} />
          <div />
          <Field label={t("settings.company.name")} required>
            <Input name="name" defaultValue={c.name} required />
          </Field>
          <Field label={t("settings.company.approvalThreshold")} hint={t("settings.company.approvalThresholdHint")}>
            <Input name="approvalThresholdUzs" inputMode="decimal" defaultValue={Number(c.approvalThresholdUzs)} />
          </Field>
          <Field label={t("settings.company.overuseThreshold")} hint={t("settings.company.overuseThresholdHint")}>
            <Input name="overuseThreshold" inputMode="decimal" defaultValue={Number(c.overuseThreshold)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="contractorPhoneRequired" defaultChecked={c.contractorPhoneRequired} className="size-4" />
            {t("settings.company.contractorPhoneRequired")}
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="require2faForAdmins" defaultChecked={c.require2faForAdmins} className="size-4" />
            {t("settings.company.require2faForAdmins")}
          </label>
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <h2 className="text-sm font-semibold sm:col-span-2 lg:col-span-3">{t("settings.company.payroll")}</h2>
          <Field label={t("settings.company.normWorkDays")}>
            <Input name="normWorkDays" inputMode="numeric" defaultValue={c.normWorkDays} />
          </Field>
          <Field label={t("settings.company.normHoursPerDay")}>
            <Input name="normHoursPerDay" inputMode="decimal" defaultValue={Number(c.normHoursPerDay)} />
          </Field>
          <Field label={t("settings.company.salaryInputMode")}>
            <Select name="salaryInputMode" defaultValue={c.salaryInputMode}>
              <option value="NET">{t("settings.company.salaryNet")}</option>
              <option value="GROSS">{t("settings.company.salaryGross")}</option>
            </Select>
          </Field>
          <Field label={t("settings.company.incomeTaxRate")}>
            <Input name="incomeTaxRate" inputMode="decimal" defaultValue={Number(c.incomeTaxRate)} />
          </Field>
          <Field label={t("settings.company.socialTaxRate")}>
            <Input name="socialTaxRate" inputMode="decimal" defaultValue={Number(c.socialTaxRate)} />
          </Field>
          <Field label={t("settings.company.overtimeMultiplier")} hint={t("settings.company.overtimeHint")}>
            <Input name="overtimeMultiplier" inputMode="decimal" defaultValue={Number(c.overtimeMultiplier)} />
          </Field>
          <Field label={t("settings.company.maxDailyHours")}>
            <Input name="maxDailyHours" inputMode="numeric" defaultValue={c.maxDailyHours} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="kpiBonusEnabled" defaultChecked={c.kpiBonusEnabled} className="size-4" />
            {t("settings.company.kpiBonusEnabled")}
          </label>
          <Field label={t("settings.company.kpiBonusScale")} hint={t("settings.company.kpiBonusScaleHint")} className="sm:col-span-2">
            <Input name="kpiBonusScale" defaultValue={formatBonusScale(c.kpiBonusScale ? parseBonusScale(c.kpiBonusScale) : DEFAULT_BONUS_SCALE)} placeholder="90:20, 80:10, 70:5" />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Notice>
              {t("settings.company.payrollExample", {
                salary: formatUzs(example),
                gross: formatUzs(grossSalary(c, example)),
                cost: formatUzs(employerMonthlyCost(c, example)),
                daily: formatUzs(employerMonthlyCost(c, example) / c.normWorkDays),
              })}
            </Notice>
          </div>
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <h2 className="text-sm font-semibold sm:col-span-2 lg:col-span-4">{t("settings.company.contribution")}</h2>
          <Field label={t("settings.company.defaultContribution")} className="sm:col-span-2">
            <Select name="defaultContribution" defaultValue={c.defaultContribution}>
              {(["EQUAL", "LEADER", "RULE", "EFFICIENCY"] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`contribution.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("settings.company.efficiencyMinSessions")} className="sm:col-span-2">
            <Input name="efficiencyMinSessions" inputMode="numeric" defaultValue={c.efficiencyMinSessions} />
          </Field>
          <Field label={t("groupRole.LEADER")} hint={t("settings.company.weightHint")}>
            <Input name="weightLeader" inputMode="decimal" defaultValue={w.LEADER ?? 1.2} />
          </Field>
          <Field label={t("groupRole.SENIOR")}>
            <Input name="weightSenior" inputMode="decimal" defaultValue={w.SENIOR ?? 1.1} />
          </Field>
          <Field label={t("groupRole.WORKER")}>
            <Input name="weightWorker" inputMode="decimal" defaultValue={w.WORKER ?? 1} />
          </Field>
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
          <div className="sm:col-span-3 lg:col-span-5">
            <h2 className="text-sm font-semibold">{t("settings.company.contractorRating")}</h2>
            <p className="mt-0.5 text-xs text-muted">{t("settings.company.contractorRatingHint")}</p>
          </div>
          {RATING_COMPONENTS.map((k) => (
            <Field key={k} label={t(`contractorScore.${k}`)}>
              <Input name={`rw_${k}`} inputMode="decimal" defaultValue={rw[k]} />
            </Field>
          ))}
          <div className="sm:col-span-3 lg:col-span-5">
            <h2 className="text-sm font-semibold">{t("settings.company.contractorReliability")}</h2>
            <p className="mt-0.5 text-xs text-muted">{t("settings.company.contractorReliabilityHint")}</p>
          </div>
          {RELIABILITY_COMPONENTS.map((k) => (
            <Field key={k} label={t(`contractorScore.rel_${k}`)}>
              <Input name={`lw_${k}`} inputMode="decimal" defaultValue={lw[k]} />
            </Field>
          ))}
        </Card>

        <div>
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
