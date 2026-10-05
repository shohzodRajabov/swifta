import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAnyPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatQty } from "@/lib/format";
import { formatDate, toDateOnly } from "@/lib/utils";
import { WORKED_DAY_TYPES } from "@/lib/payroll";
import { Badge, Button, Card, CardHeader, Empty, Input, Notice, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ProgressBar } from "@/components/project-bits";
import { DeadlineBadge, EfficiencyBadge, RemarkStatusBadge, TaskStatusBadge } from "@/components/task-bits";
import { myTaskConditions } from "@/server/workforce/access";
import { deadlineState } from "@/server/workforce/tasks";
import { efficiencyIndexes } from "@/server/workforce/efficiency";
import { taskPercent } from "@/server/projects/progress";
import { confirmSession, workerAct } from "@/app/(app)/tasks/actions";
import { kpiHistory } from "@/server/kpi/view";
import { KpiScore } from "@/components/kpi-bits";

export default async function MePage() {
  const user = await requireAnyPermission("worker.self", "tasks.view");
  const t = await getTranslations();
  const emp = user.employee;
  const today = toDateOnly(new Date());
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const [tasks, pending, remarks, days, myMembers, groups, eff] = await Promise.all([
    db.task.findMany({
      where: { companyId: user.companyId, status: { notIn: ["APPROVED", "CANCELLED"] }, OR: myTaskConditions(user) },
      orderBy: [{ deadline: { sort: "asc", nulls: "last" } }],
      include: { project: { select: { name: true } }, location: { select: { name: true } } },
      take: 50,
    }),
    emp
      ? db.workSessionMember.findMany({
          where: { employeeId: emp.id, confirmation: "PENDING" },
          include: { session: { include: { task: { select: { id: true, number: true, title: true, unit: true } }, group: { select: { name: true } } } } },
          orderBy: { session: { date: "desc" } },
        })
      : [],
    db.remark.findMany({
      where: { companyId: user.companyId, responsibleUserId: user.id, status: { not: "ACCEPTED" } },
      select: { id: true, number: true, description: true, status: true, deadline: true },
      orderBy: { number: "desc" },
    }),
    emp ? db.attendanceDay.findMany({ where: { employeeId: emp.id, date: { gte: monthStart } } }) : [],
    emp ? db.workSessionMember.findMany({ where: { employeeId: emp.id, session: { date: { gte: monthStart }, status: { not: "REJECTED" } } }, select: { hours: true } }) : [],
    emp
      ? db.groupMember.findMany({
          where: { employeeId: emp.id, fromDate: { lte: today }, OR: [{ toDate: null }, { toDate: { gte: today } }] },
          include: { group: { select: { id: true, name: true } } },
        })
      : [],
    emp ? efficiencyIndexes(user.companyId, [emp.id]).then((m) => m.get(emp.id)) : undefined,
  ]);
  const lastKpi = emp ? (await kpiHistory(user.companyId, "EMPLOYEE", emp.id, 1))[0] : undefined;
  const done = await db.workSession.groupBy({ by: ["taskId"], where: { taskId: { in: tasks.map((x) => x.id) }, status: { not: "REJECTED" } }, _sum: { quantity: true } });
  const doneMap = new Map(done.map((d) => [d.taskId, Number(d._sum.quantity ?? 0)]));
  const worked = days.filter((d) => (WORKED_DAY_TYPES as readonly string[]).includes(d.type)).length;
  const hours = myMembers.reduce((s, m) => s + Number(m.hours), 0);

  return (
    <>
      <PageHeader
        title={t("me.title", { name: user.name.split(" ")[0] })}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <span>{formatDate(today)}</span>
            {groups.map((g) => (
              <Badge key={g.id} tone={g.role === "LEADER" ? "primary" : "neutral"}>
                {g.group.name} · {t(`groupRole.${g.role}`)}
              </Badge>
            ))}
          </div>
        }
      />
      {!emp && (
        <div className="mb-4">
          <Notice tone="warning">{t("me.noEmployee")}</Notice>
        </div>
      )}
      {emp && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [t("me.workedDays"), String(worked)],
            [t("me.hours"), formatQty(hours)],
            [t("me.openTasks"), String(tasks.length)],
          ].map(([k, v]) => (
            <Card key={k} className="p-4">
              <div className="text-xs text-muted">{k}</div>
              <div className="num mt-1 text-2xl font-semibold">{v}</div>
            </Card>
          ))}
          <Card className="p-4">
            <div className="text-xs text-muted">{t("employees.efficiency")}</div>
            <div className="mt-2">
              <EfficiencyBadge index={eff?.index} reliable={eff?.reliable} />
            </div>
            {lastKpi && (
              <Link href={`/kpi/EMPLOYEE/${emp.id}?month=${lastKpi.month}`} className="mt-2 block text-xs text-primary">
                KPI {lastKpi.month}: <KpiScore value={lastKpi.score} />
              </Link>
            )}
          </Card>
        </div>
      )}

      {pending.length > 0 && (
        <Card className="mb-6 border-warning/40">
          <CardHeader title={t("me.confirmTitle")} subtitle={t("me.confirmHint")} />
          <div className="divide-y divide-border">
            {pending.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {formatDate(m.session.date)} · T-{m.session.task.number} {m.session.task.title}
                  </div>
                  <div className="text-xs text-muted">
                    {m.session.group?.name && `${m.session.group.name} · `}
                    {t("me.yourShare", {
                      qty: `${formatQty(Number(m.contributionQty))} ${m.session.task.unit ?? ""}`,
                      pct: formatQty(Number(m.sharePercent)),
                      hours: formatQty(Number(m.hours)),
                    })}
                  </div>
                </div>
                <form action={confirmSession}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="decision" value="CONFIRMED" />
                  <Button type="submit" className="h-8">
                    {t("me.confirm")}
                  </Button>
                </form>
                <form action={confirmSession} className="flex gap-1">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="decision" value="DISPUTED" />
                  <Input name="note" placeholder={t("me.disputeReason")} className="h-8 w-40 text-xs" required />
                  <Button type="submit" variant="secondary" className="h-8 text-danger">
                    {t("me.dispute")}
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader title={t("me.myTasks")} />
        {tasks.length === 0 ? (
          <Empty>{t("me.noTasks")}</Empty>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((tk) => {
              const pct = taskPercent({ plannedQty: tk.plannedQty ? Number(tk.plannedQty) : null, doneQty: doneMap.get(tk.id) ?? 0, status: tk.status, reportedPercent: tk.reportedPercent });
              const act = workerAct.bind(null, tk.id);
              return (
                <div key={tk.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/tasks/${tk.id}`} className="font-medium hover:text-primary">
                      <span className="num text-muted">T-{tk.number}</span> {tk.title}
                    </Link>
                    <TaskStatusBadge status={tk.status} />
                    <DeadlineBadge state={deadlineState(tk)} />
                    {tk.deadline && <span className="num ml-auto text-xs text-muted">{formatDate(tk.deadline)}</span>}
                  </div>
                  <div className="text-xs text-muted">
                    {tk.project.name}
                    {tk.location && ` · ${tk.location.name}`}
                  </div>
                  <div className="mt-2">
                    <ProgressBar percent={pct} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {["NEW", "ASSIGNED", "ACCEPTED", "REWORK", "BLOCKED"].includes(tk.status) && (
                      <ActionForm action={act}>
                        <input type="hidden" name="type" value="START" />
                        <SubmitButton>{t("me.start")}</SubmitButton>
                      </ActionForm>
                    )}
                    {tk.status === "IN_PROGRESS" && (
                      <ActionForm action={act} className="flex items-center gap-1">
                        <input type="hidden" name="type" value="PROGRESS" />
                        <Input name="percent" type="number" min={0} max={100} placeholder="%" defaultValue={tk.reportedPercent ?? ""} className="w-20" />
                        <SubmitButton variant="secondary">{t("me.saveProgress")}</SubmitButton>
                      </ActionForm>
                    )}
                    {["IN_PROGRESS", "REWORK", "ACCEPTED", "ASSIGNED"].includes(tk.status) && (
                      <ActionForm action={act}>
                        <input type="hidden" name="type" value="FINISH" />
                        <SubmitButton variant="secondary">{t("me.finish")}</SubmitButton>
                      </ActionForm>
                    )}
                    <Link href={`/tasks/${tk.id}`} className="text-sm text-primary">
                      {t("me.openTask")} →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {remarks.length > 0 && (
        <Card>
          <CardHeader title={t("me.myRemarks")} />
          <div className="divide-y divide-border">
            {remarks.map((r) => (
              <Link key={r.id} href={`/remarks/${r.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2/60">
                <span className="num text-muted">#{r.number}</span>
                <span className="min-w-0 flex-1 truncate">{r.description}</span>
                <RemarkStatusBadge status={r.status} />
                <span className="num text-xs text-muted">{formatDate(r.deadline)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
