import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { projectWhere } from "@/server/projects/access";
import { projectOfAttachment } from "@/server/files/access";
import { storeUpload } from "@/server/files/files";
import { parseSmeta } from "@/server/import/smeta";
import { addDrawingVersion, pdfPageCount } from "@/server/drawings/drawings";

export const dynamic = "force-dynamic";

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
  entityType: z.enum(["expense", "task", "session", "remark", "ticket", "contractor"]),
  entityId: z.string().min(1),
});

const CATEGORIES = new Set([
  "CONTRACT", "SIGNED_CONTRACT", "ADDITIONAL_AGREEMENT", "COMMERCIAL_OFFER", "TECH_SPEC", "PROJECT_FILES", "DRAWING",
  "SPECIFICATION", "SMETA", "INVOICE", "PURCHASE_ORDER", "WAYBILL", "ACT", "COMPLETION_ACT", "HIDDEN_WORKS_ACT",
  "TEST_ACT", "PAYMENT_PROOF", "FINAL_DOCS", "WARRANTY", "PASSPORT", "CERTIFICATE", "PHOTO", "CORRESPONDENCE",
  "SERVICE_REPORT", "CONTRACTOR_DOC", "OTHER",
]);

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Multipart upload of a document (new document or new version) or a record attachment. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "forbidden" }, 401);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "required" }, 400);
  const fields = Object.fromEntries([...form.entries()].filter(([k]) => k !== "file"));

  if (fields.purpose === "document") {
    const data = documentSchema.safeParse(fields);
    if (!data.success || !CATEGORIES.has(data.data.category)) return json({ error: "invalid" }, 400);
    if (!can(user, "documents.edit")) return json({ error: "forbidden" }, 403);
    const project = await db.project.findFirst({ where: { AND: [{ id: data.data.projectId }, projectWhere(user)] } });
    if (!project) return json({ error: "forbidden" }, 403);
    const existing = data.data.documentId
      ? await db.document.findFirst({ where: { id: data.data.documentId, projectId: project.id } })
      : null;
    if (data.data.documentId && !existing) return json({ error: "invalid" }, 400);

    const stored = await storeUpload(user.companyId, user.id, file);
    if ("error" in stored) return json({ error: stored.error }, 400);
    const ctx = { companyId: user.companyId, userId: user.id };
    const doc = await db.$transaction(async (tx) => {
      const d =
        existing ??
        (await tx.document.create({
          data: {
            companyId: user.companyId,
            projectId: project.id,
            category: data.data.category as never,
            title: data.data.title || file.name.replace(/\.[^.]+$/, ""),
            createdById: user.id,
          },
        }));
      const last = await tx.documentVersion.findFirst({ where: { documentId: d.id }, orderBy: { version: "desc" } });
      const v = await tx.documentVersion.create({
        data: { documentId: d.id, version: (last?.version ?? 0) + 1, fileId: stored.id, note: data.data.note, createdById: user.id },
      });
      await tx.document.update({ where: { id: d.id }, data: { updatedAt: new Date() } });
      await audit(tx, ctx, "Document", d.id, existing ? "update" : "create", null, {
        title: d.title,
        category: d.category,
        version: v.version,
        fileName: stored.fileName,
        projectId: project.id,
      });
      return d;
    });
    return json({ ok: true, id: doc.id });
  }

  if (fields.purpose === "attachment") {
    const data = attachmentSchema.safeParse(fields);
    if (!data.success) return json({ error: "invalid" }, 400);
    const projectId = await projectOfAttachment(data.data.entityType, data.data.entityId);
    if (projectId) {
      const visible = await db.project.findFirst({ where: { AND: [{ id: projectId }, projectWhere(user)] }, select: { id: true } });
      if (!visible) return json({ error: "forbidden" }, 403);
    } else if (data.data.entityType === "contractor") {
      if (!can(user, "contractors.edit")) return json({ error: "forbidden" }, 403);
      if (!(await db.contractor.findFirst({ where: { id: data.data.entityId, companyId: user.companyId } }))) return json({ error: "invalid" }, 400);
    } else if (!can(user, "documents.edit") && !can(user, "service.edit")) {
      return json({ error: "forbidden" }, 403);
    }
    const stored = await storeUpload(user.companyId, user.id, file);
    if ("error" in stored) return json({ error: stored.error }, 400);
    const att = await db.attachment.create({
      data: { companyId: user.companyId, fileId: stored.id, entityType: data.data.entityType, entityId: data.data.entityId },
    });
    return json({ ok: true, id: att.id, fileId: stored.id });
  }

  if (fields.purpose === "drawing") {
    const projectId = typeof fields.projectId === "string" ? fields.projectId : "";
    const drawingId = typeof fields.drawingId === "string" && fields.drawingId ? fields.drawingId : null;
    if (!can(user, "drawings.edit")) return json({ error: "forbidden" }, 403);
    const project = await db.project.findFirst({ where: { AND: [{ id: projectId }, projectWhere(user)] } });
    if (!project) return json({ error: "forbidden" }, 403);
    const drawing = drawingId ? await db.drawing.findFirst({ where: { id: drawingId, projectId } }) : null;
    if (drawingId && !drawing) return json({ error: "invalid" }, 400);
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return json({ error: "drawingPdfOnly" }, 400);
    const stored = await storeUpload(user.companyId, user.id, file);
    if ("error" in stored) return json({ error: stored.error }, 400);
    const title = (typeof fields.title === "string" && fields.title.trim()) || file.name.replace(/\.[^.]+$/, "");
    const discipline = typeof fields.discipline === "string" && fields.discipline.trim() ? fields.discipline.trim() : null;
    const note = typeof fields.note === "string" && fields.note.trim() ? fields.note.trim() : null;
    const result = await db.$transaction(async (tx) => {
      const d = drawing ?? (await tx.drawing.create({ data: { companyId: user.companyId, projectId, title, discipline } }));
      const v = await addDrawingVersion(tx, d.id, stored.id, pdfPageCount(buf), user.id, note);
      await audit(tx, { companyId: user.companyId, userId: user.id }, "Drawing", d.id, drawing ? "update" : "create", null, { title: d.title, version: v.version, fileName: stored.fileName });
      return { drawingId: d.id, version: v.version };
    });
    return json({ ok: true, ...result });
  }

  if (fields.purpose === "smeta") {
    const projectId = typeof fields.projectId === "string" ? fields.projectId : "";
    if (!can(user, "import.manage")) return json({ error: "forbidden" }, 403);
    const project = await db.project.findFirst({ where: { AND: [{ id: projectId }, projectWhere(user)] } });
    if (!project) return json({ error: "forbidden" }, 403);
    if (!/\.xlsx$/i.test(file.name)) return json({ error: "importXlsxOnly" }, 400);
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await parseSmeta(buf);
    if ("error" in parsed) return json({ error: parsed.error }, 400);
    const stored = await storeUpload(user.companyId, user.id, file);
    if ("error" in stored) return json({ error: stored.error }, 400);
    const imp = await db.smetaImport.create({
      data: {
        companyId: user.companyId,
        projectId: project.id,
        fileId: stored.id,
        rows: parsed.rows,
        vatRate: project.contractVatRate,
        createdById: user.id,
      },
    });
    await audit(db, { companyId: user.companyId, userId: user.id }, "SmetaImport", imp.id, "create", null, { fileName: stored.fileName, rows: parsed.rows.length });
    return json({ ok: true, id: imp.id });
  }

  return json({ error: "invalid" }, 400);
}
