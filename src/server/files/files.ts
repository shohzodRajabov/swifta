import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { deleteObject, objectHead, objectSize, putObject } from "./storage";
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

/** Storage key for a new upload. */
export function newStorageKey(companyId: string, safeName: string) {
  const now = new Date();
  return `${companyId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}-${safeName}`;
}

/**
 * After a direct browser upload: checks the object's real size and signature, then registers it.
 * An invalid object is deleted from the bucket.
 */
export async function registerDirectUpload(
  companyId: string,
  userId: string,
  key: string,
  fileName: string,
): Promise<{ id: string; fileName: string; mime: string } | { error: string }> {
  if (!key.startsWith(`${companyId}/`) || (await db.fileObject.findFirst({ where: { storageKey: key }, select: { id: true } }))) return { error: "invalid" }; // ticket reuse
  const size = await objectSize(key);
  if (size === null) return { error: "uploadMissing" };
  const checked = validateUpload(fileName, size, size > 0 ? await objectHead(key, 16) : Buffer.alloc(0));
  if ("error" in checked) {
    await deleteObject(key);
    return checked;
  }
  const saved = await db.fileObject.create({
    data: { companyId, storageKey: key, fileName: fileName.slice(0, 200), mime: checked.mime, size, uploadedById: userId },
  });
  return { id: saved.id, fileName: saved.fileName, mime: saved.mime };
}
