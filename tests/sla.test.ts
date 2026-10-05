import { describe, expect, it } from "vitest";
import { plannedVisits, slaHours, slaStatus } from "@/lib/sla";

const at = (s: string) => new Date(`${s}Z`);

describe("SLA", () => {
  it("uses priority defaults or the contract", () => {
    expect(slaHours("HIGH")).toEqual({ response: 8, resolve: 48 });
    expect(slaHours("MEDIUM", { slaResponseHours: 4, slaResolveHours: 24 })).toEqual({ response: 4, resolve: 24 });
    expect(slaHours("CRITICAL", { slaResponseHours: 8, slaResolveHours: 72 })).toEqual({ response: 4, resolve: 24 });
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
