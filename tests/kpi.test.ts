import { describe, expect, it } from "vitest";
import { combine, sanitizeRule, DEFAULT_KPI_RULES } from "@/lib/kpi";

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
