import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { taskPercent } from "@/server/projects/progress";

/** Rough page count of a PDF (counts page objects); the viewer reads the exact number itself. */
export function pdfPageCount(buf: Buffer): number {
  const s = buf.toString("latin1");
  const n = (s.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  return Math.max(1, n);
}

/**
 * A new version of a drawing. Zones and their task links are carried over from the previous version and
 * marked "needs review" (the geometry may have moved) — mappings are never silently lost.
 */
export async function addDrawingVersion(
  tx: Prisma.TransactionClient,
  drawingId: string,
  fileId: string,
  pageCount: number,
  userId: string,
  note?: string | null,
) {
  const prev = await tx.drawingVersion.findFirst({
    where: { drawingId },
    orderBy: { version: "desc" },
    include: { zones: { include: { tasks: true } } },
  });
  const version = await tx.drawingVersion.create({
    data: { drawingId, version: (prev?.version ?? 0) + 1, fileId, pageCount, note, createdById: userId, needsReview: !!prev?.zones.length },
  });
  for (const z of prev?.zones ?? []) {
    if (z.page > pageCount) continue;
    await tx.drawingZone.create({
      data: {
        versionId: version.id,
        page: z.page,
        name: z.name,
        kind: z.kind,
        geometry: z.geometry as Prisma.InputJsonValue,
        locationId: z.locationId,
        needsReview: true,
        createdById: userId,
        tasks: { create: z.tasks.map((t) => ({ taskId: t.taskId })) },
      },
    });
  }
  return version;
}

export type TaskSummary = {
  id: string;
  number: number;
  title: string;
  status: string;
  percent: number;
  doneQty: number;
  plannedQty: number | null;
  unit: string | null;
  deadline: string | null;
  responsible: string | null;
  performers: string[];
  inspections: { attempt: number; result: string }[];
  openRemarks: number;
  photos: number;
};

/** Everything a zone popup needs about its tasks (status, progress, people, inspections, remarks, photos). */
export async function taskSummaries(taskIds: string[]): Promise<Map<string, TaskSummary>> {
  const out = new Map<string, TaskSummary>();
  if (taskIds.length === 0) return out;
  const [tasks, done, outsourced, photos] = await Promise.all([
    db.task.findMany({
      where: { id: { in: taskIds } },
      include: {
        responsible: { select: { name: true } },
        assignments: { include: { group: { select: { name: true } }, employee: { select: { fullName: true } }, contractor: { select: { name: true } } } },
        inspections: { select: { attempt: true, result: true }, orderBy: { attempt: "asc" } },
        _count: { select: { remarks: { where: { status: { not: "ACCEPTED" } } } } },
      },
    }),
    db.workSession.groupBy({ by: ["taskId"], where: { taskId: { in: taskIds }, status: "APPROVED" }, _sum: { quantity: true } }),
    db.taskAssignment.groupBy({ by: ["taskId"], where: { taskId: { in: taskIds }, kind: "CONTRACTOR", outsourceStatus: { in: ["COMPLETED", "VERIFIED"] } }, _sum: { completedQty: true } }),
    db.attachment.groupBy({ by: ["entityId"], where: { entityType: "task", entityId: { in: taskIds } }, _count: { _all: true } }),
  ]);
  for (const t of tasks) {
    const doneQty = Number(done.find((d) => d.taskId === t.id)?._sum.quantity ?? 0) + Number(outsourced.find((d) => d.taskId === t.id)?._sum.completedQty ?? 0);
    const plannedQty = t.plannedQty ? Number(t.plannedQty) : null;
    out.set(t.id, {
      id: t.id,
      number: t.number,
      title: t.title,
      status: t.status,
      percent: Math.round(taskPercent({ plannedQty, doneQty, status: t.status, reportedPercent: t.reportedPercent })),
      doneQty,
      plannedQty,
      unit: t.unit,
      deadline: t.deadline ? t.deadline.toISOString().slice(0, 10) : null,
      responsible: t.responsible?.name ?? null,
      performers: t.assignments.map((a) => a.group?.name ?? a.employee?.fullName ?? a.contractor?.name ?? "").filter(Boolean),
      inspections: t.inspections,
      openRemarks: t._count.remarks,
      photos: photos.find((p) => p.entityId === t.id)?._count._all ?? 0,
    });
  }
  return out;
}
