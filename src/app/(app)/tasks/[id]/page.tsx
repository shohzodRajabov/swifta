import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { TaskStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatNumber, formatQty } from "@/lib/format";
import { formatDate, formatDateTime, isoDate, toDateOnly } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ConfirmForm } from "@/components/forms/confirm-form";
import { PriorityBadge, ProgressBar } from "@/components/project-bits";
import { DeadlineBadge, RemarkStatusBadge, TaskStatusBadge } from "@/components/task-bits";
import { Attachments } from "@/components/attachments";
import { VoiceField } from "@/components/voice-input";
import { taskWhere } from "@/server/workforce/access";
import { TRANSITIONS, deadlineState, isPerformer } from "@/server/workforce/tasks";
import { canRecordSession } from "@/server/workforce/sessions";
import { membersAt } from "@/server/workforce/groups";
import { taskPercent } from "@/server/projects/progress";
import { taskFormOptions } from "@/server/workforce/options";
import { SessionForm } from "../session-form";
import { OutsourcePanel } from "../outsource-panel";
import { TaskForm } from "../task-form";
import { addAssignment, addSession, approve, createRemark, decideSession, inspect, removeAssignment, setTaskStatus, updateTask, workerAct } from "../actions";

const PERFORMER_TARGETS: TaskStatus[] = ["ACCEPTED", "IN_PROGRESS", "COMPLETED", "INSPECTION"];

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const { id } = await params;
  const user = await requirePermission("tasks.view");
  const task = await db.task.findFirst({
    where: { AND: [{ id }, taskWhere(user)] },
    include: {
      project: { select: { id: true, name: true, code: true } },
      workType: true,
      location: true,
      parent: { select: { id: true, number: true, title: true } },
      subtasks: { select: { id: true, number: true, title: true, status: true }, orderBy: { number: "asc" } },
      responsible: { select: { name: true } },
      inspector: { select: { name: true } },
      approver: { select: { name: true } },
      createdBy: { select: { name: true } },
      assignments: { include: { employee: { select: { id: true, fullName: true } }, group: { select: { id: true, name: true } }, contractor: { select: { id: true, name: true } } } },
      sessions: {
        orderBy: { date: "desc" },
        include: {
          group: { select: { name: true } },
          recordedBy: { select: { name: true } },
          members: { include: { employee: { select: { fullName: true } } }, orderBy: { sharePercent: "desc" } },
          materials: { select: { id: true, name: true, qty: true, unit: true } },
        },
      },
      inspections: { orderBy: { attempt: "desc" }, include: { inspector: { select: { name: true } } } },
      remarks: { orderBy: { number: "desc" }, include: { responsible: { select: { name: true } } } },
      events: { orderBy: { at: "desc" }, take: 40, include: { user: { select: { name: true } }, employee: { select: { fullName: true } } } },
    },
  });
  if (!task) notFound();
  const t = await getTranslations();
  const manager = can(user, "tasks.manage");
  const performer = await isPerformer(user, task.id);
  const groupIds = task.assignments.filter((a) => a.groupId).map((a) => a.groupId!);
  const recordGroupOk = await Promise.all([null, ...groupIds].map((g) => canRecordSession(user, task, g)));
  const canRecord = recordGroupOk.some(Boolean) && !["APPROVED", "CANCELLED"].includes(task.status);
  const canSeeCost = can(user, "salaries.view") || can(user, "finance.view");
  const closed = task.status === "APPROVED" || task.status === "CANCELLED";

  const doneQty = task.sessions.filter((s) => s.status !== "REJECTED").reduce((s, x) => s + Number(x.quantity), 0);
  const planned = task.plannedQty ? Number(task.plannedQty) : null;
  const percent = taskPercent({ plannedQty: planned, doneQty, status: task.status, reportedPercent: task.reportedPercent });
  const dl = deadlineState(task);
  const transitions = TRANSITIONS[task.status].filter((s) => manager || (performer && PERFORMER_TARGETS.includes(s)));

  const today = toDateOnly(new Date());
  const [groups, people, bom, products, options, users] = await Promise.all([
    canRecord
      ? Promise.all(
          task.assignments
            .filter((a) => a.group)
            .map(async (a) => ({
              id: a.group!.id,
              name: a.group!.name,
              members: (await membersAt(a.group!.id, today)).map((m) => ({ employeeId: m.employeeId, role: m.role })),
            })),
        )
      : [],
    canRecord ? db.employee.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }) : [],
    canRecord ? db.bomItem.findMany({ where: { projectId: task.projectId, kind: "MATERIAL" }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, unit: true } }) : [],
    canRecord ? db.product.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, unit: true }, take: 300 }) : [],
    manager ? taskFormOptions(user.companyId, task.projectId) : null,
    can(user, "remarks.create") || can(user, "remarks.manage")
      ? db.user.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [],
  ]);
  // Zones of the latest drawing versions this task is mapped to ("Show on drawing").
  const zoneLinks = (
    await db.drawingZoneTask.findMany({
      where: { taskId: task.id },
      include: { zone: { include: { version: { include: { drawing: { select: { title: true, versions: { orderBy: { version: "desc" }, take: 1, select: { id: true } } } } } } } } },
    })
  ).filter((z) => z.zone.version.drawing.versions[0]?.id === z.zone.versionId);
  const company = canRecord ? await db.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { defaultContribution: true } }) : null;
  const myGroup = user.employee ? groups.find((g) => g.members.some((m) => m.employeeId === user.employee!.id && m.role === "LEADER")) : undefined;

  return (
    <>
      <PageHeader
        title={
          <>
            <span className="num text-muted">T-{task.number}</span> {task.title}
          </>
        }
        back={{ href: "/tasks", label: t("tasks.title") }}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/projects/${task.project.id}?tab=tasks`} className="hover:text-primary">
              {task.project.name}
            </Link>
            {task.location && <span>· {task.location.name}</span>}
            <TaskStatusBadge status={task.status} />
            {task.priority !== "MEDIUM" && <PriorityBadge priority={task.priority} />}
            <DeadlineBadge state={dl} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {/* Actions */}
          {(transitions.length > 0 || performer || can(user, "inspections.perform")) && !closed && (
            <Card>
              <CardHeader title={t("tasks.actions")} />
              <div className="flex flex-col gap-4 p-5">
                {(performer || manager) && (
                  <div className="flex flex-wrap items-end gap-2">
                    {["NEW", "ASSIGNED", "ACCEPTED", "REWORK", "BLOCKED"].includes(task.status) && (
                      <ActionForm action={workerAct.bind(null, task.id)}>
                        <input type="hidden" name="type" value="START" />
                        <SubmitButton>{t("me.start")}</SubmitButton>
                      </ActionForm>
                    )}
                    {task.status === "IN_PROGRESS" && (
                      <ActionForm action={workerAct.bind(null, task.id)} className="flex items-end gap-2">
                        <input type="hidden" name="type" value="PROGRESS" />
                        <Field label={t("me.percentDone")}>
                          <Input name="percent" type="number" min={0} max={100} defaultValue={task.reportedPercent ?? ""} className="w-24" />
                        </Field>
                        <SubmitButton variant="secondary">{t("me.saveProgress")}</SubmitButton>
                      </ActionForm>
                    )}
                    {["IN_PROGRESS", "REWORK", "ACCEPTED", "ASSIGNED"].includes(task.status) && (
                      <ActionForm action={workerAct.bind(null, task.id)}>
                        <input type="hidden" name="type" value="FINISH" />
                        <SubmitButton variant="secondary">{t("me.finish")}</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                )}
                {transitions.length > 0 && (
                  <ActionForm action={setTaskStatus.bind(null, task.id)} className="flex flex-wrap items-end gap-2">
                    <Field label={t("tasks.changeStatus")}>
                      <Select name="to" className="w-48">
                        {transitions.map((s) => (
                          <option key={s} value={s}>
                            {t(`taskStatus.${s}`)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t("common.note")} className="min-w-48 flex-1">
                      <Input name="note" />
                    </Field>
                    <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
                  </ActionForm>
                )}
                {(performer || manager) && (
                  <ActionForm action={workerAct.bind(null, task.id)} resetOnSuccess className="flex flex-wrap items-end gap-2">
                    <Field label={t("me.messageLabel")} className="min-w-48 flex-1">
                      <VoiceField name="note" required placeholder={t("me.messagePlaceholder")} />
                    </Field>
                    <Select name="type" className="w-40" defaultValue="COMMENT">
                      <option value="COMMENT">{t("taskEvent.COMMENT")}</option>
                      <option value="PROBLEM">{t("taskEvent.PROBLEM")}</option>
                    </Select>
                    <SubmitButton variant="secondary">{t("common.add")}</SubmitButton>
                  </ActionForm>
                )}
                {can(user, "inspections.perform") && ["COMPLETED", "INSPECTION"].includes(task.status) && !(task.status === "INSPECTION" && task.inspections[0]?.result === "PASSED") && (
                  <ActionForm action={inspect.bind(null, task.id)} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-4">
                    <div className="text-sm font-medium sm:col-span-4">{t("tasks.inspection")}</div>
                    <Field label={t("tasks.inspectionResult")}>
                      <Select name="result" defaultValue="PASSED">
                        <option value="PASSED">{t("inspection.PASSED")}</option>
                        <option value="REJECTED">{t("inspection.REJECTED")}</option>
                      </Select>
                    </Field>
                    <Field label={t("common.note")}>
                      <Input name="note" />
                    </Field>
                    <Field label={t("tasks.remarkIfRejected")} className="sm:col-span-2">
                      <Input name="remark" />
                    </Field>
                    <div className="sm:col-span-4">
                      <SubmitButton>{t("common.save")}</SubmitButton>
                    </div>
                  </ActionForm>
                )}
                {task.status === "INSPECTION" && task.inspections[0]?.result === "PASSED" && (task.approverId === user.id || manager) && (
                  <ActionForm action={approve.bind(null, task.id)}>
                    <SubmitButton>{t("tasks.approveFinal")}</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </Card>
          )}

          {/* Work sessions */}
          <Card>
            <CardHeader title={t("sessions.title")} subtitle={t("sessions.subtitle")} />
            {canRecord && (
              <details className="border-b border-border" open={task.sessions.length === 0 && (performer || !!myGroup)}>
                <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-primary">+ {t("sessions.new")}</summary>
                <SessionForm
                  action={addSession.bind(null, task.id)}
                  groups={groups}
                  people={people}
                  materials={[
                    ...bom.map((b) => ({ value: `bom:${b.id}`, label: `${b.name} (${b.unit}) — BOM` })),
                    ...products.map((p) => ({ value: p.id, label: `${p.name} (${p.unit})` })),
                  ]}
                  defaultGroupId={myGroup?.id ?? groups[0]?.id ?? null}
                  defaultMethod={company!.defaultContribution}
                  unit={task.unit}
                  remaining={planned !== null ? Math.max(0, planned - doneQty) : null}
                  today={isoDate(new Date())}
                />
              </details>
            )}
            {task.sessions.length === 0 ? (
              <Empty>{t("sessions.empty")}</Empty>
            ) : (
              <div className="divide-y divide-border">
                {task.sessions.map((s) => (
                  <div key={s.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num font-medium">{formatDate(s.date)}</span>
                      {s.group && <Badge>{s.group.name}</Badge>}
                      <span className="num">
                        {formatQty(Number(s.quantity))} {s.unit ?? task.unit}
                      </span>
                      <span className="text-muted">· {formatNumber(Number(s.hours))} {t("employees.hourShort")}</span>
                      <Badge tone={s.status === "APPROVED" ? "success" : s.status === "REJECTED" ? "danger" : "warning"}>{t(`sessionStatus.${s.status}`)}</Badge>
                      <span className="text-xs text-muted">{t(`contribution.${s.method}`)}</span>
                      {canSeeCost && <span className="num ml-auto text-xs text-muted">{formatNumber(Number(s.laborCostUzs))} UZS</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.members.map((m) => (
                        <Badge key={m.id} tone={m.confirmation === "DISPUTED" ? "danger" : m.confirmation === "CONFIRMED" ? "success" : "neutral"} title={t(`confirmation.${m.confirmation}`)}>
                          {m.employee.fullName}: {formatQty(Number(m.contributionQty))} ({formatQty(Number(m.sharePercent))}%)
                        </Badge>
                      ))}
                    </div>
                    {s.materials.length > 0 && (
                      <div className="mt-1 text-xs text-muted">
                        {t("sessions.materials")}: {s.materials.map((m) => `${m.name} ${formatQty(Number(m.qty))} ${m.unit}`).join(", ")}
                      </div>
                    )}
                    {(s.note || s.problems || s.rejectReason) && (
                      <div className="mt-1 text-xs">
                        {s.note && <div>{s.note}</div>}
                        {s.problems && <div className="text-warning">⚠ {s.problems}</div>}
                        {s.rejectReason && <div className="text-danger">✕ {s.rejectReason}</div>}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      {t("sessions.recordedBy", { name: s.recordedBy?.name ?? "—" })}
                      {s.status === "SUBMITTED" && can(user, "sessions.approve") && (
                        <span className="ml-auto flex gap-1">
                          <form action={decideSession}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="decision" value="APPROVED" />
                            <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                              {t("approval.approve")}
                            </Button>
                          </form>
                          <ConfirmForm action={decideSession} id={s.id} label={t("approval.reject")} extra={{ decision: "REJECTED" }} />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <OutsourcePanel user={user} task={task} workTypeName={task.workType?.name ?? null} />

          {/* Remarks */}
          <Card>
            <CardHeader title={t("remarks.title")} />
            {task.remarks.length === 0 ? (
              <Empty>{t("remarks.empty")}</Empty>
            ) : (
              <Table>
                <tbody>
                  {task.remarks.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        <Link href={`/remarks/${r.id}`} className="hover:text-primary">
                          <span className="num text-muted">#{r.number}</span> {r.description}
                        </Link>
                        <div className="text-xs text-muted">{r.responsible?.name ?? "—"}</div>
                      </Td>
                      <Td>
                        <RemarkStatusBadge status={r.status} />
                      </Td>
                      <Td className="num text-right">{formatDate(r.deadline)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {(can(user, "remarks.create") || can(user, "remarks.manage")) && (
              <ActionForm action={createRemark} className="grid gap-3 border-t border-border p-4 sm:grid-cols-4">
                <input type="hidden" name="projectId" value={task.projectId} />
                <input type="hidden" name="taskId" value={task.id} />
                {task.locationId && <input type="hidden" name="locationId" value={task.locationId} />}
                <Field label={t("remarks.description")} required className="sm:col-span-4">
                  <VoiceField name="description" required multiline />
                </Field>
                <Field label={t("remarks.responsible")}>
                  <Select name="responsibleUserId" defaultValue={task.responsibleId ?? ""}>
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
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
                <Field label={t("tasks.deadline")}>
                  <Input type="date" name="deadline" />
                </Field>
                <div className="self-end">
                  <SubmitButton variant="secondary">{t("remarks.new")}</SubmitButton>
                </div>
              </ActionForm>
            )}
          </Card>

          <Card>
            <CardHeader title={t("attachments.title")} />
            <div className="p-5">
              <Attachments entityType="task" entityId={task.id} canUpload={!closed && (performer || manager || can(user, "inspections.perform"))} />
            </div>
          </Card>

          {manager && options && (
            <Card>
              <details>
                <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold">{t("common.edit")}</summary>
                <div className="border-t border-border">
                  <TaskForm action={updateTask.bind(null, task.id)} task={task} projectId={task.projectId} {...options} employees={undefined} groups={undefined} />
                </div>
              </details>
            </Card>
          )}
        </div>

        {/* Side */}
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted">{t("tasks.progress")}</span>
              <span className="num text-sm font-semibold">{Math.round(percent)}%</span>
            </div>
            <ProgressBar percent={percent} />
            <dl className="mt-4 space-y-1.5 text-sm">
              {[
                [t("tasks.workType"), task.workType?.name],
                [t("tasks.plannedQty"), planned !== null ? `${formatQty(planned)} ${task.unit ?? ""}` : null],
                [t("tasks.doneQty"), `${formatQty(doneQty)} ${task.unit ?? ""}`],
                [t("tasks.reported"), task.reportedPercent !== null ? `${task.reportedPercent}%` : null],
                [t("tasks.startDate"), formatDate(task.startDate)],
                [t("tasks.deadline"), formatDate(task.deadline)],
                [t("tasks.actualStart"), task.actualStart ? formatDate(task.actualStart) : null],
                [t("tasks.actualFinish"), task.actualFinish ? formatDate(task.actualFinish) : null],
                [t("tasks.responsible"), task.responsible?.name],
                [t("tasks.inspector"), task.inspector?.name],
                [t("tasks.approver"), task.approver?.name],
                [t("tasks.createdBy"), task.createdBy?.name],
                ...(canSeeCost && task.plannedValueUzs ? [[t("tasks.plannedValue"), formatNumber(Number(task.plannedValueUzs))]] : []),
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="num text-right">{v}</dd>
                  </div>
                ))}
            </dl>
            {zoneLinks.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {zoneLinks.map((z) => (
                  <Link
                    key={z.zone.id}
                    href={`/projects/${task.projectId}/drawings/${z.zone.version.drawingId}?zone=${z.zone.id}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                  >
                    ◎ {t("drawings.showOnDrawing")}: {z.zone.version.drawing.title} · {z.zone.name}
                  </Link>
                ))}
              </div>
            )}
            {task.description && <p className="mt-3 whitespace-pre-line border-t border-border pt-3 text-sm">{task.description}</p>}
            {task.parent && (
              <p className="mt-3 text-sm">
                {t("tasks.parent")}:{" "}
                <Link href={`/tasks/${task.parent.id}`} className="text-primary">
                  T-{task.parent.number} {task.parent.title}
                </Link>
              </p>
            )}
            {task.subtasks.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {task.subtasks.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <Link href={`/tasks/${s.id}`} className="hover:text-primary">
                      T-{s.number} {s.title}
                    </Link>
                    <TaskStatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title={t("tasks.performers")} />
            <ul className="divide-y divide-border text-sm">
              {task.assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-5 py-2">
                  <div>
                    {a.group ? (
                      <Link href={`/employees/groups/${a.group.id}`} className="font-medium hover:text-primary">
                        {a.group.name}
                      </Link>
                    ) : a.employee ? (
                      <Link href={`/employees/${a.employee.id}`} className="hover:text-primary">
                        {a.employee.fullName}
                      </Link>
                    ) : (
                      <span>{a.contractor?.name}</span>
                    )}
                    <div className="text-xs text-muted">
                      {t(`assigneeKind.${a.kind}`)}
                      {a.plannedQty && ` · ${formatQty(Number(a.plannedQty))} ${task.unit ?? ""}`}
                    </div>
                  </div>
                  {manager && a.kind !== "CONTRACTOR" && <ConfirmForm action={removeAssignment} id={a.id} label="×" />}
                </li>
              ))}
              {task.assignments.length === 0 && <li className="px-5 py-3 text-muted">{t("tasks.noPerformers")}</li>}
            </ul>
            {manager && options && (
              <ActionForm action={addAssignment.bind(null, task.id)} resetOnSuccess className="flex flex-col gap-2 border-t border-border p-4">
                <Select name="who" required defaultValue="">
                  <option value="" disabled>
                    {t("tasks.addPerformer")}
                  </option>
                  <optgroup label={t("employees.tab_groups")}>
                    {options.groups.map((g) => (
                      <option key={g.id} value={`g:${g.id}`}>
                        {g.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("employees.title")}>
                    {options.employees.map((e) => (
                      <option key={e.id} value={`e:${e.id}`}>
                        {e.name}
                      </option>
                    ))}
                  </optgroup>
                </Select>
                <Input name="plannedQty" inputMode="decimal" placeholder={t("tasks.plannedQty")} />
                <SubmitButton variant="secondary">{t("common.add")}</SubmitButton>
              </ActionForm>
            )}
          </Card>

          {task.inspections.length > 0 && (
            <Card>
              <CardHeader title={t("tasks.inspections")} />
              <ul className="divide-y divide-border text-sm">
                {task.inspections.map((i) => (
                  <li key={i.id} className="px-5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        #{i.attempt} · {i.inspector?.name ?? "—"}
                      </span>
                      <Badge tone={i.result === "PASSED" ? "success" : "danger"}>{t(`inspection.${i.result}`)}</Badge>
                    </div>
                    <div className="text-xs text-muted">
                      {formatDateTime(i.at)}
                      {i.note && ` · ${i.note}`}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title={t("tasks.history")} />
            <ul className="divide-y divide-border text-sm">
              {task.events.map((e) => (
                <li key={e.id} className="px-5 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{e.employee?.fullName ?? e.user?.name ?? "—"}</span>
                    <span className="text-muted">
                      {e.type === "STATUS" && e.toStatus
                        ? t("tasks.eventStatus", { from: e.fromStatus ? t(`taskStatus.${e.fromStatus}`) : "—", to: t(`taskStatus.${e.toStatus}`) })
                        : t(`taskEvent.${e.type}`)}
                      {e.percent !== null && ` ${e.percent}%`}
                    </span>
                  </div>
                  {e.note && <div className={e.type === "PROBLEM" ? "text-warning" : ""}>{e.note}</div>}
                  <div className="text-xs text-muted">{formatDateTime(e.at)}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
