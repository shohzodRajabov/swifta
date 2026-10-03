import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { putObject } from "./storage";
import { validateUpload } from "./validate";

/** Validate and store an uploaded file; returns the FileObject or an error key. */
export async function storeUpload(
  companyId: string,
  userId: string | null,
  file: File,
): Promise<{ id: string; fileName: string; mime: string } | { error: string }> {
  const buf = Buffer.from(await file.arrayBuffer());
  const checked = validateUpload(file.name, buf.length, buf.subarray(0, 16));
  if ("error" in checked) return checked;
  const now = new Date();
  const key = `${companyId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}-${checked.safeName}`;
  await putObject(key, buf, checked.mime);
  const saved = await db.fileObject.create({
    data: { companyId, storageKey: key, fileName: file.name.slice(0, 200), mime: checked.mime, size: buf.length, uploadedById: userId },
  });
  return { id: saved.id, fileName: saved.fileName, mime: saved.mime };
}
