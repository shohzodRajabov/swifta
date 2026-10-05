import { describe, expect, it } from "vitest";
import { bonusPct, combine, expectedWorkdays, formatBonusScale, parseBonusScale, sanitizeRule, weightedPct, DEFAULT_KPI_RULES } from "@/lib/kpi";

describe("KPI combine", () => {
  it("weights components and redistributes missing ones", () => {
    const r = combine(
      [
        { key: "quantity", weight: 40 },
        { key: "deadline", weight: 20 },
        { key: "leadership", weight: 40 },
      ],
      { quantity: { value: 90, raw: {}, sources: [] }, deadline: { value: 60, raw: {}, sources: [] } },
    );
    // leadership has no data → (40·90 + 20·60) / 60 = 80
    expect(r.score).toBe(80);
    expect(r.components.find((c) => c.key === "leadership")!.value).toBeNull();
    expect(r.components.reduce((s, c) => s + (c.weighted ?? 0), 0)).toBeCloseTo(80);
  });

  it("clamps values to 0–100 and returns null without data", () => {
    expect(combine([{ key: "quantity", weight: 1 }], { quantity: { value: 140, raw: {}, sources: [] } }).score).toBe(100);
    expect(combine([{ key: "quantity", weight: 1 }], {}).score).toBeNull();
  });

  it("sanitizes rules against the catalog", () => {
    const r = sanitizeRule("CONTRACTOR", [
      { key: "quality", weight: 50 },
      { key: "attendance", weight: 20 }, // not a contractor component
      { key: "price", weight: 10, params: { tolerance: Number.NaN } },
      { key: "deadline", weight: 0 },
    ]);
    expect(r.map((c) => c.key)).toEqual(["quality", "price"]);
    expect(r[1].params).toEqual({ tolerance: 20 });
    expect(sanitizeRule("EMPLOYEE", DEFAULT_KPI_RULES.EMPLOYEE.components)).toHaveLength(7);
  });
});

describe("KPI fixes (M7, M8)", () => {
  it("expected workdays follow a 5- or 6-day week", () => {
    const from = new Date(Date.UTC(2026, 9, 1)); // Thu
    const to = new Date(Date.UTC(2026, 9, 7)); // Wed
    expect(expectedWorkdays(from, to, 22).length).toBe(5); // Thu Fri Mon Tue Wed
    expect(expectedWorkdays(from, to, 26).length).toBe(6); // + Sat
  });
  it("weights the deadline by the share of hours", () => {
    expect(weightedPct([{ weight: 0.9, good: false }, { weight: 0.1, good: true }])).toBeCloseTo(10);
    expect(weightedPct([])).toBeNull();
  });
});

describe("KPI bonus", () => {
  const scale = parseBonusScale("70:5, 90:20; 80:10, bad, 85:0");
  it("parses and orders the scale", () => {
    expect(scale).toEqual([{ min: 90, pct: 20 }, { min: 80, pct: 10 }, { min: 70, pct: 5 }]);
    expect(formatBonusScale(scale)).toBe("90:20, 80:10, 70:5");
    expect(parseBonusScale([{ min: 75, pct: 8 }])).toEqual([{ min: 75, pct: 8 }]);
  });
  it("picks the highest reached step and needs enough data", () => {
    expect(bonusPct(92, 1, scale)).toBe(20);
    expect(bonusPct(80, 1, scale)).toBe(10);
    expect(bonusPct(69.9, 1, scale)).toBe(0);
    expect(bonusPct(95, 0.3, scale)).toBe(0);
    expect(bonusPct(null, 1, scale)).toBe(0);
  });
});
