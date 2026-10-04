import { describe, expect, it } from "vitest";
import { computeShares, remainingQty } from "@/server/workforce/contribution";

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe("work session contribution", () => {
  it("CASE 1: one worker on one task gets the whole quantity", () => {
    const r = computeShares("EQUAL", 40, [{ employeeId: "a", role: "WORKER", hours: 8 }]);
    expect(r[0].sharePercent).toBe(100);
    expect(r[0].contributionQty).toBe(40);
  });

  it("CASE 2–3: three workers, 150 m² — physical volume is not multiplied", () => {
    const members = ["ali", "vali", "hasan"].map((id) => ({ employeeId: id, role: "WORKER" as const, hours: 8 }));
    const r = computeShares("EQUAL", 150, members);
    expect(sum(r.map((x) => x.sharePercent))).toBeCloseTo(100, 6);
    expect(sum(r.map((x) => x.contributionQty))).toBeCloseTo(150, 1); // not 450
    expect(r[0].contributionQty).toBeCloseTo(50, 1);
  });

  it("CASE 4: next day four workers, 140 m², unequal hours", () => {
    const r = computeShares("EQUAL", 140, [
      { employeeId: "ali", role: "LEADER", hours: 8 },
      { employeeId: "vali", role: "WORKER", hours: 8 },
      { employeeId: "hasan", role: "WORKER", hours: 8 },
      { employeeId: "bek", role: "WORKER", hours: 4 },
    ]);
    expect(sum(r.map((x) => x.contributionQty))).toBeCloseTo(140, 1);
    expect(r[3].contributionQty).toBeCloseTo(20, 1); // half the hours of the others
  });

  it("leader-approved percentages (40/35/25)", () => {
    const r = computeShares("LEADER", 150, [
      { employeeId: "ali", role: "LEADER", hours: 8, percent: 40 },
      { employeeId: "vali", role: "WORKER", hours: 8, percent: 35 },
      { employeeId: "hasan", role: "WORKER", hours: 8, percent: 25 },
    ]);
    expect(r.map((x) => x.contributionQty)).toEqual([60, 52.5, 37.5]);
  });

  it("rule weights are configurable (not hard-coded)", () => {
    const r = computeShares(
      "RULE",
      100,
      [
        { employeeId: "l", role: "LEADER", hours: 8 },
        { employeeId: "w", role: "WORKER", hours: 8 },
      ],
      { LEADER: 3, WORKER: 1 },
    );
    expect(r[0].sharePercent).toBe(75);
  });

  it("efficiency-weighted shares favour more productive members", () => {
    const r = computeShares("EFFICIENCY", 100, [
      { employeeId: "fast", role: "WORKER", hours: 8, efficiency: 1.5 },
      { employeeId: "avg", role: "WORKER", hours: 8, efficiency: 1 },
    ]);
    expect(r[0].sharePercent).toBe(60);
  });

  it("remaining quantity of a 500 m² task after 150 + 140 + 120", () => {
    expect(remainingQty(500, 150 + 140 + 120)).toBe(90);
    expect(remainingQty(500, 600)).toBe(0);
    expect(remainingQty(null, 10)).toBeNull();
  });
});
