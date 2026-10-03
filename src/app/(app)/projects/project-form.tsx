import { getTranslations } from "next-intl/server";
import type { Project } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Card, Field, Input, LinkButton, Notice, Select, Textarea } from "@/components/ui";
import { db } from "@/lib/db";
import { roleLabel } from "@/lib/roles";
import { isoDate } from "@/lib/utils";
import type { ActionState } from "@/lib/action";

const OBJECT_TYPES = [
  "Ma'muriy bino",
  "Savdo markazi",
  "Ishlab chiqarish",
  "Ombor / logistika",
  "Turar joy",
  "Mehmonxona",
  "Shifoxona",
  "Ta'lim muassasasi",
  "Restoran",
  "Ma'lumotlar markazi",
];

export async function ProjectForm({
  action,
  companyId,
  project,
  defaultClientId,
  cancelHref,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  companyId: string;
  project?: Project;
  defaultClientId?: string;
  cancelHref: string;
}) {
  const t = await getTranslations();
  const [clients, users, entities] = await Promise.all([
    db.client.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { companyId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, roleDef: { select: { key: true, name: true } } },
    }),
    db.legalEntity.findMany({ where: { companyId, active: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
  ]);
  const defaultEntity = entities.find((e) => e.id === project?.legalEntityId) ?? entities[0];
  const defaultVat =
    project !== undefined
      ? Number(project.contractVatRate)
      : defaultEntity?.taxRegime === "GENERAL"
        ? Number(defaultEntity.vatRate)
        : 0;

  if (clients.length === 0) {
    return (
      <div className="flex max-w-xl flex-col items-start gap-3">
        <Notice tone="warning">{t("projects.noClients")}</Notice>
        <LinkButton href="/clients/new">{t("clients.new")}</LinkButton>
      </div>
    );
  }

  const userOptions = (
    <>
      <option value="">—</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} · {roleLabel(t, u.roleDef)}
        </option>
      ))}
    </>
  );
  const clientOptions = clients.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
    </option>
  ));

  return (
    <ActionForm action={action} className="flex max-w-5xl flex-col gap-6">
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">{t("projects.sectionObject")}</h2>
        <Field label={t("projects.name")} required className="sm:col-span-2">
          <Input name="name" defaultValue={project?.name} required placeholder="BRB ma'muriy binosi" />
        </Field>
        <Field label={t("projects.objectType")}>
          <Input name="objectType" defaultValue={project?.objectType ?? ""} list="object-types" />
          <datalist id="object-types">
            {OBJECT_TYPES.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </Field>
        <Field label={t("projects.address")}>
          <Input name="address" defaultValue={project?.address ?? ""} />
        </Field>
        <Field label={t("projects.siteContactName")}>
          <Input name="siteContactName" defaultValue={project?.siteContactName ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("projects.siteContactPhone")}>
            <Input name="siteContactPhone" type="tel" defaultValue={project?.siteContactPhone ?? ""} placeholder="+998" />
          </Field>
          <Field label={t("projects.siteContactEmail")}>
            <Input name="siteContactEmail" type="email" defaultValue={project?.siteContactEmail ?? ""} />
          </Field>
        </div>
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">{t("projects.sectionParties")}</h2>
        <Field label={t("projects.customer")} hint={t("projects.customerHint")} required>
          <Select name="clientId" defaultValue={project?.clientId ?? defaultClientId ?? ""} required>
            <option value="" disabled>
              {t("projects.selectClient")}
            </option>
            {clientOptions}
          </Select>
        </Field>
        <Field label={t("projects.owner")} hint={t("projects.ownerHint")}>
          <Select name="ownerId" defaultValue={project?.ownerId ?? ""}>
            <option value="">{t("projects.ownerSameAsCustomer")}</option>
            {clientOptions}
          </Select>
        </Field>
        <Field label={t("projects.legalEntity")} hint={t("projects.legalEntityHint")}>
          <Select name="legalEntityId" defaultValue={defaultEntity?.id ?? ""}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {t(`taxRegime.${e.taxRegime}`)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("projects.contractNumber")}>
            <Input name="contractNumber" defaultValue={project?.contractNumber ?? ""} />
          </Field>
          <Field label={t("projects.contractDate")}>
            <Input name="contractDate" type="date" defaultValue={isoDate(project?.contractDate)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <MoneyInput
            label={t("projects.contractAmount")}
            required={false}
            vat
            defaultVat={defaultVat}
            defaultAmount={project ? Number(project.contractAmount) : undefined}
            defaultCurrency={project?.contractCurrency}
            defaultRate={project?.contractFxSource === "MANUAL" ? Number(project.contractFxRate) : null}
          />
          {project && <p className="mt-1.5 text-xs text-muted">{t("projects.contractChangeWarning")}</p>}
        </div>
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <h2 className="text-sm font-semibold sm:col-span-2 lg:col-span-4">{t("projects.sectionTeam")}</h2>
        <Field label={t("projects.manager")}>
          <Select name="managerId" defaultValue={project?.managerId ?? ""}>
            {userOptions}
          </Select>
        </Field>
        <Field label={t("projects.chiefEngineer")}>
          <Select name="chiefEngineerId" defaultValue={project?.chiefEngineerId ?? ""}>
            {userOptions}
          </Select>
        </Field>
        <Field label={t("projects.foreman")}>
          <Select name="foremanId" defaultValue={project?.foremanId ?? ""}>
            {userOptions}
          </Select>
        </Field>
        <Field label={t("projects.engineer")}>
          <Select name="engineerId" defaultValue={project?.engineerId ?? ""}>
            {userOptions}
          </Select>
        </Field>
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <h2 className="text-sm font-semibold sm:col-span-2 lg:col-span-4">{t("projects.sectionDates")}</h2>
        <Field label={t("projects.startDate")}>
          <Input name="startDate" type="date" defaultValue={isoDate(project?.startDate)} />
        </Field>
        <Field label={t("projects.plannedEndDate")}>
          <Input name="plannedEndDate" type="date" defaultValue={isoDate(project?.plannedEndDate)} />
        </Field>
        <Field label={t("projects.actualEndDate")}>
          <Input name="actualEndDate" type="date" defaultValue={isoDate(project?.actualEndDate)} />
        </Field>
        <Field label={t("projects.warrantyMonths")}>
          <Input name="warrantyMonths" inputMode="numeric" defaultValue={project?.warrantyMonths ?? 12} />
        </Field>
        <Field label={t("projects.priority")}>
          <Select name="priority" defaultValue={project?.priority ?? "MEDIUM"}>
            {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </Select>
        </Field>
        {project && (
          <Field label={t("projects.lifecycle")}>
            <Select name="status" defaultValue={project.status}>
              {(["ACTIVE", "ON_HOLD", "CLOSED", "CANCELLED"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`projectStatus.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t("common.note")} className="sm:col-span-2 lg:col-span-4">
          <Textarea name="note" defaultValue={project?.note ?? ""} rows={2} />
        </Field>
      </Card>

      <div className="flex gap-2">
        <SubmitButton>{t("common.save")}</SubmitButton>
        <LinkButton href={cancelHref} variant="secondary">
          {t("common.cancel")}
        </LinkButton>
      </div>
    </ActionForm>
  );
}
