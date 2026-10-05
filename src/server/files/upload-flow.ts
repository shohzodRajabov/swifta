import "server-only";
import { z } from "zod";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { projectWhere } from "@/server/projects/access";
import { projectOfAttachment } from "@/server/files/access";
import { parseSmeta } from "@/server/import/smeta";
import { addDrawingVersion, pdfPageCount } from "@/server/drawings/drawings";
import { deleteObject } from "./storage";

// What an upload is for and who may do it — shared by the multipart route and the direct (browser → bucket) flow.

export type UploadFields = Record<string, string>;
export type FlowResult = { status: number; body: Record<string, unknown> };
const err = (error: string, status = 400): FlowResult => ({ status, body: { error } });

const documentSchema = z.object({
  purpose: z.literal("document"),
  projectId: z.string().min(1),
  category: z.string().min(1),
  title: z.string().trim().optional(),
  documentId: z.string().optional(),
  note: z.string().trim().optional(),
});
const attachmentSchema = z.object({
  purpose: z.literal("attachment"),
  entityType: z.enum(["expense", "task", "session", "remark", "ticket", "contractor", "employee_passport"]),
  entityId: z.string().min(1),
});

const CATEGORIES = new Set([
  "CONTRACT", "SIGNED_CONTRACT", "ADDITIONAL_AGREEMENT", "COMMERCIAL_OFFER", "TECH_SPEC", "PROJECT_FILES", "DRAWING",
  "SPECIFICATION", "SMETA", "INVOICE", "PURCHASE_ORDER", "WAYBILL", "ACT", "COMPLETION_ACT", "HIDDEN_WORKS_ACT",
  "TEST_ACT", "PAYMENT_PROOF", "FINAL_DOCS", "WARRANTY", "PASSPORT", "CERTIFICATE", "PHOTO", "CORRESPONDENCE",
  "SERVICE_REPORT", "CONTRACTOR_DOC", "OTHER",
]);

/** Permission and target checks that don't need the file's bytes (run before any upload starts). */
export async function authorizeUpload(user: CurrentUser, fields: UploadFields, fileName: string): Promise<FlowResult | null> {
  if (fields.purpose === "document") {
    const data = documentSchema.safeParse(fields);
    if (!data.success || !CATEGORIES.has(data.data.category)) return err("invalid");
    if (!can(user, "documents.edit")) return err("forbidden", 403);
    const project = await db.project.findFirst({ where: { AND: [{ id: data.data.projectId }, projectWhere(user)] } });
    if (!project) return err("forbidden", 403);
    if (data.data.documentId && !(await db.document.findFirst({ where: { id: data.data.documentId, projectId: project.id } }))) return err("invalid");
    return null;
  }
  if (fields.purpose === "attachment") {
    const data = attachmentSchema.safeParse(fields);
    if (!data.success) return err("invalid");
    const projectId = await projectOfAttachment(data.data.entityType, data.data.entityId);
    if (projectId) {
      const visible = await db.project.findFirst({ where: { AND: [{ id: projectId }, projectWhere(user)] }, select: { id: true } });
      if (!visible) return err("forbidden", 403);
    } else if (data.data.entityType === "employee_passport") {
      // Personal data: only HR editors, only PDF or images.
      if (!can(user, "employees.edit")) return err("forbidden", 403);
      if (!(await db.employee.findFirst({ where: { id: data.data.entityId, companyId: user.companyId } }))) return err("invalid");
      if (!/\.(pdf|jpe?g|png|webp)$/i.test(fileName)) return err("passportType");
    } else if (data.data.entityType === "contractor") {
      if (!can(user, "contractors.edit")) return err("forbidden", 403);
      if (!(await db.contractor.findFirst({ where: { id: data.data.entityId, companyId: user.companyId } }))) return err("invalid");
    } else if (!can(user, "documents.edit") && !can(user, "service.edit")) {
      return err("forbidden", 403);
    }
    return null;
  }
  if (fields.purpose === "drawing") {
    if (!can(user, "drawings.edit")) return err("forbidden", 403);
    const project = await db.project.findFirst({ where: { AND: [{ id: fields.projectId ?? "" }, projectWhere(user)] } });
    if (!project) return err("forbidden", 403);
    if (fields.drawingId && !(await db.drawing.findFirst({ where: { id: fields.drawingId, projectId: project.id } }))) return err("invalid");
    if (!/\.pdf$/i.test(fileName)) return err("drawingPdfOnly");
    return null;
  }
  if (fields.purpose === "smeta") {
    if (!can(user, "import.manage")) return err("forbidden", 403);
    const project = await db.project.findFirst({ where: { AND: [{ id: fields.projectId ?? "" }, projectWhere(user)] } });
    if (!project) return err("forbidden", 403);
    if (!/\.xlsx$/i.test(fileName)) return err("importXlsxOnly");
    return null;
  }
  return err("invalid");
}

type Stored = { id: string; fileName: string };

/** Discards a stored file whose content turned out unusable. */
async function discard(stored: Stored) {
  const f = await db.fileObject.delete({ where: { id: stored.id } }).catch(() => null);
  if (f) await deleteObject(f.storageKey).catch(() => undefined);
}

/** Records what the stored file is for. `readAll` gives the bytes when the purpose needs them (drawings, smeta). */
export async function finishUpload(user: CurrentUser, fields: UploadFields, stored: Stored, readAll: () => Promise<Buffer>): Promise<FlowResult> {
  const ctx = { companyId: user.companyId, userId: user.id };

  if (fields.purpose === "document") {
    const data = documentSchema.parse(fields);
    const project = await db.project.findFirstOrThrow({ where: { AND: [{ id: data.projectId }, projectWhere(user)] } });
    const existing = data.documentId ? await db.document.findFirst({ where: { id: data.documentId, projectId: project.id } }) : null;
    const doc = await db.$transaction(async (tx) => {
      const d =
        existing ??
        (await tx.document.create({
          data: { companyId: user.companyId, projectId: project.id, category: data.category as never, title: data.title || stored.fileName.replace(/\.[^.]+$/, ""), createdById: user.id },
        }));
      const last = await tx.documentVersion.findFirst({ where: { documentId: d.id }, orderBy: { version: "desc" } });
      const v = await tx.documentVersion.create({ data: { documentId: d.id, version: (last?.version ?? 0) + 1, fileId: stored.id, note: data.note, createdById: user.id } });
      await tx.document.update({ where: { id: d.id }, data: { updatedAt: new Date() } });
      await audit(tx, ctx, "Document", d.id, existing ? "update" : "create", null, { title: d.title, category: d.category, version: v.version, fileName: stored.fileName, projectId: project.id });
      return d;
    });
    return { status: 200, body: { ok: true, id: doc.id } };
  }

  if (fields.purpose === "attachment") {
    const data = attachmentSchema.parse(fields);
    const att = await db.attachment.create({ data: { companyId: user.companyId, fileId: stored.id, entityType: data.entityType, entityId: data.entityId } });
    return { status: 200, body: { ok: true, id: att.id, fileId: stored.id } };
  }

  if (fields.purpose === "drawing") {
    const buf = await readAll();
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      await discard(stored);
      return err("drawingPdfOnly");
    }
    const drawing = fields.drawingId ? await db.drawing.findFirst({ where: { id: fields.drawingId, projectId: fields.projectId } }) : null;
    const title = fields.title?.trim() || stored.fileName.replace(/\.[^.]+$/, "");
    const discipline = fields.discipline?.trim() || null;
    const note = fields.note?.trim() || null;
    const result = await db.$transaction(async (tx) => {
      const d = drawing ?? (await tx.drawing.create({ data: { companyId: user.companyId, projectId: fields.projectId, title, discipline } }));
      const v = await addDrawingVersion(tx, d.id, stored.id, pdfPageCount(buf), user.id, note);
      await audit(tx, ctx, "Drawing", d.id, drawing ? "update" : "create", null, { title: d.title, version: v.version, fileName: stored.fileName });
      return { drawingId: d.id, version: v.version };
    });
    return { status: 200, body: { ok: true, ...result } };
  }

  if (fields.purpose === "smeta") {
    const project = await db.project.findFirstOrThrow({ where: { AND: [{ id: fields.projectId }, projectWhere(user)] } });
    const parsed = await parseSmeta(await readAll());
    if ("error" in parsed) {
      await discard(stored);
      return err(parsed.error);
    }
    const imp = await db.smetaImport.create({
      data: { companyId: user.companyId, projectId: project.id, fileId: stored.id, rows: parsed.rows, vatRate: project.contractVatRate, createdById: user.id },
    });
    await audit(db, ctx, "SmetaImport", imp.id, "create", null, { fileName: stored.fileName, rows: parsed.rows.length });
    return { status: 200, body: { ok: true, id: imp.id } };
  }
  return err("invalid");
}
