import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getObject, signedUrl } from "@/server/files/storage";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: RouteContext<"/api/backups/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.company.isDemo || !can(user, "backups.manage")) return new Response("Forbidden", { status: 403 });
  const run = await db.backupRun.findUnique({ where: { id } });
  if (!run?.storageKey) return new Response("Not found", { status: 404 });
  const name = run.storageKey.split("/").pop() ?? "backup.dump";
  const url = await signedUrl(run.storageKey, `swifta-${name}`, false);
  if (url) return Response.redirect(url, 302);
  const body = await getObject(run.storageKey);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="swifta-${name}"` },
  });
}
