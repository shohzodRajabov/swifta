import { getTranslations } from "next-intl/server";
import type { Project } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Field, Input, LinkButton, Notice, Select, Textarea } from "@/components/ui";
import { db } from "@/lib/db";
import { isoDate } from "@/lib/utils";
import type { ActionState } from "@/lib/action";

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
  const [clients, users] = await Promise.all([
    db.client.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { companyId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);
  const managers = users.filter((u) => u.role === "PROJECT_MANAGER" || u.role === "ADMIN");
  const engineers = users.filter((u) => u.role === "ENGINEER" || u.role === "PROJECT_MANAGER");

  if (clients.length === 0) {
    return (
      <div className="flex max-w-xl flex-col items-start gap-3">
        <Notice tone="warning">{t("projects.noClients")}</Notice>
        <LinkButton href="/clients/new">{t("clients.new")}</LinkButton>
      </div>
    );
  }

  return (
    <ActionForm action={action} className="grid max-w-4xl gap-4 sm:grid-cols-2">
      <Field label={t("projects.name")} required className="sm:col-span-2">
        <Input name="name" defaultValue={project?.name} required placeholder="BRB ma'muriy binosi" />
      </Field>
      <Field label={t("projects.client")} required>
        <Select name="clientId" defaultValue={project?.clientId ?? defaultClientId ?? ""} required>
          <option value="" disabled>
            {t("projects.selectClient")}
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("projects.address")}>
        <Input name="address" defaultValue={project?.address ?? ""} />
      </Field>
      <Field label={t("projects.contractNumber")}>
        <Input name="contractNumber" defaultValue={project?.contractNumber ?? ""} />
      </Field>
      <Field label={t("projects.contractDate")}>
        <Input name="contractDate" type="date" defaultValue={isoDate(project?.contractDate)} />
      </Field>
      <div className="sm:col-span-2">
        <MoneyInput
          label={t("projects.contractAmount")}
          required={false}
          defaultAmount={project ? Number(project.contractAmount) : undefined}
          defaultCurrency={project?.contractCurrency}
          defaultRate={project?.contractFxSource === "MANUAL" ? Number(project.contractFxRate) : null}
        />
        {project && <p className="mt-1.5 text-xs text-muted">{t("projects.contractChangeWarning")}</p>}
      </div>
      <Field label={t("projects.manager")}>
        <Select name="managerId" defaultValue={project?.managerId ?? ""}>
          <option value="">—</option>
          {managers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("projects.engineer")}>
        <Select name="engineerId" defaultValue={project?.engineerId ?? ""}>
          <option value="">—</option>
          {engineers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("projects.installTeam")}>
        <Input name="installTeam" defaultValue={project?.installTeam ?? ""} />
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
      <Field label={t("projects.startDate")}>
        <Input name="startDate" type="date" defaultValue={isoDate(project?.startDate)} />
      </Field>
      <Field label={t("projects.plannedEndDate")}>
        <Input name="plannedEndDate" type="date" defaultValue={isoDate(project?.plannedEndDate)} />
      </Field>
      {project && (
        <>
          <Field label={t("projects.actualEndDate")}>
            <Input name="actualEndDate" type="date" defaultValue={isoDate(project.actualEndDate)} />
          </Field>
          <Field label={t("projects.status")}>
            <Select name="status" defaultValue={project.status}>
              {(["ACTIVE", "ON_HOLD", "CLOSED", "CANCELLED"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`projectStatus.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}
      <Field label={t("common.note")} className="sm:col-span-2">
        <Textarea name="note" defaultValue={project?.note ?? ""} rows={2} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>{t("common.save")}</SubmitButton>
        <LinkButton href={cancelHref} variant="secondary">
          {t("common.cancel")}
        </LinkButton>
      </div>
    </ActionForm>
  );
}
