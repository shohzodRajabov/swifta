import { getTranslations } from "next-intl/server";
import type { LegalEntity } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { saveLegalEntity } from "../actions";

async function EntityForm({ entity }: { entity?: LegalEntity }) {
  const t = await getTranslations();
  return (
    <ActionForm action={saveLegalEntity.bind(null, entity?.id ?? null)} resetOnSuccess={!entity} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <Field label={t("firms.name")} required className="sm:col-span-2">
        <Input name="name" defaultValue={entity?.name} required />
      </Field>
      <Field label={t("firms.tin")}>
        <Input name="tin" defaultValue={entity?.tin ?? ""} />
      </Field>
      <Field label={t("firms.director")}>
        <Input name="director" defaultValue={entity?.director ?? ""} />
      </Field>
      <Field label={t("firms.taxRegime")}>
        <Select name="taxRegime" defaultValue={entity?.taxRegime ?? "GENERAL"}>
          <option value="GENERAL">{t("taxRegime.GENERAL")}</option>
          <option value="TURNOVER">{t("taxRegime.TURNOVER")}</option>
        </Select>
      </Field>
      <Field label={t("firms.vatRate")}>
        <Input name="vatRate" inputMode="decimal" defaultValue={entity ? Number(entity.vatRate) : 12} />
      </Field>
      <Field label={t("firms.turnoverTaxRate")}>
        <Input name="turnoverTaxRate" inputMode="decimal" defaultValue={entity ? Number(entity.turnoverTaxRate) : 4} />
      </Field>
      <Field label={t("firms.profitTaxRate")}>
        <Input name="profitTaxRate" inputMode="decimal" defaultValue={entity ? Number(entity.profitTaxRate) : 15} />
      </Field>
      <Field label={t("firms.address")} className="sm:col-span-2">
        <Input name="address" defaultValue={entity?.address ?? ""} />
      </Field>
      <Field label={t("firms.phone")}>
        <Input name="phone" defaultValue={entity?.phone ?? ""} />
      </Field>
      <div className="flex items-end gap-4 pb-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="isDefault" defaultChecked={entity?.isDefault} className="size-4" />
          {t("firms.isDefault")}
        </label>
        {entity && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="active" defaultChecked={entity.active} className="size-4" />
            {t("users.active")}
          </label>
        )}
      </div>
      <Field label={t("firms.bankDetails")} className="sm:col-span-2 lg:col-span-4">
        <Textarea name="bankDetails" rows={2} defaultValue={entity?.bankDetails ?? ""} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-4">
        <SubmitButton>{entity ? t("common.save") : t("common.create")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function FirmsPage() {
  const user = await requirePermission("settings.manage");
  const t = await getTranslations();
  const entities = await db.legalEntity.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { projects: true } } },
  });
  return (
    <>
      <PageHeader title={t("settings.firms.title")} subtitle={t("firms.subtitle")} back={{ href: "/settings", label: t("settings.title") }} />
      <div className="flex flex-col gap-6">
        {entities.map((e) => (
          <Card key={e.id} className={e.active ? "" : "opacity-60"}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {e.name}
                  {e.isDefault && <Badge tone="primary">{t("firms.default")}</Badge>}
                  <Badge>{t(`taxRegime.${e.taxRegime}`)}</Badge>
                </span>
              }
              subtitle={t("firms.projectsCount", { n: e._count.projects })}
            />
            <EntityForm entity={e} />
          </Card>
        ))}
        <Card>
          <CardHeader title={t("firms.new")} />
          <EntityForm />
        </Card>
      </div>
    </>
  );
}
