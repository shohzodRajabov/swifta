import { toDateOnly } from "./utils";

export type PeriodKey = "month" | "quarter" | "year" | "all" | "custom";
export const PERIOD_KEYS: PeriodKey[] = ["month", "quarter", "year", "all", "custom"];

export type Period = { key: PeriodKey; from: Date | null; to: Date | null };

/** Resolve dashboard/report period filters: month / quarter / year / all time / custom range. */
export function resolvePeriod(
  sp: { period?: string; from?: string; to?: string },
  fallback: PeriodKey = "year",
  now = new Date(),
): Period {
  const key = (PERIOD_KEYS as string[]).includes(sp.period ?? "") ? (sp.period as PeriodKey) : fallback;
  const preset = presetPeriod(key, sp, now);
  // Editing the dates of a preset turns it into a custom range.
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  if (key !== "custom" && ((sp.from && sp.from !== iso(preset.from)) || (sp.to && sp.to !== iso(preset.to)))) {
    return presetPeriod("custom", sp, now);
  }
  return preset;
}

function presetPeriod(key: PeriodKey, sp: { from?: string; to?: string }, now: Date): Period {
  const y = now.getFullYear();
  const m = now.getMonth();
  const utc = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd));
  switch (key) {
    case "month":
      return { key, from: utc(y, m, 1), to: utc(y, m + 1, 0) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { key, from: utc(y, q, 1), to: utc(y, q + 3, 0) };
    }
    case "year":
      return { key, from: utc(y, 0, 1), to: utc(y, 11, 31) };
    case "all":
      return { key, from: null, to: null };
    case "custom": {
      const from = sp.from ? toDateOnly(new Date(sp.from)) : null;
      const to = sp.to ? toDateOnly(new Date(sp.to)) : null;
      return { key, from, to };
    }
  }
}

/** Prisma date filter for a period (undefined = no filter). */
export function dateFilter(p: Period): { gte?: Date; lte?: Date } | undefined {
  if (!p.from && !p.to) return undefined;
  return { ...(p.from ? { gte: p.from } : {}), ...(p.to ? { lte: p.to } : {}) };
}

/** Month keys (YYYY-MM) covered by a period, for charts; open periods use the last 12 months. */
export function monthsOf(p: Period, now = new Date()): string[] {
  const end = p.to ?? toDateOnly(now);
  const start = p.from ?? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const out: string[] = [];
  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    out.push(d.toISOString().slice(0, 7));
    if (out.length > 60) break;
  }
  return out;
}
