import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { employerMonthlyCost, grossSalary } from "@/lib/payroll";
import { formatUzs } from "@/lib/format";
import { Card, CardHeader, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { updateCompanySettings } from "../actions";

export default async function CompanySettingsPage() {
  const user = await requirePermission("settings.manage");
  const t = await getTranslations();
  const c = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
  const w = (c.contributionWeights ?? {}) as Record<string, number>;
  const example = 6_000_000;

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

        <div>
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
