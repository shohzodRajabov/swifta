import { getCurrentUser } from "@/lib/auth";
import { storeUpload } from "@/server/files/files";
import { authorizeUpload, finishUpload, type UploadFields } from "@/server/files/upload-flow";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Multipart upload through the app (local storage, or fallback when direct uploads are unavailable):
 * a document (new or new version), a record attachment, a drawing version or a smeta workbook.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "forbidden" }, 401);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "required" }, 400);
  const fields = Object.fromEntries([...form.entries()].filter(([k, v]) => k !== "file" && typeof v === "string")) as UploadFields;
  const denied = await authorizeUpload(user, fields, file.name);
  if (denied) return json(denied.body, denied.status);
  const stored = await storeUpload(user.companyId, user.id, file);
  if ("error" in stored) return json({ error: stored.error }, 400);
  const res = await finishUpload(user, fields, stored, async () => Buffer.from(await file.arrayBuffer()));
  return json(res.body, res.status);
}
