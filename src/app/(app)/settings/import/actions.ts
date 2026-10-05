"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { IMPORT_TYPES, type ImportType } from "@/lib/bulk-import";
import { IMPORT_PERMS } from "./perms";
import { applyImport, previewImport, readSheet, type PreviewRow } from "@/server/import/bulk";

export type ImportState = {
  error?: string;
  preview?: { rows: PreviewRow[]; total: number; create: number; update: number; errors: number; unknownHeaders: string[]; tooMany: boolean };
  done?: { created: number; updated: number; skipped: number };
} | null;

const MAX_BYTES = 10 * 1024 * 1024;

export async function runImport(_: ImportState, formData: FormData): Promise<ImportState> {
  const user = await getCurrentUser();
  const type = String(formData.get("type")) as ImportType;
  if (!user || !IMPORT_TYPES.includes(type) || !can(user, IMPORT_PERMS[type])) return { error: "forbidden" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "importNoFile" };
  if (file.size > MAX_BYTES || !/\.xlsx$/i.test(file.name)) return { error: "importFileType" };
  let parsed;
  try {
    parsed = await readSheet(type, await file.arrayBuffer());
  } catch {
    return { error: "importFileType" };
  }
  if (parsed.rows.length === 0) return { error: "importEmpty" };
  const rows = await previewImport(type, user.companyId, parsed.rows);
  if (formData.get("mode") === "apply") {
    const done = await applyImport(type, user, rows, { salaries: can(user, "salaries.view") });
    revalidatePath("/", "layout");
    return { done };
  }
  return {
    preview: {
      rows: rows.slice(0, 300),
      total: rows.length,
      create: rows.filter((r) => r.action === "create").length,
      update: rows.filter((r) => r.action === "update").length,
      errors: rows.filter((r) => r.action === "error").length,
      unknownHeaders: parsed.unknownHeaders,
      tooMany: parsed.tooMany,
    },
  };
}
