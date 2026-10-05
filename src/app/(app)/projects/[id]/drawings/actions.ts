"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, runAction, type ActionState } from "@/lib/action";
import type { CurrentUser } from "@/lib/auth";
import { accessibleProject } from "@/server/projects/access";
import { nextRemarkNumber } from "@/server/workforce/tasks";

const ctx = (u: CurrentUser) => ({ companyId: u.companyId, userId: u.id });
const coord = z.number().min(-0.05).max(1.05);
const pt = z.tuple([coord, coord]);

/** Zone geometry in page-relative coordinates (0–1), independent of zoom and rendering size. */
const geometry = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("POINT"), x: coord, y: coord }),
  z.object({ kind: z.literal("RECT"), x: coord, y: coord, w: z.number().min(0.002).max(1.1), h: z.number().min(0.002).max(1.1) }),
  z.object({ kind: z.literal("LINE"), points: z.array(pt).min(2).max(200) }),
  z.object({ kind: z.literal("POLYGON"), points: z.array(pt).min(3).max(200) }),
]);
export type ZoneGeometry = z.infer<typeof geometry>;

async function loadVersion(user: CurrentUser, versionId: string) {
  const v = await db.drawingVersion.findFirst({ where: { id: versionId, drawing: { companyId: user.companyId } }, include: { drawing: true } });
  if (!v) fail("invalid");
  await accessibleProject(user, v.drawing.projectId);
  return v;
}

const zoneInput = z.object({
  id: z.string().nullable(),
  versionId: z.string(),
  page: z.number().int().min(1),
  name: z.string().trim().min(1).max(120),
  geometry,
  taskIds: z.array(z.string()).max(50),
  locationId: z.string().nullable(),
});

export async function saveZone(input: z.input<typeof zoneInput>): Promise<ActionState> {
  let path = "";
  const res = await runAction("drawings.edit", async (user) => {
    const d = zoneInput.parse(input);
    const v = await loadVersion(user, d.versionId);
    if (d.page > v.pageCount + 50) fail("invalid");
    const latest = await db.drawingVersion.findFirst({ where: { drawingId: v.drawingId }, orderBy: { version: "desc" }, select: { id: true } });
    if (latest?.id !== v.id) fail("drawingOldVersion");
    const projectId = v.drawing.projectId;
    if ((await db.task.count({ where: { id: { in: d.taskIds }, projectId } })) !== d.taskIds.length) fail("invalid");
    if (d.locationId && !(await db.projectLocation.findFirst({ where: { id: d.locationId, projectId } }))) fail("invalid");
    path = `/projects/${projectId}/drawings/${v.drawingId}`;
    const data = { name: d.name, page: d.page, kind: d.geometry.kind, geometry: d.geometry as Prisma.InputJsonValue, locationId: d.locationId };
    await db.$transaction(async (tx) => {
      if (d.id) {
        const before = await tx.drawingZone.findFirst({ where: { id: d.id, versionId: v.id }, include: { tasks: true } });
        if (!before) fail("invalid");
        await tx.drawingZone.update({ where: { id: d.id }, data: { ...data, needsReview: false } });
        await tx.drawingZoneTask.deleteMany({ where: { zoneId: d.id } });
        await tx.drawingZoneTask.createMany({ data: d.taskIds.map((taskId) => ({ zoneId: d.id!, taskId })) });
        await audit(tx, ctx(user), "DrawingZone", d.id, "update", { ...before, tasks: before.tasks.map((x) => x.taskId) }, { ...data, tasks: d.taskIds });
      } else {
        const z = await tx.drawingZone.create({ data: { ...data, versionId: v.id, createdById: user.id, tasks: { create: d.taskIds.map((taskId) => ({ taskId })) } } });
        await audit(tx, ctx(user), "DrawingZone", z.id, "create", null, { ...data, tasks: d.taskIds });
      }
    });
  });
  if (res?.ok && path) revalidatePath(path);
  return res;
}

export async function deleteZone(id: string): Promise<ActionState> {
  let path = "";
  const res = await runAction("drawings.edit", async (user) => {
    const z = await db.drawingZone.findFirst({ where: { id, version: { drawing: { companyId: user.companyId } } }, include: { version: { include: { drawing: true } }, tasks: true } });
    if (!z) fail("invalid");
    await accessibleProject(user, z.version.drawing.projectId);
    path = `/projects/${z.version.drawing.projectId}/drawings/${z.version.drawingId}`;
    await db.$transaction(async (tx) => {
      await tx.drawingZone.delete({ where: { id } });
      await audit(tx, ctx(user), "DrawingZone", id, "delete", { ...z, version: undefined, tasks: z.tasks.map((t) => t.taskId) }, null);
    });
  });
  if (res?.ok && path) revalidatePath(path);
  return res;
}

/** Confirm that carried-over zones still match the new drawing version (one zone or all). */
export async function reviewZones(versionId: string, zoneId: string | null): Promise<ActionState> {
  let path = "";
  const res = await runAction("drawings.edit", async (user) => {
    const v = await loadVersion(user, versionId);
    path = `/projects/${v.drawing.projectId}/drawings/${v.drawingId}`;
    await db.$transaction(async (tx) => {
      await tx.drawingZone.updateMany({ where: { versionId, ...(zoneId ? { id: zoneId } : {}) }, data: { needsReview: false } });
      const left = await tx.drawingZone.count({ where: { versionId, needsReview: true } });
      if (left === 0) await tx.drawingVersion.update({ where: { id: versionId }, data: { needsReview: false } });
      await audit(tx, ctx(user), "DrawingVersion", versionId, "update", null, { reviewed: zoneId ?? "all" });
    });
  });
  if (res?.ok && path) revalidatePath(path);
  return res;
}

const remarkInput = z.object({
  versionId: z.string(),
  page: z.number().int().min(1),
  x: coord,
  y: coord,
  description: z.string().trim().min(1).max(2000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  responsibleUserId: z.string().nullable(),
  deadline: z.string().nullable(),
  taskId: z.string().nullable(),
  locationId: z.string().nullable(),
});

/** A remark pinned to a point on the drawing. */
export async function addDrawingRemark(input: z.input<typeof remarkInput>): Promise<ActionState> {
  let path = "";
  const res = await runAction(["remarks.create", "remarks.manage"], async (user) => {
    const d = remarkInput.parse(input);
    const v = await loadVersion(user, d.versionId);
    const projectId = v.drawing.projectId;
    if (d.taskId && !(await db.task.findFirst({ where: { id: d.taskId, projectId } }))) fail("invalid");
    if (d.responsibleUserId && !(await db.user.findFirst({ where: { id: d.responsibleUserId, companyId: user.companyId } }))) fail("invalid");
    path = `/projects/${projectId}/drawings/${v.drawingId}`;
    const r = await db.$transaction(async (tx) => {
      const r = await tx.remark.create({
        data: {
          companyId: user.companyId,
          projectId,
          number: await nextRemarkNumber(tx, user.companyId),
          taskId: d.taskId,
          locationId: d.locationId,
          drawingVersionId: v.id,
          drawingPage: d.page,
          posX: d.x,
          posY: d.y,
          description: d.description,
          priority: d.priority,
          status: d.responsibleUserId ? "ASSIGNED" : "NEW",
          responsibleUserId: d.responsibleUserId,
          deadline: d.deadline ? new Date(`${d.deadline}T00:00:00Z`) : null,
          createdById: user.id,
        },
      });
      await audit(tx, ctx(user), "Remark", r.id, "create", null, r);
      return r;
    });
    return { id: r.id };
  });
  if (res?.ok && path) revalidatePath(path);
  return res;
}

export async function renameDrawing(drawingId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let path = "";
  const res = await runAction("drawings.edit", async (user) => {
    const d = z.object({ title: z.string().trim().min(1), discipline: z.string().trim().nullable() }).parse({ title: formData.get("title"), discipline: formData.get("discipline") || null });
    const dr = await db.drawing.findFirst({ where: { id: drawingId, companyId: user.companyId } });
    if (!dr) fail("invalid");
    await accessibleProject(user, dr.projectId);
    path = `/projects/${dr.projectId}`;
    await db.$transaction(async (tx) => {
      const after = await tx.drawing.update({ where: { id: drawingId }, data: d });
      await audit(tx, ctx(user), "Drawing", drawingId, "update", dr, after);
    });
  });
  if (res?.ok) revalidatePath(path);
  return res;
}
