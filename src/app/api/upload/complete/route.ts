import { getCurrentUser } from "@/lib/auth";
import { verifyUploadTicket } from "@/lib/session";
import { registerDirectUpload } from "@/server/files/files";
import { getObject } from "@/server/files/storage";
import { authorizeUpload, finishUpload } from "@/server/files/upload-flow";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Step 2 of a direct upload: verifies the uploaded object (real size and signature) and records it. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "forbidden" }, 401);
  const body = (await request.json().catch(() => null)) as { ticket?: string } | null;
  const t = body?.ticket ? await verifyUploadTicket(body.ticket) : null;
  if (!t || t.uid !== user.id || t.cid !== user.companyId) return json({ error: "invalid" }, 400);
  // Permissions may have changed while uploading.
  const denied = await authorizeUpload(user, t.fields, t.name);
  if (denied) return json(denied.body, denied.status);
  const stored = await registerDirectUpload(user.companyId, user.id, t.key, t.name);
  if ("error" in stored) return json({ error: stored.error }, 400);
  const res = await finishUpload(user, t.fields, stored, () => getObject(t.key));
  return json(res.body, res.status);
}
