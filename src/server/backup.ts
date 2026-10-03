/**
 * Database backups: pg_dump (custom format) uploaded to object storage, recorded in BackupRun.
 * Restore: pg_restore --clean --no-owner -d "$DATABASE_URL" backup.dump
 * No "server-only" import: used by the background scheduler (instrumentation) too.
 */
import { spawn } from "node:child_process";
import { db } from "@/lib/db";
import { deleteObject, putObject } from "./files/storage";

function pgDump(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--dbname", url]);
    const chunks: Buffer[] = [];
    let err = "";
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => (err += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(err.trim() || `pg_dump exited with ${code}`))));
  });
}

export async function runBackup(trigger: "SCHEDULE" | "MANUAL", createdById?: string) {
  const run = await db.backupRun.create({ data: { trigger, createdById } });
  try {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const dump = await pgDump(url);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `backups/${stamp}.dump`;
    await putObject(key, dump, "application/octet-stream");
    await db.backupRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", storageKey: key, sizeBytes: dump.length, finishedAt: new Date() },
    });
    await pruneBackups();
    return { ok: true as const, id: run.id };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : String(e);
    await db.backupRun.update({ where: { id: run.id }, data: { status: "FAILED", error: message, finishedAt: new Date() } });
    return { ok: false as const, error: message };
  }
}

/** Keep the last 30 successful backups plus the first backup of each month for a year. */
async function pruneBackups() {
  const runs = await db.backupRun.findMany({ where: { status: "SUCCESS" }, orderBy: { startedAt: "desc" } });
  const keep = new Set(runs.slice(0, 30).map((r) => r.id));
  const seenMonths = new Set<string>();
  const yearAgo = Date.now() - 366 * 86400000;
  for (const r of [...runs].reverse()) {
    const m = r.startedAt.toISOString().slice(0, 7);
    if (!seenMonths.has(m) && r.startedAt.getTime() > yearAgo) {
      seenMonths.add(m);
      keep.add(r.id);
    }
  }
  for (const r of runs) {
    if (keep.has(r.id)) continue;
    if (r.storageKey) await deleteObject(r.storageKey).catch(() => undefined);
    await db.backupRun.delete({ where: { id: r.id } });
  }
}

/** Tashkent-local "today" start, for once-a-day jobs. */
export function tashkentDayStart(now = new Date()): Date {
  const local = new Date(now.getTime() + 5 * 3600000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 5 * 3600000);
}

export function tashkentHour(now = new Date()): number {
  return new Date(now.getTime() + 5 * 3600000).getUTCHours();
}

/** Daily backup after 03:00 Tashkent time, once per day. */
export async function maybeDailyBackup() {
  if (tashkentHour() < 3) return;
  const since = tashkentDayStart();
  const done = await db.backupRun.findFirst({
    where: { trigger: "SCHEDULE", startedAt: { gte: since }, status: { in: ["SUCCESS", "RUNNING"] } },
  });
  if (done) return;
  await runBackup("SCHEDULE");
}
