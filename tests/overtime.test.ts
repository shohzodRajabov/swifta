import { describe, expect, it } from "vitest";
import { sessionLaborCost, splitOvertime } from "@/lib/payroll";

describe("overtime (M5)", () => {
  it("no overtime within the daily norm", () => {
    expect(splitOvertime(0, 8, 8)).toEqual({ regular: 8, overtime: 0 });
  });
  it("a second session the same day goes over the norm", () => {
    // 6 h in the morning in another task, 4 h now → 2 h regular, 2 h overtime
    expect(splitOvertime(6, 4, 8)).toEqual({ regular: 2, overtime: 2 });
  });
  it("everything is overtime once the norm is used up", () => {
    expect(splitOvertime(9, 3, 8)).toEqual({ regular: 0, overtime: 3 });
  });
  it("cost uses the multiplier only for overtime", () => {
    expect(sessionLaborCost(50_000, { regular: 8, overtime: 2 }, 1.5)).toBe(50_000 * 8 + 50_000 * 1.5 * 2);
  });
});
