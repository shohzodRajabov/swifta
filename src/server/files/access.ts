import "server-only";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";
import { projectWhere } from "@/server/projects/access";

/** Project a file belongs to (through a document version, drawing or attachment), if any. */
async function projectOfFile(fileId: string): Promise<string | null | undefined> {
  const version = await db.documentVersion.findFirst({ where: { fileId }, select: { document: { select: { projectId: true } } } });
  if (version) return version.document.projectId;
  const drawing = await db.drawingVersion.findFirst({ where: { fileId }, select: { drawing: { select: { projectId: true } } } });
  if (drawing) return drawing.drawing.projectId;
  const imp = await db.smetaImport.findFirst({ where: { fileId }, select: { projectId: true } });
  if (imp) return imp.projectId;
  const att = await db.attachment.findFirst({ where: { fileId } });
  if (att) return projectOfAttachment(att.entityType, att.entityId);
  return undefined;
}

export async function projectOfAttachment(entityType: string, entityId: string): Promise<string | null> {
  switch (entityType) {
    case "expense":
      return (await db.expense.findUnique({ where: { id: entityId }, select: { projectId: true } }))?.projectId ?? null;
    case "task":
      return (await db.task.findUnique({ where: { id: entityId }, select: { projectId: true } }))?.projectId ?? null;
    case "session":
      return (await db.workSession.findUnique({ where: { id: entityId }, select: { projectId: true } }))?.projectId ?? null;
    case "remark":
      return (await db.remark.findUnique({ where: { id: entityId }, select: { projectId: true } }))?.projectId ?? null;
    case "ticket":
      return (await db.serviceTicket.findUnique({ where: { id: entityId }, select: { projectId: true } }))?.projectId ?? null;
    default:
      return null;
  }
}

/** Whether the user may read a stored file. */
export async function canReadFile(user: CurrentUser, fileId: string): Promise<boolean> {
  const file = await db.fileObject.findUnique({ where: { id: fileId }, select: { companyId: true } });
  if (!file || file.companyId !== user.companyId) return false;
  const projectId = await projectOfFile(fileId);
  if (projectId === undefined) return can(user, "documents.view") || can(user, "settings.manage");
  if (projectId === null) return can(user, "documents.view");
  const visible = await db.project.findFirst({ where: { AND: [{ id: projectId }, projectWhere(user)] }, select: { id: true } });
  return !!visible;
}
