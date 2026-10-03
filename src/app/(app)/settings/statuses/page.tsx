import { getTranslations } from "next-intl/server";
import type { DocumentCategory, StatusDef } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { Badge, Card, CardHeader, Input, Notice, PageHeader } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { getStatusCatalog } from "@/server/projects/status";
import { DOC_CATEGORIES } from "@/app/(app)/projects/[id]/tabs/documents";
import { deleteStatus, saveStatus, updateStatusGroup } from "../actions";

async function StatusRow({ groupId, status }: { groupId: string; status?: StatusDef }) {
  const t = await getTranslations();
  const required = new Set<DocumentCategory>(status?.requiredDocs ?? []);
  return (
    <ActionForm
      action={saveStatus.bind(null, groupId, status?.id ?? null)}
      resetOnSuccess={!status}
      className={`grid gap-2 border-t border-border px-5 py-3 md:grid-cols-[5rem_minmax(0,1fr)_5rem_auto_auto] md:items-start ${status ? "md:pr-28" : ""}`}
    >
      <Input name="code" defaultValue={status?.code ?? ""} placeholder="D8" required aria-label={t("statuses.code")} />
      <div className="min-w-0">
        <Input name="name" defaultValue={status?.name ?? ""} placeholder={t("statuses.newPlaceholder")} required aria-label={t("statuses.name")} />
        <details className="mt-1.5 text-xs">
          <summary className="cursor-pointer text-muted">
            {t("statuses.requiredDocs")}
            {required.size > 0 && (
              <Badge tone="warning" className="ml-1.5">
                {required.size}
              </Badge>
            )}
          </summary>
          <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {DOC_CATEGORIES.map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <input type="checkbox" name="requiredDocs" value={c} defaultChecked={required.has(c)} className="size-3.5" />
                {t(`docCategory.${c}`)}
              </label>
            ))}
          </div>
        </details>
      </div>
      <Input name="sortOrder" inputMode="numeric" defaultValue={status?.sortOrder ?? 99} aria-label={t("statuses.order")} />
      {status ? (
        <label className="flex items-center gap-1.5 pt-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={status.active} className="size-4" />
          {t("users.active")}
        </label>
      ) : (
        <span />
      )}
      <div className="flex items-start gap-1">
        <SubmitButton variant="secondary">{status ? t("common.save") : t("common.add")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function StatusesPage() {
  const user = await requirePermission("settings.manage");
  const t = await getTranslations();
  const catalog = await getStatusCatalog(user.companyId);
  return (
    <>
      <PageHeader title={t("settings.statuses.title")} subtitle={t("statuses.subtitle")} back={{ href: "/settings", label: t("settings.title") }} />
      <div className="mb-6">
        <Notice>{t("statuses.groupsFixed")}</Notice>
      </div>
      <div className="flex flex-col gap-6">
        {catalog.map((g) => (
          <Card key={g.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: g.color }} aria-hidden />
                  {g.letter}. {g.name}
                  <Badge>{t(`statusGroup.${g.code}`)}</Badge>
                </span>
              }
              action={
                <ActionForm action={updateStatusGroup.bind(null, g.id)} className="flex items-center gap-2">
                  <Input name="name" defaultValue={g.name} className="h-8 w-56" aria-label={t("statuses.groupName")} />
                  <input type="color" name="color" defaultValue={g.color} className="h-8 w-10 cursor-pointer rounded border border-border bg-surface" aria-label={t("statuses.color")} />
                  <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
                </ActionForm>
              }
            />
            {g.statuses.map((s) => (
              <div key={s.id} className="relative">
                <StatusRow groupId={g.id} status={s} />
                <div className="absolute right-4 top-3.5 hidden md:block">
                  <DeleteButton action={deleteStatus} id={s.id} />
                </div>
              </div>
            ))}
            <StatusRow groupId={g.id} />
          </Card>
        ))}
      </div>
    </>
  );
}
