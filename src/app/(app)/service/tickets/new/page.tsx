import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { toDateOnly } from "@/lib/utils";
import { Card, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { DEFAULT_SLA } from "@/lib/sla";
import { createTicket } from "../../actions";

export default async function NewTicketPage({ searchParams }: PageProps<"/service/tickets/new">) {
  const user = await requirePermission("service.edit");
  const sp = (await searchParams) as { project?: string; contract?: string };
  const t = await getTranslations();
  const today = toDateOnly(new Date());
  const [clients, projects, contracts, users] = await Promise.all([
    db.client.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, warrantyEnd: true } }),
    db.serviceContract.findMany({ where: { companyId: user.companyId, status: "ACTIVE", endDate: { gte: today } }, include: { client: { select: { name: true } } }, orderBy: { number: "asc" } }),
    db.user.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title={t("service.newTicket")} back={{ href: "/service", label: t("service.title") }} />
      <div className="mb-4">
        <Notice>{t("service.newTicketHint", { c: String(DEFAULT_SLA.CRITICAL.resolve), h: String(DEFAULT_SLA.HIGH.resolve), m: String(DEFAULT_SLA.MEDIUM.resolve) })}</Notice>
      </div>
      <Card>
        <ActionForm action={createTicket} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("service.ticketTitle")} required className="sm:col-span-2 lg:col-span-3">
            <Input name="title" required placeholder={t("service.ticketTitlePlaceholder")} />
          </Field>
          <Field label={t("projects.project")}>
            <Select name="projectId" defaultValue={sp.project ?? ""}>
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.warrantyEnd && p.warrantyEnd >= today ? ` (${t("service.warranty")})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("service.contract")}>
            <Select name="serviceContractId" defaultValue={sp.contract ?? ""}>
              <option value="">—</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} · {c.client.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("clients.client")} hint={t("service.clientHint")}>
            <Select name="clientId" defaultValue="">
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("projects.priority")}>
            <Select name="priority" defaultValue="MEDIUM">
              {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("service.responsible")}>
            <Select name="responsibleUserId" defaultValue="">
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("service.warranty")} hint={t("service.warrantyHint")}>
            <Select name="warranty" defaultValue="auto">
              <option value="auto">{t("service.warrantyAuto")}</option>
              <option value="yes">{t("common.yes")}</option>
              <option value="no">{t("common.no")}</option>
            </Select>
          </Field>
          <Field label={t("service.siteAddress")} className="sm:col-span-2 lg:col-span-3">
            <Input name="siteAddress" placeholder={t("service.siteAddressHint")} />
          </Field>
          <Field label={t("service.problem")} required className="sm:col-span-2 lg:col-span-3">
            <Textarea name="problem" required />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <SubmitButton>{t("common.create")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
