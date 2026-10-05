import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getObject, signedUrl } from "@/server/files/storage";
import { audit } from "@/lib/audit";
import { decrypt, encryptionKey, isEncrypted } from "@/lib/crypto-box";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: RouteContext<"/api/backups/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || user.company.isDemo || !can(user, "backups.manage")) return new Response("Forbidden", { status: 403 });
  const run = await db.backupRun.findUnique({ where: { id } });
  if (!run?.storageKey) return new Response("Not found", { status: 404 });
  const name = (run.storageKey.split("/").pop() ?? "backup.dump").replace(/\.enc$/, "");
  // Encrypted backups are decrypted here, so the admin gets a ready-to-restore pg_dump file.
  if (!run.storageKey.endsWith(".enc")) {
    const url = await signedUrl(run.storageKey, `swifta-${name}`, false);
    if (url) return Response.redirect(url, 302);
  }
  const stored = await getObject(run.storageKey);
  let body = stored;
  if (isEncrypted(stored)) {
    const key = encryptionKey();
    if (!key) return new Response("ENCRYPTION_KEY is not configured", { status: 500 });
    body = decrypt(stored, key);
  }
  await db.$transaction((tx) => audit(tx, { companyId: user.companyId, userId: user.id }, "BackupRun", run.id, "update", null, { downloaded: true }));
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="swifta-${name}"` },
  });
}
