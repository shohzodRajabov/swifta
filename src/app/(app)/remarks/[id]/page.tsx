import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAnyPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { PriorityBadge } from "@/components/project-bits";
import { RemarkStatusBadge } from "@/components/task-bits";
import { Attachments } from "@/components/attachments";
import { projectWhere } from "@/server/projects/access";
import { setRemarkStatus } from "@/app/(app)/tasks/actions";

const FLOW: Record<string, string[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS"],
  ASSIGNED: ["IN_PROGRESS", "FIXED"],
  IN_PROGRESS: ["FIXED"],
  FIXED: ["REINSPECTION", "ACCEPTED", "IN_PROGRESS"],
  REINSPECTION: ["ACCEPTED", "IN_PROGRESS"],
  ACCEPTED: ["IN_PROGRESS"],
};

export default async function RemarkPage({ params }: PageProps<"/remarks/[id]">) {
  const { id } = await params;
  const user = await requireAnyPermission("tasks.view", "remarks.create", "remarks.manage");
  const remark = await db.remark.findFirst({
    where: { id, companyId: user.companyId, project: projectWhere(user) },
    include: {
      project: { select: { id: true, name: true } },
      task: { select: { id: true, number: true, title: true } },
      location: { select: { name: true } },
      responsible: { select: { name: true } },
      createdBy: { select: { name: true } },
      inspection: { select: { attempt: true } },
      drawingVersion: { select: { drawingId: true, version: true, drawing: { select: { title: true } } } },
    },
  });
  if (!remark) notFound();
  const t = await getTranslations();
  const manager = can(user, "remarks.manage");
  const options = (FLOW[remark.status] ?? []).filter((s) => manager || (remark.responsibleUserId === user.id && ["IN_PROGRESS", "FIXED"].includes(s)));
  const users = manager ? await db.user.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  return (
    <>
      <PageHeader
        title={
          <>
            <span className="num text-muted">#{remark.number}</span> {t("remarks.remark")}
          </>
        }
        back={{ href: "/remarks", label: t("remarks.title") }}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/projects/${remark.project.id}`} className="hover:text-primary">
              {remark.project.name}
            </Link>
            <RemarkStatusBadge status={remark.status} />
            {remark.priority !== "MEDIUM" && <PriorityBadge priority={remark.priority} />}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card className="p-5">
            <p className="whitespace-pre-line">{remark.description}</p>
          </Card>
          {options.length > 0 && (
            <Card>
              <CardHeader title={t("tasks.changeStatus")} />
              <ActionForm action={setRemarkStatus.bind(null, remark.id)} className="flex flex-wrap items-end gap-2 p-5">
                <Field label={t("common.status")}>
                  <Select name="to" className="w-48">
                    {options.map((s) => (
                      <option key={s} value={s}>
                        {t(`remarkStatus.${s}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {manager && (
                  <Field label={t("remarks.responsible")}>
                    <Select name="responsibleUserId" defaultValue={remark.responsibleUserId ?? ""} className="w-48">
                      <option value="">—</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label={t("common.note")} className="min-w-48 flex-1">
                  <Input name="note" />
                </Field>
                <SubmitButton>{t("common.save")}</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card>
            <CardHeader title={t("attachments.title")} subtitle={t("remarks.photoHint")} />
            <div className="p-5">
              <Attachments entityType="remark" entityId={remark.id} canUpload />
            </div>
          </Card>
        </div>
        <Card className="h-fit p-5">
          <dl className="space-y-1.5 text-sm">
            {[
              [t("remarks.responsible"), remark.responsible?.name ?? "—"],
              [t("tasks.deadline"), formatDate(remark.deadline)],
              [t("tasks.location"), remark.location?.name],
              [t("remarks.createdBy"), remark.createdBy?.name],
              [t("remarks.createdAt"), formatDateTime(remark.createdAt)],
              [t("remarks.fixedAt"), remark.fixedAt ? formatDateTime(remark.fixedAt) : null],
              [t("remarks.acceptedAt"), remark.acceptedAt ? formatDateTime(remark.acceptedAt) : null],
              [t("tasks.inspection"), remark.inspection ? `#${remark.inspection.attempt}` : null],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
          </dl>
          {remark.drawingVersion && (
            <p className="mt-3 border-t border-border pt-3 text-sm">
              <Link href={`/projects/${remark.project.id}/drawings/${remark.drawingVersion.drawingId}?v=${remark.drawingVersion.version}&page=${remark.drawingPage ?? 1}`} className="text-primary">
                ◎ {t("drawings.showOnDrawing")}: {remark.drawingVersion.drawing.title} v{remark.drawingVersion.version}
              </Link>
            </p>
          )}
          {remark.task && (
            <p className="mt-3 border-t border-border pt-3 text-sm">
              <Link href={`/tasks/${remark.task.id}`} className="text-primary">
                T-{remark.task.number} {remark.task.title}
              </Link>
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
