import "server-only";
import type { TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";

/** Physical progress of one task (0–100). */
export function taskPercent(t: {
  plannedQty: number | null;
  doneQty: number;
  status: TaskStatus;
  reportedPercent: number | null;
}): number {
  if (t.plannedQty && t.plannedQty > 0) return Math.min(100, (t.doneQty / t.plannedQty) * 100);
  if (t.status === "APPROVED" || t.status === "COMPLETED" || t.status === "INSPECTION") return 100;
  return Math.max(0, Math.min(100, t.reportedPercent ?? 0));
}

/**
 * Weighted physical progress per project. Weight = the task's estimate value; tasks without a value use their
 * manual weight relative to an average valued task. Quantities come from work sessions (not rejected) and
 * completed contractor work — never from manual percentages when a quantity exists.
 */
export async function projectProgress(projectIds: string[]) {
  const out = new Map<string, { percent: number | null; tasks: number }>();
  if (projectIds.length === 0) return out;
  const tasks = await db.task.findMany({
    where: { projectId: { in: projectIds }, status: { not: "CANCELLED" }, subtasks: { none: {} } },
    select: { id: true, projectId: true, plannedQty: true, plannedValueUzs: true, weight: true, status: true, reportedPercent: true },
  });
  const ids = tasks.map((t) => t.id);
  const [sessions, outsourced] = await Promise.all([
    db.workSession.groupBy({
      by: ["taskId"],
      where: { taskId: { in: ids }, status: { not: "REJECTED" } },
      _sum: { quantity: true },
    }),
    db.taskAssignment.groupBy({
      by: ["taskId"],
      where: { taskId: { in: ids }, kind: "CONTRACTOR", outsourceStatus: { in: ["COMPLETED", "VERIFIED"] } },
      _sum: { completedQty: true },
    }),
  ]);
  const done = new Map<string, number>();
  for (const s of sessions) done.set(s.taskId, (done.get(s.taskId) ?? 0) + Number(s._sum.quantity ?? 0));
  for (const o of outsourced) done.set(o.taskId, (done.get(o.taskId) ?? 0) + Number(o._sum.completedQty ?? 0));

  for (const projectId of projectIds) {
    const list = tasks.filter((t) => t.projectId === projectId);
    if (list.length === 0) {
      out.set(projectId, { percent: null, tasks: 0 });
      continue;
    }
    const valued = list.filter((t) => Number(t.plannedValueUzs ?? 0) > 0);
    const avgValue = valued.length ? valued.reduce((s, t) => s + Number(t.plannedValueUzs), 0) / valued.length : 1;
    let wSum = 0;
    let pSum = 0;
    for (const t of list) {
      const w = Number(t.plannedValueUzs ?? 0) > 0 ? Number(t.plannedValueUzs) : Number(t.weight ?? 1) * avgValue;
      const p = taskPercent({
        plannedQty: t.plannedQty ? Number(t.plannedQty) : null,
        doneQty: done.get(t.id) ?? 0,
        status: t.status,
        reportedPercent: t.reportedPercent,
      });
      wSum += w;
      pSum += w * p;
    }
    out.set(projectId, { percent: wSum > 0 ? pSum / wSum : null, tasks: list.length });
  }
  return out;
}
