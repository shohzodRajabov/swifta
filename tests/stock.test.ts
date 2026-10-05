import { describe, expect, it } from "vitest";
import { unitCosts } from "@/lib/stock";

describe("movement unit costs", () => {
  it("splits gross cost into net of VAT", () => {
    const c = unitCosts(112_000, 9.5, 12);
    expect(Number(c.unitCostUzs)).toBe(112_000);
    expect(Number(c.unitCostNetUzs)).toBe(100_000);
    expect(Number(c.vatRate)).toBe(12);
  });
  it("keeps net = gross without VAT (never zero)", () => {
    const c = unitCosts(50_000, 4.25, 0);
    expect(Number(c.unitCostNetUzs)).toBe(50_000);
    expect(Number(c.unitCostNetUsd)).toBe(4.25);
  });
});
