import { describe, expect, it } from "vitest";
import { addBusinessHours, plannedVisits, slaHours, slaStatus } from "@/lib/sla";

const at = (s: string) => new Date(`${s}Z`);

describe("SLA", () => {
  it("uses priority defaults or the contract", () => {
    expect(slaHours("HIGH")).toEqual({ response: 8, resolve: 48, business: false });
    expect(slaHours("MEDIUM", { slaResponseHours: 4, slaResolveHours: 24 })).toEqual({ response: 4, resolve: 24, business: false });
    expect(slaHours("CRITICAL", { slaResponseHours: 8, slaResolveHours: 72 })).toEqual({ response: 4, resolve: 24, business: false });
  });

  it("computes response / resolution state", () => {
    const t = { reportedAt: at("2026-10-01T08:00:00"), respondedAt: at("2026-10-01T10:00:00"), resolvedAt: null, dueAt: null, priority: "HIGH" as const };
    const s = slaStatus(t, { response: 8, resolve: 48 }, at("2026-10-03T01:00:00"));
    expect(s.response).toBe("MET");
    expect(s.resolve).toBe("AT_RISK");
    expect(slaStatus(t, { response: 8, resolve: 48 }, at("2026-10-04T00:00:00")).resolve).toBe("BREACHED");
    expect(slaStatus({ ...t, respondedAt: null }, { response: 1, resolve: 48 }, at("2026-10-01T12:00:00")).response).toBe("BREACHED");
    expect(slaStatus({ ...t, resolvedAt: at("2026-10-02T08:00:00") }, { response: 8, resolve: 48 }).resolve).toBe("MET");
  });

  it("plans visits by frequency", () => {
    expect(plannedVisits(at("2026-01-15T00:00:00"), at("2026-12-31T00:00:00"), "QUARTERLY").map((d) => d.toISOString().slice(0, 10))).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
    ]);
    expect(plannedVisits(at("2026-01-01T00:00:00"), at("2026-12-31T00:00:00"), "ON_CALL")).toEqual([]);
  });
});

describe("business-hours SLA (M11)", () => {
  // Tashkent = UTC+5. 2026-10-03 is a Saturday.
  const at = (iso: string) => new Date(iso + "+05:00");
  it("counts only Mon–Sat 09–18", () => {
    expect(addBusinessHours(at("2026-10-01T10:00:00"), 4).toISOString()).toBe(at("2026-10-01T14:00:00").toISOString());
    // Thursday 16:00 + 4h → Friday 11:00
    expect(addBusinessHours(at("2026-10-01T16:00:00"), 4).toISOString()).toBe(at("2026-10-02T11:00:00").toISOString());
    // Saturday 17:00 + 3h → Monday 11:00 (Sunday skipped)
    expect(addBusinessHours(at("2026-10-03T17:00:00"), 3).toISOString()).toBe(at("2026-10-05T11:00:00").toISOString());
    // reported at night → starts at 09:00
    expect(addBusinessHours(at("2026-10-01T22:00:00"), 2).toISOString()).toBe(at("2026-10-02T11:00:00").toISOString());
  });
  it("slaHours carries the contract flag", () => {
    expect(slaHours("MEDIUM", { slaResponseHours: 8, slaResolveHours: 24, slaBusinessHours: true }).business).toBe(true);
    expect(slaHours("MEDIUM", null).business).toBe(false);
  });
});
