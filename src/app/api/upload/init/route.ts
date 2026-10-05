import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { signUploadTicket } from "@/lib/session";
import { newStorageKey } from "@/server/files/files";
import { directUploads, presignedPut } from "@/server/files/storage";
import { MAX_UPLOAD_BYTES, mimeForName } from "@/server/files/validate";
import { authorizeUpload } from "@/server/files/upload-flow";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const schema = z.object({ name: z.string().min(1).max(300), size: z.number().int().nonnegative(), fields: z.record(z.string(), z.string()) });

/**
 * Step 1 of a direct upload: checks permissions and the declared name/size, returns a presigned PUT URL for the
 * bucket and a signed ticket. `{direct: false}` tells the client to use the multipart route instead.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "forbidden" }, 401);
  if (!directUploads()) return json({ direct: false });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const { name, size, fields } = parsed.data;
  if (size <= 0) return json({ error: "fileEmpty" }, 400);
  if (size > MAX_UPLOAD_BYTES) return json({ error: "fileTooLarge" }, 400);
  const mime = mimeForName(name);
  if (!mime) return json({ error: "fileType" }, 400);
  const denied = await authorizeUpload(user, fields, name);
  if (denied) return json(denied.body, denied.status);
  const safe = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-120) || "file";
  const key = newStorageKey(user.companyId, safe);
  const url = await presignedPut(key, mime);
  const ticket = await signUploadTicket({ uid: user.id, cid: user.companyId, key, name, fields });
  return json({ direct: true, url, contentType: mime, ticket });
}
