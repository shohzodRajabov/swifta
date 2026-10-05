// Contractor rating and reliability — computed only from recorded facts (no subjective "best" verdict).
// Pure functions (no I/O), unit tested. Weights are configured by the admin (Company.contractor*Config).

export type OutsourceFact = {
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "VERIFIED" | "REJECTED" | "CANCELLED";
  deadline: Date | null;
  completedAt: Date | null;
  qualityScore: number | null; // 1–5 given at verification
  reworkCount: number; // times the work was sent back
  agreedUzs: number | null;
  actualUzs: number | null;
  remarks: number; // remarks (complaints) on the task while the contractor worked on it
};

export const RATING_COMPONENTS = ["quality", "deadline", "rework", "price", "complaints"] as const;
export const RELIABILITY_COMPONENTS = ["onTime", "verified", "rework", "cancelled"] as const;
export type RatingComponent = (typeof RATING_COMPONENTS)[number];
export type ReliabilityComponent = (typeof RELIABILITY_COMPONENTS)[number];

export const DEFAULT_RATING_WEIGHTS: Record<RatingComponent, number> = { quality: 40, deadline: 25, rework: 20, price: 10, complaints: 5 };
export const DEFAULT_RELIABILITY_WEIGHTS: Record<ReliabilityComponent, number> = { onTime: 40, verified: 30, rework: 15, cancelled: 15 };

export type ContractorStats = {
  total: number;
  active: number;
  completed: number; // finished by the contractor (COMPLETED or VERIFIED)
  verified: number;
  rejected: number;
  cancelled: number;
  reworked: number; // tasks that needed rework at least once
  onTime: number; // verified/completed on or before the deadline
  withDeadline: number;
  avgDelayDays: number | null;
  avgQuality: number | null;
  priceOverrunPct: number | null; // average (actual − agreed) / agreed, %
  remarks: number;
};

export type ContractorScoreResult = {
  stats: ContractorStats;
  /** 0–5, null until at least one verified task */
  rating: number | null;
  /** 0–100 %, null until at least one finished task */
  reliability: number | null;
  ratingParts: Partial<Record<RatingComponent, number>>; // each 0–1
  reliabilityParts: Partial<Record<ReliabilityComponent, number>>; // each 0–1
};

const DAY = 86400000;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function contractorStats(facts: OutsourceFact[]): ContractorStats {
  const done = facts.filter((f) => f.status === "COMPLETED" || f.status === "VERIFIED");
  const verified = facts.filter((f) => f.status === "VERIFIED");
  const timed = done.filter((f) => f.deadline && f.completedAt);
  const delays = timed.map((f) => Math.max(0, Math.round((startOfDay(f.completedAt!) - startOfDay(f.deadline!)) / DAY)));
  const quality = verified.filter((f) => f.qualityScore);
  const priced = verified.filter((f) => f.agreedUzs && f.agreedUzs > 0 && f.actualUzs !== null);
  return {
    total: facts.length,
    active: facts.filter((f) => f.status === "ASSIGNED" || f.status === "IN_PROGRESS").length,
    completed: done.length,
    verified: verified.length,
    rejected: facts.filter((f) => f.status === "REJECTED").length,
    cancelled: facts.filter((f) => f.status === "CANCELLED").length,
    reworked: facts.filter((f) => f.reworkCount > 0).length,
    onTime: delays.filter((d) => d === 0).length,
    withDeadline: timed.length,
    avgDelayDays: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
    avgQuality: quality.length ? quality.reduce((a, f) => a + f.qualityScore!, 0) / quality.length : null,
    priceOverrunPct: priced.length ? (priced.reduce((a, f) => a + (f.actualUzs! - f.agreedUzs!) / f.agreedUzs!, 0) / priced.length) * 100 : null,
    remarks: facts.reduce((a, f) => a + f.remarks, 0),
  };
}

function startOfDay(d: Date) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function weighted<K extends string>(parts: Partial<Record<K, number>>, weights: Record<K, number>): number | null {
  let w = 0;
  let s = 0;
  for (const [k, v] of Object.entries(parts) as [K, number][]) {
    const wk = Math.max(0, weights[k] ?? 0);
    w += wk;
    s += wk * v;
  }
  return w > 0 ? s / w : null;
}

/** Normalize admin-entered weights (missing keys fall back to defaults). */
export function normalizeWeights<K extends string>(raw: unknown, defaults: Record<K, number>): Record<K, number> {
  const out = { ...defaults };
  if (raw && typeof raw === "object")
    for (const k of Object.keys(defaults) as K[]) {
      const v = Number((raw as Record<string, unknown>)[k]);
      if (Number.isFinite(v) && v >= 0) out[k] = v;
    }
  return out;
}

export function scoreContractor(
  facts: OutsourceFact[],
  ratingWeights: Record<RatingComponent, number> = DEFAULT_RATING_WEIGHTS,
  reliabilityWeights: Record<ReliabilityComponent, number> = DEFAULT_RELIABILITY_WEIGHTS,
): ContractorScoreResult {
  const stats = contractorStats(facts);
  const finished = stats.completed + stats.rejected + stats.cancelled;

  const ratingParts: Partial<Record<RatingComponent, number>> = {};
  if (stats.verified > 0) {
    if (stats.avgQuality !== null) ratingParts.quality = clamp01((stats.avgQuality - 1) / 4);
    if (stats.withDeadline > 0) ratingParts.deadline = clamp01(stats.onTime / stats.withDeadline - (stats.avgDelayDays ?? 0) / 100);
    ratingParts.rework = clamp01(1 - stats.reworked / Math.max(1, stats.completed + stats.rejected));
    // 0 % overrun → 1; 20 % or more → 0. Savings are not rewarded beyond 1.
    if (stats.priceOverrunPct !== null) ratingParts.price = clamp01(1 - Math.max(0, stats.priceOverrunPct) / 20);
    ratingParts.complaints = clamp01(1 - stats.remarks / Math.max(1, stats.completed));
  }
  const r = weighted(ratingParts, ratingWeights);

  const reliabilityParts: Partial<Record<ReliabilityComponent, number>> = {};
  if (finished > 0) {
    if (stats.withDeadline > 0) reliabilityParts.onTime = stats.onTime / stats.withDeadline;
    reliabilityParts.verified = stats.verified / Math.max(1, stats.verified + stats.rejected + stats.cancelled);
    reliabilityParts.rework = clamp01(1 - stats.reworked / Math.max(1, stats.completed + stats.rejected));
    reliabilityParts.cancelled = clamp01(1 - stats.cancelled / Math.max(1, stats.total));
  }
  const rel = weighted(reliabilityParts, reliabilityWeights);

  return {
    stats,
    rating: r === null ? null : Math.round(r * 5 * 100) / 100,
    reliability: rel === null ? null : Math.round(rel * 1000) / 10,
    ratingParts,
    reliabilityParts,
  };
}
