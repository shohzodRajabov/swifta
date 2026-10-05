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

export function slaHours(priority: Prio, contract?: { slaResponseHours: number | null; slaResolveHours: number | null } | null) {
  const d = DEFAULT_SLA[priority];
  // A contract may only tighten the defaults for urgent tickets; it defines the base for normal ones.
  return {
    response: contract?.slaResponseHours ? Math.min(contract.slaResponseHours, priority === "CRITICAL" ? d.response : contract.slaResponseHours) : d.response,
    resolve: contract?.slaResolveHours ? Math.min(contract.slaResolveHours, priority === "CRITICAL" ? d.resolve : contract.slaResolveHours) : d.resolve,
  };
}

export type SlaState = "OK" | "AT_RISK" | "BREACHED" | "MET";

function state(due: Date, done: Date | null, now: Date, total: number): SlaState {
  if (done) return done <= due ? "MET" : "BREACHED";
  if (now > due) return "BREACHED";
  return due.getTime() - now.getTime() <= total * 0.25 ? "AT_RISK" : "OK";
}

export function slaStatus(
  t: { reportedAt: Date; respondedAt: Date | null; resolvedAt: Date | null; dueAt: Date | null; priority: Prio; planned?: boolean },
  hours: { response: number; resolve: number },
  now = new Date(),
) {
  const responseDue = new Date(t.reportedAt.getTime() + hours.response * H);
  const resolveDue = t.dueAt ?? new Date(t.reportedAt.getTime() + hours.resolve * H);
  return {
    responseDue,
    resolveDue,
    response: state(responseDue, t.respondedAt, now, hours.response * H),
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
