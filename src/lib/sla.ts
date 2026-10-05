// Service SLA: response and resolution deadlines and their state. Pure, unit tested.
export type Prio = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Defaults when the ticket has no service contract (hours). */
export const DEFAULT_SLA: Record<Prio, { response: number; resolve: number }> = {
  CRITICAL: { response: 4, resolve: 24 },
  HIGH: { response: 8, resolve: 48 },
  MEDIUM: { response: 24, resolve: 72 },
  LOW: { response: 48, resolve: 120 },
};

const H = 3600000;

/** Business hours (M11): Monday–Saturday 09:00–18:00 Tashkent time (UTC+5, no DST). */
export const BUSINESS = { open: 9, close: 18, tzOffsetH: 5 };

/** `start` plus `hours` counted only inside business hours. */
export function addBusinessHours(start: Date, hours: number): Date {
  const off = BUSINESS.tzOffsetH * H;
  let t = start.getTime() + off; // work in "local" ms
  let left = hours * H;
  for (let guard = 0; guard < 4000 && left > 0; guard++) {
    const d = new Date(t);
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const open = dayStart + BUSINESS.open * H;
    const close = dayStart + BUSINESS.close * H;
    if (d.getUTCDay() === 0 || t >= close) {
      t = dayStart + 24 * H + BUSINESS.open * H;
      continue;
    }
    if (t < open) t = open;
    const chunk = Math.min(left, close - t);
    t += chunk;
    left -= chunk;
  }
  return new Date(t - off);
}

export function slaHours(
  priority: Prio,
  contract?: { slaResponseHours: number | null; slaResolveHours: number | null; slaBusinessHours?: boolean | null } | null,
) {
  const d = DEFAULT_SLA[priority];
  // A contract may only tighten the defaults for urgent tickets; it defines the base for normal ones.
  return {
    response: contract?.slaResponseHours ? Math.min(contract.slaResponseHours, priority === "CRITICAL" ? d.response : contract.slaResponseHours) : d.response,
    resolve: contract?.slaResolveHours ? Math.min(contract.slaResolveHours, priority === "CRITICAL" ? d.resolve : contract.slaResolveHours) : d.resolve,
    business: !!contract?.slaBusinessHours,
  };
}

export type SlaState = "OK" | "AT_RISK" | "BREACHED" | "MET";

function state(due: Date, done: Date | null, now: Date, total: number): SlaState {
  if (done) return done <= due ? "MET" : "BREACHED";
  if (now > due) return "BREACHED";
  return due.getTime() - now.getTime() <= total * 0.25 ? "AT_RISK" : "OK";
}

/** Deadline from a start: calendar hours, or business hours when the contract says so. */
export function slaDue(from: Date, hours: number, business?: boolean) {
  return business ? addBusinessHours(from, hours) : new Date(from.getTime() + hours * H);
}

export function slaStatus(
  t: { reportedAt: Date; respondedAt: Date | null; resolvedAt: Date | null; dueAt: Date | null; priority: Prio; planned?: boolean },
  hours: { response: number; resolve: number; business?: boolean },
  now = new Date(),
) {
  const responseDue = slaDue(t.reportedAt, hours.response, hours.business);
  const resolveDue = t.dueAt ?? slaDue(t.reportedAt, hours.resolve, hours.business);
  return {
    responseDue,
    resolveDue,
    response: state(responseDue, t.respondedAt, now, Math.max(H, responseDue.getTime() - t.reportedAt.getTime())),
    resolve: state(resolveDue, t.resolvedAt, now, Math.max(H, resolveDue.getTime() - t.reportedAt.getTime())),
  };
}

/** Planned visit dates of a contract from its frequency (first visit = start date). */
export function plannedVisits(start: Date, end: Date, frequency: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | "ON_CALL"): Date[] {
  const step = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12, ON_CALL: 0 }[frequency];
  if (!step) return [];
  const out: Date[] = [];
  for (let i = 0; ; i += step) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, Math.min(start.getUTCDate(), 28)));
    if (d > end) break;
    out.push(d);
    if (out.length > 120) break;
  }
  return out;
}
