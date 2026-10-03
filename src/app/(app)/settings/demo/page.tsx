import { getTranslations } from "next-intl/server";
import { FlaskConical } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Button, Card, CardHeader, Notice, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ConfirmForm } from "@/components/forms/confirm-form";
import { deleteDemo, rebuildDemo, switchWorkspace } from "./actions";

export default async function DemoPage() {
  const user = await requirePermission("demo.access");
  const t = await getTranslations();
  const demo = await db.company.findFirst({
    where: { isDemo: true },
    include: { _count: { select: { projects: true, employees: true, tasks: true, contractors: true } } },
  });
  return (
    <>
      <PageHeader title={t("settings.demo.title")} subtitle={t("demo.subtitle")} back={{ href: "/settings", label: t("settings.title") }} />
      <div className="flex max-w-3xl flex-col gap-6">
        <Notice tone="primary">{t("demo.explain")}</Notice>
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <FlaskConical className="size-4 text-warning" aria-hidden />
                {demo ? t("demo.exists") : t("demo.missing")}
              </span>
            }
            subtitle={
              demo
                ? t("demo.stats", {
                    projects: demo._count.projects,
                    employees: demo._count.employees,
                    tasks: demo._count.tasks,
                    contractors: demo._count.contractors,
                    date: formatDateTime(demo.createdAt),
                  })
                : undefined
            }
          />
          <div className="flex flex-wrap items-start gap-3 p-5">
            {!user.company.isDemo && (
              <ActionForm action={rebuildDemo}>
                <SubmitButton>{demo ? t("demo.rebuild") : t("demo.create")}</SubmitButton>
              </ActionForm>
            )}
            {demo && !user.company.isDemo && (
              <form action={switchWorkspace}>
                <Button type="submit" variant="secondary">
                  {t("workspace.openDemo")}
                </Button>
              </form>
            )}
            {demo && !user.company.isDemo && <ConfirmForm action={deleteDemo} id={demo.id} label={t("demo.delete")} />}
          </div>
        </Card>
      </div>
    </>
  );
}
