import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { taskPercent } from "@/server/projects/progress";
import { sameSheet } from "@/lib/drawing-match";

/** Rough page count of a PDF (counts page objects); the viewer reads the exact number itself. */
export function pdfPageCount(buf: Buffer): number {
  const s = buf.toString("latin1");
  const n = (s.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  return Math.max(1, n);
}

/** Copies zones (with task links) from one version to another, marked "needs review". Returns the count. */
export async function copyZones(tx: Prisma.TransactionClient, fromVersionId: string, toVersionId: string, pageCount: number, userId: string) {
  const zones = await tx.drawingZone.findMany({ where: { versionId: fromVersionId }, include: { tasks: true } });
  let n = 0;
  for (const z of zones) {
    if (z.page > pageCount) continue;
    await tx.drawingZone.create({
      data: {
        versionId: toVersionId,
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
    n++;
  }
  if (n) await tx.drawingVersion.update({ where: { id: toVersionId }, data: { needsReview: true } });
  return n;
}

/**
 * A new version of a drawing. Zones are carried over (marked "needs review") only when the new file is the same
 * sheet — same page count and page size — or when explicitly asked; a different document starts clean and the
 * previous zones can still be copied by hand from the viewer.
 */
export async function addDrawingVersion(
  tx: Prisma.TransactionClient,
  drawingId: string,
  fileId: string,
  sheet: { pageCount: number; pageWidth: number | null; pageHeight: number | null },
  userId: string,
  note: string | null,
  carry: "auto" | "no" | "yes" = "auto",
) {
  const prev = await tx.drawingVersion.findFirst({ where: { drawingId }, orderBy: { version: "desc" }, include: { _count: { select: { zones: true } } } });
  const version = await tx.drawingVersion.create({
    data: { drawingId, version: (prev?.version ?? 0) + 1, fileId, ...sheet, note, createdById: userId, needsReview: false },
  });
  const copy = !!prev?._count.zones && (carry === "yes" || (carry === "auto" && sameSheet(prev, sheet)));
  const copied = copy ? await copyZones(tx, prev!.id, version.id, sheet.pageCount, userId) : 0;
  return { ...version, copied, previousZones: prev?._count.zones ?? 0 };
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
