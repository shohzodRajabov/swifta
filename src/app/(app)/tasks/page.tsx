import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Prisma, TaskStatus } from "@prisma/client";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Empty, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { PriorityBadge, ProgressBar } from "@/components/project-bits";
import { DeadlineBadge, TaskStatusBadge, TASK_TONE } from "@/components/task-bits";
import { taskWhere, myTaskConditions } from "@/server/workforce/access";
import { deadlineState } from "@/server/workforce/tasks";
import { taskPercent } from "@/server/projects/progress";

const STATUSES: TaskStatus[] = ["NEW", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "INSPECTION", "APPROVED", "REWORK", "BLOCKED", "CANCELLED"];
const BOARD: TaskStatus[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "INSPECTION", "REWORK", "APPROVED"];

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requirePermission("tasks.view");
  const sp = (await searchParams) as { view?: string; q?: string; project?: string; status?: string; group?: string; mine?: string; due?: string };
  const t = await getTranslations();
  const view = sp.view === "board" ? "board" : "list";
  const today = new Date();

  const where: Prisma.TaskWhereInput = {
    AND: [
      taskWhere(user),
      sp.q ? { OR: [{ title: { contains: sp.q, mode: "insensitive" } }, ...(Number(sp.q) ? [{ number: Number(sp.q.replace(/\D/g, "")) }] : [])] } : {},
      sp.project ? { projectId: sp.project } : {},
      sp.status === "open" || !sp.status ? { status: { notIn: ["APPROVED", "CANCELLED"] } } : sp.status === "all" ? {} : { status: sp.status as TaskStatus },
      sp.group ? { assignments: { some: { groupId: sp.group } } } : {},
      sp.mine === "1" ? { OR: myTaskConditions(user) } : {},
      sp.due === "overdue" ? { deadline: { lt: new Date(today.toISOString().slice(0, 10)) } } : {},
    ],
  };
  const [tasks, projects, groups, stats] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { number: "desc" }],
      take: view === "board" ? 400 : 300,
      include: {
        project: { select: { id: true, name: true } },
        workType: { select: { name: true } },
        location: { select: { name: true } },
        assignments: { include: { employee: { select: { fullName: true } }, group: { select: { name: true } }, contractor: { select: { name: true } } } },
        _count: { select: { remarks: { where: { status: { not: "ACCEPTED" } } } } },
      },
    }),
    db.project.findMany({ where: { companyId: user.companyId, tasks: { some: taskWhere(user) } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.workGroup.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    can(user, "sessions.approve") ? db.workSession.count({ where: { companyId: user.companyId, status: "SUBMITTED" } }) : Promise.resolve(0),
  ]);
  const done = await db.workSession.groupBy({
    by: ["taskId"],
    where: { taskId: { in: tasks.map((x) => x.id) }, status: "APPROVED" },
    _sum: { quantity: true },
  });
  const doneMap = new Map(done.map((d) => [d.taskId, Number(d._sum.quantity ?? 0)]));
  const rows = tasks.map((tk) => {
    const doneQty = doneMap.get(tk.id) ?? 0;
    return {
      ...tk,
      doneQty,
      percent: taskPercent({ plannedQty: tk.plannedQty ? Number(tk.plannedQty) : null, doneQty, status: tk.status, reportedPercent: tk.reportedPercent }),
      dl: deadlineState(tk),
      who: tk.assignments.map((a) => a.group?.name ?? a.employee?.fullName ?? a.contractor?.name ?? "").filter(Boolean),
    };
  });
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/tasks?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={t("tasks.title")}
        actions={
          <>
            {can(user, "sessions.approve") && (
              <LinkButton href="/tasks/sessions" variant="secondary">
                {t("sessions.approvals")}
                {stats > 0 && <Badge tone="warning">{stats}</Badge>}
              </LinkButton>
            )}
            <LinkButton href="/remarks" variant="secondary">
              {t("remarks.title")}
            </LinkButton>
            {can(user, "tasks.manage") && (
              <LinkButton href={`/tasks/new${sp.project ? `?project=${sp.project}` : ""}`}>
                <Plus className="size-4" aria-hidden />
                {t("tasks.new")}
              </LinkButton>
            )}
          </>
        }
      />
      <Card className="mb-4">
        <form className="flex flex-wrap items-center gap-2 p-3">
          <input type="hidden" name="view" value={view} />
          <Input name="q" defaultValue={sp.q} placeholder={t("tasks.searchPlaceholder")} className="w-56" />
          <Select name="project" defaultValue={sp.project ?? ""} className="w-56">
            <option value="">{t("tasks.allProjects")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={sp.status ?? "open"} className="w-44">
            <option value="open">{t("tasks.statusOpen")}</option>
            <option value="all">{t("common.all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`taskStatus.${s}`)}
              </option>
            ))}
          </Select>
          <Select name="group" defaultValue={sp.group ?? ""} className="w-44">
            <option value="">{t("tasks.allGroups")}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} /> {t("tasks.onlyMine")}
          </label>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" name="due" value="overdue" defaultChecked={sp.due === "overdue"} /> {t("deadline.OVERDUE")}
          </label>
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
          <div className="ml-auto flex rounded-lg border border-border p-0.5 text-sm">
            {(["list", "board"] as const).map((v) => (
              <Link key={v} href={qs({ view: v })} className={cn("rounded-md px-2.5 py-1", view === v ? "bg-surface-2 font-medium" : "text-muted")}>
                {t(`tasks.view_${v}`)}
              </Link>
            ))}
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <Empty>{t("tasks.empty")}</Empty>
        </Card>
      ) : view === "list" ? (
        <Card>
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
              {rows.map((tk) => (
                <tr key={tk.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/tasks/${tk.id}`} className="font-medium hover:text-primary">
                      <span className="num text-muted">T-{tk.number}</span> {tk.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {tk.project.name}
                      {tk.location && ` · ${tk.location.name}`}
                      {tk.workType && ` · ${tk.workType.name}`}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tk.priority !== "MEDIUM" && <PriorityBadge priority={tk.priority} />}
                      {tk._count.remarks > 0 && <Badge tone="danger">{t("tasks.remarksCount", { n: String(tk._count.remarks) })}</Badge>}
                    </div>
                  </Td>
                  <Td className="text-xs">{tk.who.join(", ") || "—"}</Td>
                  <Td>
                    <TaskStatusBadge status={tk.status} />
                  </Td>
                  <Td>
                    <ProgressBar percent={tk.percent} />
                    {tk.plannedQty && (
                      <div className="num mt-0.5 text-xs text-muted">
                        {formatQty(tk.doneQty)} / {formatQty(Number(tk.plannedQty))} {tk.unit}
                      </div>
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="num">{formatDate(tk.deadline)}</div>
                    <DeadlineBadge state={tk.dl} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {BOARD.map((s) => {
            const col = rows.filter((r) => r.status === s || (s === "REWORK" && (r.status === "REJECTED" || r.status === "BLOCKED")) || (s === "ASSIGNED" && r.status === "ACCEPTED"));
            return (
              <div key={s} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <Badge tone={TASK_TONE[s]}>{t(`taskStatus.${s}`)}</Badge>
                  <span className="num text-xs text-muted">{col.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.map((tk) => (
                    <Link key={tk.id} href={`/tasks/${tk.id}`}>
                      <Card className="p-3 transition-colors hover:border-primary/50">
                        <div className="text-sm font-medium">
                          <span className="num text-muted">T-{tk.number}</span> {tk.title}
                        </div>
                        <div className="mt-0.5 text-xs text-muted">{tk.project.name}</div>
                        <div className="mt-2">
                          <ProgressBar percent={tk.percent} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                          {tk.who.slice(0, 2).map((w) => (
                            <Badge key={w}>{w}</Badge>
                          ))}
                          {tk.status !== s && <TaskStatusBadge status={tk.status} />}
                          <DeadlineBadge state={tk.dl} />
                          {tk.deadline && <span className="num ml-auto text-muted">{formatDate(tk.deadline)}</span>}
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
