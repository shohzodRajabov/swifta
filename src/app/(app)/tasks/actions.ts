"use server";

import { z } from "zod";
import { Prisma, type TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { fail, formObject, runAction, zDate, zNumber, zOptDate, zOptId, zOptNumber, zOptText, zText, type ActionState } from "@/lib/action";
import type { CurrentUser } from "@/lib/auth";
import { accessibleProject, projectWhere } from "@/server/projects/access";
import { approveTask, changeTaskStatus, inspectTask, nextRemarkNumber, nextTaskNumber, workerAction } from "@/server/workforce/tasks";
import { recordSession } from "@/server/workforce/sessions";

const ctx = (u: CurrentUser) => ({ companyId: u.companyId, userId: u.id });
const zPriority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

const taskSchema = z.object({
  projectId: zText,
  title: zText,
  description: zOptText,
  workTypeId: zOptId,
  locationId: zOptId,
  parentId: zOptId,
  unit: zOptText,
  plannedQty: zOptNumber,
  plannedValueUzs: zOptNumber,
  weight: zOptNumber,
  priority: zPriority.default("MEDIUM"),
  startDate: zOptDate,
  deadline: zOptDate,
  responsibleId: zOptId,
  inspectorId: zOptId,
  approverId: zOptId,
});

async function checkRefs(user: CurrentUser, d: z.infer<typeof taskSchema>) {
  await accessibleProject(user, d.projectId);
  const userIds = [d.responsibleId, d.inspectorId, d.approverId].filter(Boolean) as string[];
  const [users, wt, loc, parent] = await Promise.all([
    db.user.count({ where: { id: { in: userIds }, companyId: user.companyId } }),
    d.workTypeId ? db.workType.findFirst({ where: { id: d.workTypeId, companyId: user.companyId } }) : null,
    d.locationId ? db.projectLocation.findFirst({ where: { id: d.locationId, projectId: d.projectId } }) : null,
    d.parentId ? db.task.findFirst({ where: { id: d.parentId, projectId: d.projectId } }) : null,
  ]);
  if (users !== new Set(userIds).size) fail("invalid");
  if ((d.workTypeId && !wt) || (d.locationId && !loc) || (d.parentId && !parent)) fail("invalid");
  if (d.startDate && d.deadline && d.deadline < d.startDate) fail("dateOrder");
  return wt;
}

function taskData(d: z.infer<typeof taskSchema>, unitFallback: string | null) {
  return {
    title: d.title,
    description: d.description,
    workTypeId: d.workTypeId,
    locationId: d.locationId,
    parentId: d.parentId,
    unit: d.unit ?? unitFallback,
    plannedQty: d.plannedQty !== null ? new Prisma.Decimal(d.plannedQty) : null,
    plannedValueUzs: d.plannedValueUzs !== null ? new Prisma.Decimal(d.plannedValueUzs) : null,
    weight: d.weight !== null ? new Prisma.Decimal(d.weight) : null,
    priority: d.priority,
    startDate: d.startDate,
    deadline: d.deadline,
    responsibleId: d.responsibleId,
    inspectorId: d.inspectorId,
    approverId: d.approverId,
  };
}

/** Assignments from the form: employeeIds[] and groupIds[]. */
function assigneesFrom(formData: FormData) {
  return {
    employees: formData.getAll("employeeIds").map(String).filter(Boolean),
    groups: formData.getAll("groupIds").map(String).filter(Boolean),
    recorders: formData.getAll("recorderUserIds").map(String).filter(Boolean),
  };
}

export async function createTask(_: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction("tasks.manage", async (user) => {
    const d = taskSchema.parse(formObject(formData));
    const wt = await checkRefs(user, d);
    const a = assigneesFrom(formData);
    const [emps, groups, recs] = await Promise.all([
      db.employee.count({ where: { id: { in: a.employees }, companyId: user.companyId } }),
      db.workGroup.count({ where: { id: { in: a.groups }, companyId: user.companyId } }),
      db.user.count({ where: { id: { in: a.recorders }, companyId: user.companyId } }),
    ]);
    if (emps !== a.employees.length || groups !== a.groups.length || recs !== a.recorders.length) fail("invalid");
    const task = await db.$transaction(async (tx) => {
      const number = await nextTaskNumber(tx, user.companyId);
      const assigned = a.employees.length + a.groups.length > 0;
      const t = await tx.task.create({
        data: {
          ...taskData(d, wt?.unit ?? null),
          companyId: user.companyId,
          projectId: d.projectId,
          number,
          status: assigned ? "ASSIGNED" : "NEW",
          recorderUserIds: a.recorders,
          createdById: user.id,
          assignments: {
            create: [
              ...a.employees.map((employeeId) => ({ kind: "EMPLOYEE" as const, employeeId })),
              ...a.groups.map((groupId) => ({ kind: "GROUP" as const, groupId })),
            ],
          },
        },
      });
      await tx.taskEvent.create({ data: { taskId: t.id, type: "CREATED", userId: user.id, toStatus: t.status } });
      await audit(tx, ctx(user), "Task", t.id, "create", null, t);
      return t;
    });
    id = task.id;
  });
  if (res?.ok) redirect(`/tasks/${id}`);
  return res;
}

export async function updateTask(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("tasks.manage", async (user) => {
    const before = await db.task.findFirst({ where: { id, companyId: user.companyId, project: projectWhere(user) } });
    if (!before) fail("invalid");
    const d = taskSchema.parse({ ...formObject(formData), projectId: before.projectId });
    if (d.parentId === id) fail("invalid");
    const wt = await checkRefs(user, d);
    const recorders = formData.getAll("recorderUserIds").map(String).filter(Boolean);
    if ((await db.user.count({ where: { id: { in: recorders }, companyId: user.companyId } })) !== recorders.length) fail("invalid");
    await db.$transaction(async (tx) => {
      const after = await tx.task.update({ where: { id }, data: { ...taskData(d, wt?.unit ?? before.unit), recorderUserIds: recorders } });
      await audit(tx, ctx(user), "Task", id, "update", before, after);
    });
  });
  if (res?.ok) revalidatePath(`/tasks/${id}`);
  return res;
}

export async function addAssignment(taskId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("tasks.manage", async (user) => {
    const d = z.object({ who: zText, plannedQty: zOptNumber, note: zOptText }).parse(formObject(formData));
    const task = await db.task.findFirst({ where: { id: taskId, companyId: user.companyId, project: projectWhere(user) } });
    if (!task) fail("invalid");
    const [kind, refId] = d.who.split(":");
    const data: Prisma.TaskAssignmentUncheckedCreateInput = {
      taskId,
      kind: kind === "g" ? "GROUP" : "EMPLOYEE",
      plannedQty: d.plannedQty !== null ? new Prisma.Decimal(d.plannedQty) : null,
      note: d.note,
    };
    if (kind === "g") {
      if (!(await db.workGroup.findFirst({ where: { id: refId, companyId: user.companyId } }))) fail("invalid");
      if (await db.taskAssignment.findFirst({ where: { taskId, groupId: refId } })) fail("duplicate");
      data.groupId = refId;
    } else {
      if (!(await db.employee.findFirst({ where: { id: refId, companyId: user.companyId } }))) fail("invalid");
      if (await db.taskAssignment.findFirst({ where: { taskId, employeeId: refId } })) fail("duplicate");
      data.employeeId = refId;
    }
    await db.$transaction(async (tx) => {
      const a = await tx.taskAssignment.create({ data });
      if (task.status === "NEW") {
        await tx.task.update({ where: { id: taskId }, data: { status: "ASSIGNED" } });
        await tx.taskEvent.create({ data: { taskId, type: "STATUS", userId: user.id, fromStatus: "NEW", toStatus: "ASSIGNED" } });
      }
      await audit(tx, ctx(user), "TaskAssignment", a.id, "create", null, a);
    });
  });
  if (res?.ok) revalidatePath(`/tasks/${taskId}`);
  return res;
}

export async function removeAssignment(formData: FormData) {
  let taskId = "";
  await runAction("tasks.manage", async (user) => {
    const id = String(formData.get("id"));
    const a = await db.taskAssignment.findFirst({ where: { id, task: { companyId: user.companyId, project: projectWhere(user) } } });
    if (!a || a.kind === "CONTRACTOR") fail("invalid");
    if (a.groupId && (await db.workSession.count({ where: { taskId: a.taskId, groupId: a.groupId } }))) fail("inUse");
    taskId = a.taskId;
    await db.$transaction(async (tx) => {
      await tx.taskAssignment.delete({ where: { id } });
      await audit(tx, ctx(user), "TaskAssignment", id, "delete", a, null);
    });
  });
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

export async function setTaskStatus(taskId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("tasks.view", async (user) => {
    const d = z.object({ to: z.string(), note: zOptText }).parse(formObject(formData));
    await changeTaskStatus(user, taskId, d.to as TaskStatus, d.note);
  });
  if (res?.ok) revalidatePath(`/tasks/${taskId}`);
  return res;
}

export async function workerAct(taskId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction(["worker.self", "tasks.manage"], async (user) => {
    const d = z
      .object({ type: z.enum(["START", "PAUSE", "PROGRESS", "FINISH", "PROBLEM", "COMMENT"]), percent: zOptNumber, note: zOptText })
      .parse(formObject(formData));
    if ((d.type === "PROBLEM" || d.type === "COMMENT") && !d.note) fail("required");
    if (d.type === "PROGRESS" && d.percent === null) fail("required");
    await workerAction(user, taskId, d.type, { percent: d.percent, note: d.note });
  });
  if (res?.ok) {
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/me");
  }
  return res;
}

export async function inspect(taskId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("inspections.perform", async (user) => {
    const d = z.object({ result: z.enum(["PASSED", "REJECTED"]), note: zOptText, remark: zOptText }).parse(formObject(formData));
    if (d.result === "REJECTED" && !d.note && !d.remark) fail("required");
    await inspectTask(user, taskId, d.result, d.note, d.remark);
  });
  if (res?.ok) revalidatePath(`/tasks/${taskId}`);
  return res;
}

export async function approve(taskId: string, _: ActionState): Promise<ActionState> {
  const res = await runAction("tasks.view", async (user) => approveTask(user, taskId).then(() => undefined));
  if (res?.ok) revalidatePath(`/tasks/${taskId}`);
  return res;
}

// ---- work sessions ------------------------------------------------------------

export async function addSession(taskId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction(["sessions.record", "sessions.approve", "tasks.manage"], async (user) => {
    const d = z
      .object({
        groupId: zOptId,
        date: zDate,
        hours: zNumber,
        quantity: zNumber,
        method: z.enum(["EQUAL", "LEADER", "RULE", "EFFICIENCY", ""]).optional(),
        note: zOptText,
        problems: zOptText,
        overReason: zOptText,
      })
      .parse(formObject(formData));
    if (d.hours <= 0 || d.hours > 24 || d.quantity < 0) fail("invalid");
    if (d.date > new Date()) fail("futureDate");
    const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);
    const members = memberIds.map((employeeId) => {
      const h = Number(formData.get(`hours_${employeeId}`) || 0);
      const p = formData.get(`percent_${employeeId}`);
      return { employeeId, hours: h > 0 ? h : null, percent: p === null || p === "" ? null : Number(p) };
    });
    const materials: { item: string; qty: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const item = String(formData.get(`mat_${i}`) ?? "");
      const qty = Number(formData.get(`matQty_${i}`) ?? 0);
      if (item && qty > 0) materials.push({ item, qty });
    }
    if (materials.length && !can(user, "materials.consume") && !can(user, "sessions.record")) fail("forbidden");
    await recordSession(user, {
      taskId,
      groupId: d.groupId,
      date: d.date,
      hours: d.hours,
      quantity: d.quantity,
      note: d.note,
      problems: d.problems,
      method: d.method ? d.method : null,
      members,
      materials,
      overReason: d.overReason,
    });
  });
  if (res?.ok) revalidatePath(`/tasks/${taskId}`);
  return res;
}

export async function decideSession(formData: FormData) {
  await runAction("sessions.approve", async (user) => {
    const d = z.object({ id: zText, decision: z.enum(["APPROVED", "REJECTED"]), reason: zOptText }).parse(formObject(formData));
    const s = await db.workSession.findFirst({ where: { id: d.id, companyId: user.companyId, project: projectWhere(user) } });
    if (!s || s.status !== "SUBMITTED") fail("invalid");
    await db.$transaction(async (tx) => {
      const after = await tx.workSession.update({
        where: { id: s.id },
        data: { status: d.decision, approvedById: user.id, approvedAt: new Date(), rejectReason: d.decision === "REJECTED" ? d.reason : null },
      });
      // Materials of a rejected session are returned (the consumption is removed).
      if (d.decision === "REJECTED") await tx.stockMovement.deleteMany({ where: { sessionId: s.id, type: "CONSUMPTION" } });
      await audit(tx, ctx(user), "WorkSession", s.id, "update", { status: s.status }, { status: after.status, reason: d.reason });
    });
  });
  revalidatePath("/tasks/sessions");
  revalidatePath("/tasks");
}

/** A worker confirms or disputes his/her participation and share in a session. */
export async function confirmSession(formData: FormData) {
  await runAction("worker.self", async (user) => {
    const d = z.object({ id: zText, decision: z.enum(["CONFIRMED", "DISPUTED"]), note: zOptText }).parse(formObject(formData));
    if (!user.employee) fail("forbidden");
    const m = await db.workSessionMember.findFirst({ where: { id: d.id, employeeId: user.employee.id } });
    if (!m) fail("invalid");
    await db.$transaction(async (tx) => {
      await tx.workSessionMember.update({ where: { id: m.id }, data: { confirmation: d.decision, confirmedAt: new Date(), note: d.note } });
      await audit(tx, ctx(user), "WorkSessionMember", m.id, "update", { confirmation: m.confirmation }, { confirmation: d.decision, note: d.note });
    });
  });
  revalidatePath("/me");
}

// ---- remarks ----------------------------------------------------------------------

export async function createRemark(_: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(["remarks.create", "remarks.manage"], async (user) => {
    const d = z
      .object({
        projectId: zText,
        taskId: zOptId,
        locationId: zOptId,
        description: zText,
        priority: zPriority.default("MEDIUM"),
        responsibleUserId: zOptId,
        deadline: zOptDate,
      })
      .parse(formObject(formData));
    await accessibleProject(user, d.projectId);
    if (d.taskId && !(await db.task.findFirst({ where: { id: d.taskId, projectId: d.projectId } }))) fail("invalid");
    if (d.responsibleUserId && !(await db.user.findFirst({ where: { id: d.responsibleUserId, companyId: user.companyId } }))) fail("invalid");
    const r = await db.$transaction(async (tx) => {
      const r = await tx.remark.create({
        data: {
          ...d,
          companyId: user.companyId,
          number: await nextRemarkNumber(tx, user.companyId),
          status: d.responsibleUserId ? "ASSIGNED" : "NEW",
          createdById: user.id,
        },
      });
      await audit(tx, ctx(user), "Remark", r.id, "create", null, r);
      return r;
    });
    id = r.id;
  });
  if (res?.ok) redirect(`/remarks/${id}`);
  return res;
}

const REMARK_FLOW: Record<string, string[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS"],
  ASSIGNED: ["IN_PROGRESS", "FIXED"],
  IN_PROGRESS: ["FIXED"],
  FIXED: ["REINSPECTION", "ACCEPTED", "IN_PROGRESS"],
  REINSPECTION: ["ACCEPTED", "IN_PROGRESS"],
  ACCEPTED: ["IN_PROGRESS"],
};

export async function setRemarkStatus(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction(["remarks.create", "remarks.manage", "worker.self"], async (user) => {
    const d = z
      .object({ to: z.enum(["NEW", "ASSIGNED", "IN_PROGRESS", "FIXED", "REINSPECTION", "ACCEPTED"]), responsibleUserId: zOptId, note: zOptText })
      .parse(formObject(formData));
    const r = await db.remark.findFirst({ where: { id, companyId: user.companyId, project: projectWhere(user) } });
    if (!r) fail("invalid");
    if (!REMARK_FLOW[r.status]?.includes(d.to)) fail("badTransition");
    const manager = can(user, "remarks.manage");
    // Responsible person can work on it and mark it fixed; accepting / reopening needs remark management.
    if (!manager && !(r.responsibleUserId === user.id && ["IN_PROGRESS", "FIXED"].includes(d.to))) fail("forbidden");
    await db.$transaction(async (tx) => {
      const after = await tx.remark.update({
        where: { id },
        data: {
          status: d.to,
          ...(d.responsibleUserId && manager ? { responsibleUserId: d.responsibleUserId } : {}),
          ...(d.to === "FIXED" ? { fixedAt: new Date() } : {}),
          ...(d.to === "ACCEPTED" ? { acceptedAt: new Date() } : {}),
        },
      });
      await audit(tx, ctx(user), "Remark", id, "update", { status: r.status }, { status: after.status, note: d.note });
    });
  });
  if (res?.ok) revalidatePath(`/remarks/${id}`);
  return res;
}

// ---- project locations --------------------------------------------------------

export async function addLocation(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("tasks.manage", async (user) => {
    const d = z.object({ name: zText, kind: z.enum(["FLOOR", "ZONE", "ROOM", "OTHER"]), parentId: zOptId }).parse(formObject(formData));
    await accessibleProject(user, projectId);
    if (d.parentId && !(await db.projectLocation.findFirst({ where: { id: d.parentId, projectId } }))) fail("invalid");
    const count = await db.projectLocation.count({ where: { projectId } });
    await db.projectLocation.create({ data: { ...d, projectId, sortOrder: count } });
  });
  if (res?.ok) revalidatePath(`/projects/${projectId}`);
  return res;
}

export async function deleteLocation(formData: FormData) {
  let projectId = "";
  await runAction("tasks.manage", async (user) => {
    const id = String(formData.get("id"));
    const loc = await db.projectLocation.findFirst({ where: { id, project: projectWhere(user) }, include: { _count: { select: { tasks: true } } } });
    if (!loc) fail("invalid");
    if (loc._count.tasks > 0) fail("inUse");
    projectId = loc.projectId;
    await db.projectLocation.delete({ where: { id } });
  });
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

