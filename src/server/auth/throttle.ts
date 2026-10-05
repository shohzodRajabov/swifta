import "server-only";
import { db } from "@/lib/db";

/**
 * Brute-force protection for sign-in: failures are counted per identifier (phone / email) and per IP
 * within a window; reaching the limit locks that key for a while. Counters live in the database so they
 * survive restarts and work across instances.
 */
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
export const LIMITS = { id: 5, ip: 20 } as const;

export function throttleKeys(identifier: string, ip: string | null) {
  return { id: `id:${identifier.trim().toLowerCase()}`, ip: ip ? `ip:${ip}` : null };
}

/** Time until which sign-in is locked for any of the keys, or null. */
export async function lockedUntil(keys: { id: string; ip: string | null }): Promise<Date | null> {
  const rows = await db.authThrottle.findMany({ where: { key: { in: [keys.id, ...(keys.ip ? [keys.ip] : [])] } } });
  const now = Date.now();
  const until = rows.map((r) => r.lockedUntil).filter((d): d is Date => !!d && d.getTime() > now);
  return until.length ? new Date(Math.max(...until.map((d) => d.getTime()))) : null;
}

export async function registerFailure(keys: { id: string; ip: string | null }) {
  const now = new Date();
  for (const [key, max] of [
    [keys.id, LIMITS.id],
    [keys.ip, LIMITS.ip],
  ] as const) {
    if (!key) continue;
    const row = await db.authThrottle.findUnique({ where: { key } });
    const fresh = !row || now.getTime() - row.firstAt.getTime() > WINDOW_MS;
    const failures = fresh ? 1 : row!.failures + 1;
    await db.authThrottle.upsert({
      where: { key },
      create: { key, failures, firstAt: now, lockedUntil: failures >= max ? new Date(now.getTime() + LOCK_MS) : null },
      update: { failures, firstAt: fresh ? now : row!.firstAt, lockedUntil: failures >= max ? new Date(now.getTime() + LOCK_MS) : null },
    });
  }
}

/** Successful sign-in clears the identifier's counter (the IP counter expires on its own). */
export async function registerSuccess(keys: { id: string; ip: string | null }) {
  await db.authThrottle.deleteMany({ where: { key: keys.id } });
}
