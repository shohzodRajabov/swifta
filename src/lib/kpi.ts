// KPI rules: component catalog, default versions and score combination. Pure (no I/O), unit tested.
// The computation of each component lives in src/server/kpi/compute.ts; which components are used and with
// what weights / parameters is configured by the admin as versioned rules (KpiRule), never hard-coded.

export type KpiSubjectKey = "EMPLOYEE" | "GROUP" | "CONTRACTOR";

export type KpiComponentDef = {
  key: string;
  subjects: KpiSubjectKey[];
  /** parameter name → default value */
  params?: Record<string, number>;
};

export const KPI_COMPONENTS: KpiComponentDef[] = [
  { key: "quantity", subjects: ["EMPLOYEE", "GROUP"], params: { target: 1.15 } },
  { key: "deadline", subjects: ["EMPLOYEE", "GROUP", "CONTRACTOR"] },
  { key: "firstPass", subjects: ["EMPLOYEE", "GROUP"] },
  { key: "rework", subjects: ["EMPLOYEE", "GROUP", "CONTRACTOR"] },
  { key: "remarks", subjects: ["EMPLOYEE", "GROUP"], params: { penalty: 15 } },
  { key: "attendance", subjects: ["EMPLOYEE"] },
  { key: "leadership", subjects: ["EMPLOYEE"] },
  { key: "discipline", subjects: ["GROUP"] },
  { key: "quality", subjects: ["CONTRACTOR"] },
  { key: "price", subjects: ["CONTRACTOR"], params: { tolerance: 20 } },
];

export type RuleComponent = { key: string; weight: number; params?: Record<string, number> };

export const DEFAULT_KPI_RULES: Record<KpiSubjectKey, { name: string; components: RuleComponent[] }> = {
  EMPLOYEE: {
    name: "Xodim KPI",
    components: [
      { key: "quantity", weight: 35, params: { target: 1.15 } },
      { key: "deadline", weight: 15 },
      { key: "firstPass", weight: 15 },
      { key: "rework", weight: 10 },
      { key: "remarks", weight: 10, params: { penalty: 15 } },
      { key: "attendance", weight: 10 },
      { key: "leadership", weight: 5 },
    ],
  },
  GROUP: {
    name: "Guruh KPI",
    components: [
      { key: "quantity", weight: 40, params: { target: 1.15 } },
      { key: "deadline", weight: 20 },
      { key: "firstPass", weight: 20 },
      { key: "rework", weight: 10 },
      { key: "discipline", weight: 10 },
    ],
  },
  CONTRACTOR: {
    name: "Contractor KPI",
    components: [
      { key: "quality", weight: 40 },
      { key: "deadline", weight: 30 },
      { key: "rework", weight: 20 },
      { key: "price", weight: 10, params: { tolerance: 20 } },
    ],
  },
};

export type KpiSource = { type: "task" | "session" | "inspection" | "remark" | "attendance" | "assignment"; id: string; label: string; detail?: string; good?: boolean };

/** Result of one component for one subject in one month. `value` is 0–100 or null when there is no data. */
export type ComponentResult = { value: number | null; raw: Record<string, number | string | null>; sources: KpiSource[] };

export type SnapshotComponent = ComponentResult & { key: string; weight: number; weighted: number | null };

/** Share of the rule's weight that had data (0–1). Scores below MIN_COVERAGE are shown as "little data". */
export function coverage(components: { weight: number; value: number | null }[]) {
  const total = components.reduce((s, c) => s + Math.max(0, c.weight), 0);
  const covered = components.filter((c) => c.value !== null).reduce((s, c) => s + Math.max(0, c.weight), 0);
  return total > 0 ? covered / total : 0;
}
export const MIN_COVERAGE = 0.5;

/** Weighted score over components that have data; weights of empty components are redistributed. */
export function combine(rule: RuleComponent[], results: Record<string, ComponentResult | undefined>): { score: number | null; components: SnapshotComponent[] } {
  let w = 0;
  let s = 0;
  const components: SnapshotComponent[] = rule.map((c) => {
    const r = results[c.key] ?? { value: null, raw: {}, sources: [] };
    const value = r.value === null ? null : Math.max(0, Math.min(100, r.value));
    if (value !== null && c.weight > 0) {
      w += c.weight;
      s += c.weight * value;
    }
    return { key: c.key, weight: c.weight, ...r, value, weighted: null };
  });
  const score = w > 0 ? s / w : null;
  for (const c of components) c.weighted = c.value !== null && w > 0 ? (c.weight / w) * c.value : null;
  return { score: score === null ? null : Math.round(score * 10) / 10, components };
}

/** Validate an admin-entered rule against the catalog. */
export function sanitizeRule(subject: KpiSubjectKey, components: RuleComponent[]): RuleComponent[] {
  const out: RuleComponent[] = [];
  for (const c of components) {
    const def = KPI_COMPONENTS.find((d) => d.key === c.key && d.subjects.includes(subject));
    if (!def || !(c.weight > 0)) continue;
    const params: Record<string, number> = {};
    for (const [k, v] of Object.entries(def.params ?? {})) params[k] = Number.isFinite(c.params?.[k]) ? Number(c.params![k]) : v;
    out.push({ key: c.key, weight: Math.min(100, c.weight), ...(def.params ? { params } : {}) });
  }
  return out;
}

export const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : null);

export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0)), end: new Date(Date.UTC(y, m, 1)) };
}
