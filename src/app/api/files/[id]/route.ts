import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canReadFile } from "@/server/files/access";
import { getObject, signedUrl } from "@/server/files/storage";

export const dynamic = "force-dynamic";

/** Authenticated file access: redirects to a short-lived signed URL (S3) or streams the file (local). */
export async function GET(request: Request, { params }: RouteContext<"/api/files/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await canReadFile(user, id))) return new Response("Forbidden", { status: 403 });
  const file = await db.fileObject.findUniqueOrThrow({ where: { id } });
  const passport = await db.attachment.findFirst({ where: { fileId: id, entityType: "employee_passport" }, select: { entityId: true } });
  if (passport)
    await db.$transaction((tx) => audit(tx, { companyId: user.companyId, userId: user.id }, "Employee", passport.entityId, "update", null, { passportFileViewed: file.fileName }));
  const search = new URL(request.url).searchParams;
  const download = search.has("download");
  const inline = !download && (file.mime.startsWith("image/") || file.mime === "application/pdf");
  // `raw` streams through this server (same origin) — used by the in-browser PDF viewer (no bucket CORS needed).
  const url = search.has("raw") ? null : await signedUrl(file.storageKey, file.fileName, inline);
  if (url) return Response.redirect(url, 302);
  const body = await getObject(file.storageKey);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(body.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
