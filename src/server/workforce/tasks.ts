import "server-only";
import type { Prisma, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fail } from "@/lib/action";
import { audit } from "@/lib/audit";
import { toDateOnly } from "@/lib/utils";
import type { CurrentUser } from "@/lib/auth";
import { projectWhere } from "@/server/projects/access";

type Tx = Prisma.TransactionClient;

/** Allowed manual status transitions (inspection results are handled by `inspectTask`). */
export const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  ASSIGNED: ["ACCEPTED", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  ACCEPTED: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "BLOCKED", "CANCELLED"],
  COMPLETED: ["INSPECTION", "IN_PROGRESS"],
  INSPECTION: ["IN_PROGRESS"],
  APPROVED: ["IN_PROGRESS"],
  REJECTED: ["REWORK"],
  REWORK: ["IN_PROGRESS", "COMPLETED"],
  BLOCKED: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  CANCELLED: ["NEW"],
};

export async function nextTaskNumber(tx: Tx, companyId: string) {
  const last = await tx.task.findFirst({ where: { companyId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

export async function nextRemarkNumber(tx: Tx, companyId: string) {
  const last = await tx.remark.findFirst({ where: { companyId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

/** Is the user (as an employee) a performer of the task — directly, through a group, or as a recorder? */
export async function isPerformer(user: CurrentUser, taskId: string): Promise<boolean> {
  const empId = user.employee?.id;
  const today = new Date();
  const task = await db.task.findFirst({
    where: {
      id: taskId,
      companyId: user.companyId,
      OR: [
        { recorderUserIds: { has: user.id } },
        ...(empId
          ? [
              {
                assignments: {
                  some: {
                    OR: [
                      { employeeId: empId },
                      { group: { members: { some: { employeeId: empId, fromDate: { lte: today }, OR: [{ toDate: null }, { toDate: { gte: today } }] } } } },
                    ],
                  },
                },
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
  return !!task;
}

async function loadTask(user: CurrentUser, taskId: string) {
  // Scoped to the projects the user may access (X5), not just the company.
  const task = await db.task.findFirst({ where: { id: taskId, companyId: user.companyId, project: projectWhere(user) } });
  if (!task) fail("invalid");
  return task;
}

const ctx = (u: CurrentUser) => ({ companyId: u.companyId, userId: u.id });

export async function changeTaskStatus(user: CurrentUser, taskId: string, to: TaskStatus, note?: string | null) {
  const task = await loadTask(user, taskId);
  if (!TRANSITIONS[task.status].includes(to)) fail("badTransition");
  const manager = can(user, "tasks.manage");
  const performer = await isPerformer(user, taskId);
  // Performers can accept, start, complete and request inspection; everything else needs task management.
  const performerAllowed: TaskStatus[] = ["ACCEPTED", "IN_PROGRESS", "COMPLETED", "INSPECTION"];
  if (!manager && !(performer && performerAllowed.includes(to))) fail("forbidden");
  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: to,
        ...(to === "IN_PROGRESS" && !task.actualStart ? { actualStart: new Date() } : {}),
        ...(to === "COMPLETED" ? { actualFinish: new Date(), reportedPercent: 100 } : {}),
      },
    });
    await tx.taskEvent.create({ data: { taskId, type: "STATUS", userId: user.id, employeeId: user.employee?.id, fromStatus: task.status, toStatus: to, note } });
    await audit(tx, ctx(user), "Task", taskId, "update", { status: task.status }, { status: to, note });
  });
}

/** One-tap worker actions: start / progress % / finish / problem / comment. */
export async function workerAction(
  user: CurrentUser,
  taskId: string,
  type: "START" | "PAUSE" | "PROGRESS" | "FINISH" | "PROBLEM" | "COMMENT",
  opts: { percent?: number | null; note?: string | null },
) {
  const task = await loadTask(user, taskId);
  if (!(await isPerformer(user, taskId)) && !can(user, "tasks.manage")) fail("forbidden");
  if (task.status === "CANCELLED" || task.status === "APPROVED") fail("taskClosed");
  const today = toDateOnly(new Date());
  await db.$transaction(async (tx) => {
    await tx.taskEvent.create({
      data: { taskId, type, userId: user.id, employeeId: user.employee?.id, percent: opts.percent ?? null, note: opts.note ?? null },
    });
    if (type === "START") {
      if (["NEW", "ASSIGNED", "ACCEPTED", "REWORK", "BLOCKED"].includes(task.status)) {
        await tx.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS", actualStart: task.actualStart ?? new Date() } });
        await tx.taskEvent.create({ data: { taskId, type: "STATUS", userId: user.id, fromStatus: task.status, toStatus: "IN_PROGRESS" } });
      }
      if (user.employee) {
        await tx.attendanceDay.upsert({
          where: { employeeId_date: { employeeId: user.employee.id, date: today } },
          create: { companyId: user.companyId, employeeId: user.employee.id, date: today, type: "OBJECT", projectId: task.projectId, source: "ACTIVITY" },
          update: {},
        });
      }
    }
    if (type === "PROGRESS" && opts.percent !== undefined && opts.percent !== null) {
      await tx.task.update({ where: { id: taskId }, data: { reportedPercent: Math.max(0, Math.min(100, Math.round(opts.percent))) } });
    }
    if (type === "FINISH" && ["IN_PROGRESS", "ACCEPTED", "ASSIGNED", "REWORK"].includes(task.status)) {
      await tx.task.update({ where: { id: taskId }, data: { status: "COMPLETED", reportedPercent: 100, actualFinish: new Date() } });
      await tx.taskEvent.create({ data: { taskId, type: "STATUS", userId: user.id, fromStatus: task.status, toStatus: "COMPLETED" } });
    }
    if (type === "PROBLEM" && opts.note) {
      const number = await nextRemarkNumber(tx, user.companyId);
      await tx.remark.create({
        data: {
          companyId: user.companyId,
          projectId: task.projectId,
          number,
          taskId,
          locationId: task.locationId,
          description: opts.note,
          priority: "HIGH",
          status: task.responsibleId ? "ASSIGNED" : "NEW",
          responsibleUserId: task.responsibleId,
          createdById: user.id,
        },
      });
    }
  });
}

/** Inspection result. Rejected → REWORK (with an optional remark); passed → APPROVED or waits for the approver. */
export async function inspectTask(user: CurrentUser, taskId: string, result: "PASSED" | "REJECTED", note: string | null, remark: string | null) {
  const task = await loadTask(user, taskId);
  if (!can(user, "inspections.perform")) fail("forbidden");
  if (task.status !== "INSPECTION" && task.status !== "COMPLETED") fail("badTransition");
  const attempt = (await db.inspection.count({ where: { taskId } })) + 1;
  await db.$transaction(async (tx) => {
    const insp = await tx.inspection.create({ data: { taskId, attempt, inspectorId: user.id, result, note } });
    let to: TaskStatus;
    if (result === "REJECTED") {
      to = "REWORK";
      if (remark) {
        await tx.remark.create({
          data: {
            companyId: user.companyId,
            projectId: task.projectId,
            number: await nextRemarkNumber(tx, user.companyId),
            taskId,
            locationId: task.locationId,
            inspectionId: insp.id,
            description: remark,
            priority: "HIGH",
            status: task.responsibleId ? "ASSIGNED" : "NEW",
            responsibleUserId: task.responsibleId,
            createdById: user.id,
          },
        });
      }
    } else {
      to = !task.approverId || task.approverId === user.id ? "APPROVED" : "INSPECTION";
    }
    await tx.task.update({ where: { id: taskId }, data: { status: to } });
    await tx.taskEvent.create({ data: { taskId, type: "STATUS", userId: user.id, fromStatus: task.status, toStatus: to, note: `${result}${note ? `: ${note}` : ""}` } });
    await audit(tx, ctx(user), "Inspection", insp.id, "create", null, insp);
  });
}

/** Final approval by the approver after a passed inspection. */
export async function approveTask(user: CurrentUser, taskId: string) {
  const task = await loadTask(user, taskId);
  if (task.status !== "INSPECTION") fail("badTransition");
  if (task.approverId !== user.id && !can(user, "tasks.manage")) fail("forbidden");
  const last = await db.inspection.findFirst({ where: { taskId }, orderBy: { attempt: "desc" } });
  if (!last || last.result !== "PASSED") fail("inspectionRequired");
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status: "APPROVED" } });
    await tx.taskEvent.create({ data: { taskId, type: "STATUS", userId: user.id, fromStatus: task.status, toStatus: "APPROVED" } });
    await audit(tx, ctx(user), "Task", taskId, "update", { status: task.status }, { status: "APPROVED" });
  });
}

/** Deadline status for display: ON_TIME / AT_RISK / DUE_TODAY / OVERDUE / DONE. */
export function deadlineState(t: { status: TaskStatus; deadline: Date | null; reportedPercent?: number | null }, today = toDateOnly(new Date())) {
  if (t.status === "APPROVED" || t.status === "CANCELLED") return "DONE" as const;
  if (!t.deadline) return null;
  const days = Math.round((t.deadline.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "OVERDUE" as const;
  if (days === 0) return "DUE_TODAY" as const;
  if (days <= 3 && (t.reportedPercent ?? 0) < 70) return "AT_RISK" as const;
  return "ON_TIME" as const;
}
