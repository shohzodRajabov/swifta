import { describe, expect, it } from "vitest";
import { scoreContractor, smoothScores, normalizeWeights, DEFAULT_RATING_WEIGHTS, type ContractorScoreResult, type OutsourceFact } from "@/lib/contractor-score";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const fact = (o: Partial<OutsourceFact>): OutsourceFact => ({
  status: "VERIFIED",
  deadline: d("2026-05-10"),
  completedAt: d("2026-05-10"),
  qualityScore: 5,
  reworkCount: 0,
  agreedUzs: 10_000_000,
  actualUzs: 10_000_000,
  remarks: 0,
  ...o,
});

describe("contractor score", () => {
  it("is empty without finished work", () => {
    const r = scoreContractor([fact({ status: "ASSIGNED", completedAt: null, qualityScore: null })]);
    expect(r.rating).toBeNull();
    expect(r.reliability).toBeNull();
    expect(r.stats.active).toBe(1);
  });

  it("perfect history gives 5 and 100%", () => {
    const r = scoreContractor([fact({}), fact({})]);
    expect(r.rating).toBe(5);
    expect(r.reliability).toBe(100);
  });

  it("delays, rework and overrun lower the scores", () => {
    const r = scoreContractor([
      fact({ completedAt: d("2026-05-15"), reworkCount: 1, actualUzs: 12_000_000, qualityScore: 3, remarks: 2 }),
      fact({}),
      fact({ status: "CANCELLED", completedAt: null, qualityScore: null }),
    ]);
    expect(r.stats.onTime).toBe(1);
    expect(r.stats.avgDelayDays).toBe(2.5);
    expect(r.stats.priceOverrunPct).toBe(10);
    expect(r.rating!).toBeLessThan(4.2);
    expect(r.rating!).toBeGreaterThan(2.5);
    expect(r.reliability!).toBeLessThan(80);
  });

  it("CASE 16: rating updates when a new verified task is added", () => {
    const before = scoreContractor([fact({ qualityScore: 3 })]).rating!;
    const after = scoreContractor([fact({ qualityScore: 3 }), fact({ qualityScore: 5 })]).rating!;
    expect(after).toBeGreaterThan(before);
  });

  it("uses admin weights", () => {
    const facts = [fact({ qualityScore: 1 })];
    const onlyQuality = normalizeWeights({ quality: 100, deadline: 0, rework: 0, price: 0, complaints: 0 }, DEFAULT_RATING_WEIGHTS);
    expect(scoreContractor(facts, onlyQuality).rating).toBe(0);
    expect(normalizeWeights({ quality: "x" }, DEFAULT_RATING_WEIGHTS).quality).toBe(40);
  });
});

describe("smoothing (M9)", () => {
  it("pulls a one-job newcomer toward the company average", () => {
    const mk = (rating: number, verified: number) =>
      ({ rating, reliability: 100, ratingParts: {}, reliabilityParts: {}, stats: { verified, completed: verified, rejected: 0, cancelled: 0 } }) as unknown as ContractorScoreResult;
    const [veteran, newcomer] = smoothScores([mk(4, 20), mk(5, 1)]);
    expect(newcomer.rawRating).toBe(5);
    expect(newcomer.rating).toBeCloseTo((1 * 5 + 3 * 4.5) / 4, 2);
    expect(newcomer.lowData).toBe(true);
    expect(veteran.lowData).toBe(false);
    expect(veteran.rating!).toBeLessThan(4.1);
  });
});
