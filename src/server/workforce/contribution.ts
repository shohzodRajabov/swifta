// Pure contribution maths (no I/O) — unit tested.
// Physical quantity of a session is recorded once; individual contribution = quantity × share and is used
// only for KPI. Shares always sum to 100%.

export type Method = "EQUAL" | "LEADER" | "RULE" | "EFFICIENCY";
export type MemberInput = {
  employeeId: string;
  role: "LEADER" | "SENIOR" | "WORKER";
  hours: number;
  /** LEADER method: percent entered by the leader */
  percent?: number | null;
  /** EFFICIENCY method: member's efficiency index (1 = company average) */
  efficiency?: number | null;
};
export type MemberShare = { employeeId: string; sharePercent: number; contributionQty: number };

const DEFAULT_WEIGHTS = { LEADER: 1.2, SENIOR: 1.1, WORKER: 1 };

export function computeShares(
  method: Method,
  quantity: number,
  members: MemberInput[],
  weights: Partial<Record<"LEADER" | "SENIOR" | "WORKER", number>> = DEFAULT_WEIGHTS,
): MemberShare[] {
  if (members.length === 0) return [];
  let raw: number[];
  switch (method) {
    case "LEADER": {
      raw = members.map((m) => Math.max(0, m.percent ?? 0));
      if (raw.every((x) => x === 0)) raw = members.map((m) => m.hours);
      break;
    }
    case "RULE":
      raw = members.map((m) => m.hours * (weights[m.role] ?? DEFAULT_WEIGHTS[m.role]));
      break;
    case "EFFICIENCY":
      raw = members.map((m) => m.hours * (m.efficiency && m.efficiency > 0 ? m.efficiency : 1));
      break;
    case "EQUAL":
    default:
      // Equal per person-hour: equal shares when everyone worked the same hours.
      raw = members.map((m) => Math.max(0, m.hours));
  }
  let total = raw.reduce((s, x) => s + x, 0);
  if (total <= 0) {
    raw = members.map(() => 1);
    total = members.length;
  }
  const shares = raw.map((x) => (x / total) * 100);
  // Fix rounding so the shares sum to exactly 100 (4 decimals).
  const rounded = shares.map((x) => Math.round(x * 10000) / 10000);
  const diff = Math.round((100 - rounded.reduce((s, x) => s + x, 0)) * 10000) / 10000;
  if (diff !== 0) {
    const i = rounded.indexOf(Math.max(...rounded));
    rounded[i] = Math.round((rounded[i] + diff) * 10000) / 10000;
  }
  return members.map((m, i) => ({
    employeeId: m.employeeId,
    sharePercent: rounded[i],
    contributionQty: Math.round(quantity * rounded[i] * 10) / 1000,
  }));
}

/** Remaining quantity of a task given its plan and recorded quantities. */
export function remainingQty(plannedQty: number | null, doneQty: number): number | null {
  if (plannedQty === null) return null;
  return Math.max(0, plannedQty - doneQty);
}
