import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatNumber, formatQty } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import { Badge, Card, CardHeader, Empty, Field, Input, LinkButton, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { ProgressBar } from "@/components/project-bits";
import { DeadlineBadge, RemarkStatusBadge, TaskStatusBadge } from "@/components/task-bits";
import { taskWhere } from "@/server/workforce/access";
import { deadlineState } from "@/server/workforce/tasks";
import { projectProgress, taskPercent } from "@/server/projects/progress";
import { addLocation, deleteLocation } from "@/app/(app)/tasks/actions";

export async function TasksTab({ user, projectId }: { user: CurrentUser; projectId: string }) {
  const t = await getTranslations();
  const manager = can(user, "tasks.manage");
  const [tasks, locations, remarks, progress, labor, imports] = await Promise.all([
    db.task.findMany({
      where: { AND: [taskWhere(user), { projectId }] },
      orderBy: [{ location: { sortOrder: "asc" } }, { number: "asc" }],
      include: {
        location: { select: { id: true, name: true } },
        workType: { select: { name: true } },
        assignments: { include: { group: { select: { name: true } }, employee: { select: { fullName: true } }, contractor: { select: { name: true } } } },
      },
    }),
    db.projectLocation.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" }, include: { _count: { select: { tasks: true } } } }),
    db.remark.findMany({
      where: { projectId, status: { not: "ACCEPTED" } },
      orderBy: { number: "desc" },
      take: 20,
      select: { id: true, number: true, description: true, status: true, deadline: true },
    }),
    projectProgress([projectId]).then((m) => m.get(projectId)),
    db.workSession.aggregate({ where: { projectId, status: { not: "REJECTED" } }, _sum: { laborCostUzs: true, hours: true }, _count: { _all: true } }),
    can(user, "import.manage") || can(user, "import.approve") ? db.smetaImport.count({ where: { projectId, status: "DRAFT" } }) : Promise.resolve(0),
  ]);
  const done = await db.workSession.groupBy({ by: ["taskId"], where: { projectId, status: "APPROVED" }, _sum: { quantity: true } });
  const doneMap = new Map(done.map((d) => [d.taskId, Number(d._sum.quantity ?? 0)]));
  const byStatus = new Map<string, number>();
  for (const tk of tasks) byStatus.set(tk.status, (byStatus.get(tk.status) ?? 0) + 1);
  const canSeeCost = can(user, "finance.view") || can(user, "salaries.view");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted">{t("tasks.physicalProgress")}</div>
          <div className="mt-2">
            <ProgressBar percent={progress?.percent ?? null} />
          </div>
          <div className="mt-1 text-xs text-muted">{t("tasks.progressHint")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">{t("tasks.title")}</div>
          <div className="num mt-1 text-2xl font-semibold">{tasks.length}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {[...byStatus.entries()].map(([s, n]) => (
              <span key={s} className="text-xs text-muted">
                {t(`taskStatus.${s}`)}: {n}
              </span>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">{t("sessions.title")}</div>
          <div className="num mt-1 text-2xl font-semibold">{labor._count._all}</div>
          <div className="num text-xs text-muted">
            {formatNumber(Number(labor._sum.hours ?? 0))} {t("employees.hourShort")}
            {canSeeCost && ` · ${formatNumber(Number(labor._sum.laborCostUzs ?? 0))} UZS`}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">{t("remarks.open")}</div>
          <div className="num mt-1 text-2xl font-semibold">{remarks.length}</div>
          <Link href={`/remarks?project=${projectId}`} className="text-xs text-primary">
            {t("common.open")} →
          </Link>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t("tasks.title")}
          action={
            <div className="flex gap-2">
              {(can(user, "import.manage") || can(user, "import.approve")) && (
                <LinkButton href={`/projects/${projectId}/import`} variant="secondary" className="h-8">
                  {t("smeta.import")}
                  {imports > 0 && <Badge tone="warning">{imports}</Badge>}
                </LinkButton>
              )}
              {manager && (
                <LinkButton href={`/tasks/new?project=${projectId}`} className="h-8">
                  <Plus className="size-4" aria-hidden />
                  {t("tasks.new")}
                </LinkButton>
              )}
            </div>
          }
        />
        {tasks.length === 0 ? (
          <Empty>{t("tasks.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("tasks.task")}</Th>
                <Th>{t("tasks.performers")}</Th>
                <Th>{t("common.status")}</Th>
                <Th>{t("tasks.progress")}</Th>
                <Th className="text-right">{t("tasks.deadline")}</Th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((tk, i) => {
                const doneQty = doneMap.get(tk.id) ?? 0;
                const pct = taskPercent({ plannedQty: tk.plannedQty ? Number(tk.plannedQty) : null, doneQty, status: tk.status, reportedPercent: tk.reportedPercent });
                const newLoc = i === 0 || tasks[i - 1].locationId !== tk.locationId;
                return [
                  newLoc && (
                    <tr key={`loc-${tk.id}`}>
                      <td colSpan={5} className="bg-surface-2/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                        {tk.location?.name ?? t("tasks.noLocation")}
                      </td>
                    </tr>
                  ),
                  <tr key={tk.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/tasks/${tk.id}`} className="hover:text-primary">
                        <span className="num text-muted">T-{tk.number}</span> {tk.title}
                      </Link>
                      {tk.workType && <div className="text-xs text-muted">{tk.workType.name}</div>}
                    </Td>
                    <Td className="text-xs">
                      {tk.assignments.map((a) => a.group?.name ?? a.employee?.fullName ?? a.contractor?.name).filter(Boolean).join(", ") || "—"}
                    </Td>
                    <Td>
                      <TaskStatusBadge status={tk.status} />
                    </Td>
                    <Td>
                      <ProgressBar percent={pct} />
                      {tk.plannedQty && (
                        <div className="num text-xs text-muted">
                          {formatQty(doneQty)} / {formatQty(Number(tk.plannedQty))} {tk.unit}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="num">{formatDate(tk.deadline)}</div>
                      <DeadlineBadge state={deadlineState(tk)} />
                    </Td>
                  </tr>,
                ];
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("tasks.locations")} subtitle={t("tasks.locationsHint")} />
          {locations.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {locations.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 px-5 py-2">
                  <span>
                    {l.parentId && <span className="text-muted">↳ </span>}
                    {l.name} <span className="text-xs text-muted">· {t(`locationKind.${l.kind}`)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="num text-xs text-muted">{l._count.tasks}</span>
                    {manager && l._count.tasks === 0 && <DeleteButton action={deleteLocation} id={l.id} label="×" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {manager && (
            <ActionForm action={addLocation.bind(null, projectId)} resetOnSuccess className="grid gap-2 border-t border-border p-4 sm:grid-cols-4">
              <Field label={t("common.name")} className="sm:col-span-2">
                <Input name="name" required placeholder={t("tasks.locationPlaceholder")} />
              </Field>
              <Field label={t("tasks.locationKind")}>
                <Select name="kind" defaultValue="FLOOR">
                  {(["FLOOR", "ZONE", "ROOM", "OTHER"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`locationKind.${k}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("tasks.locationParent")}>
                <Select name="parentId" defaultValue="">
                  <option value="">—</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-4">
                <SubmitButton variant="secondary">{t("common.add")}</SubmitButton>
              </div>
            </ActionForm>
          )}
        </Card>
        <Card>
          <CardHeader title={t("remarks.open")} />
          {remarks.length === 0 ? (
            <Empty>{t("remarks.empty")}</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {remarks.map((r) => (
                <li key={r.id}>
                  <Link href={`/remarks/${r.id}`} className="flex items-center gap-2 px-5 py-2 hover:bg-surface-2/60">
                    <span className="num text-muted">#{r.number}</span>
                    <span className="min-w-0 flex-1 truncate">{r.description}</span>
                    <RemarkStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
