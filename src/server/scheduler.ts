/**
 * In-process scheduler (single Railway instance): daily database backup and Telegram digests.
 * A Postgres advisory lock prevents two instances from running the same job.
 */
import { db } from "@/lib/db";
import { maybeDailyBackup } from "./backup";
import { maybeTelegramDigests } from "./telegram/digest";

const LOCK_ID = 7_314_201;
let started = false;

async function tick() {
  const [{ locked }] = await db.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_ID}) AS locked`;
  if (!locked) return;
  try {
    await maybeDailyBackup();
    await maybeTelegramDigests();
    // Stale sign-in throttle counters.
    await db.authThrottle.deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });
  } catch (e) {
    console.error("[scheduler]", e);
  } finally {
    await db.$queryRaw`SELECT pg_advisory_unlock(${LOCK_ID})`;
  }
}

export function startScheduler() {
  if (started) return;
  started = true;
  setTimeout(() => void tick(), 60_000);
  setInterval(() => void tick(), 10 * 60_000);
  console.log("[scheduler] started");
}
