import { getTranslations } from "next-intl/server";
import type { WorkType } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, Input, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { saveWorkType } from "../actions";

async function Row({ w, used }: { w?: WorkType; used?: number }) {
  const t = await getTranslations();
  return (
    <ActionForm
      action={saveWorkType.bind(null, w?.id ?? null)}
      resetOnSuccess={!w}
      className="grid items-center gap-2 border-t border-border px-5 py-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_5rem_auto_auto]"
    >
      <Input name="name" defaultValue={w?.name} required placeholder={t("workTypes.namePlaceholder")} aria-label={t("workTypes.name")} />
      <Input name="unit" defaultValue={w?.unit} required placeholder="m²" aria-label={t("common.unit")} />
      <Input name="sortOrder" inputMode="numeric" defaultValue={w?.sortOrder ?? 99} aria-label={t("statuses.order")} />
      {w ? (
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="active" defaultChecked={w.active} className="size-4" />
          {t("users.active")}
          {!!used && <span className="text-xs text-muted">({used})</span>}
        </label>
      ) : (
        <span />
      )}
      <SubmitButton variant="secondary">{w ? t("common.save") : t("common.add")}</SubmitButton>
    </ActionForm>
  );
}

export default async function WorkTypesPage() {
  const user = await requirePermission("settings.manage");
  const t = await getTranslations();
  const types = await db.workType.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { tasks: true } } },
  });
  return (
    <>
      <PageHeader title={t("settings.workTypes.title")} subtitle={t("workTypes.subtitle")} back={{ href: "/settings", label: t("settings.title") }} />
      <Card className="max-w-4xl">
        <CardHeader title={t("settings.workTypes.title")} />
        {types.map((w) => (
          <Row key={w.id} w={w} used={w._count.tasks} />
        ))}
        <Row />
      </Card>
    </>
  );
}
