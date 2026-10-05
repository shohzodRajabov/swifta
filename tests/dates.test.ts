import { describe, expect, it } from "vitest";
import { isoDate, toDateOnly } from "@/lib/utils";

describe("Tashkent calendar days (M1)", () => {
  it("an instant after Tashkent midnight belongs to the next day even when UTC is still on the previous one", () => {
    const t = new Date("2026-10-05T20:30:00Z"); // 01:30 on 6 Oct in Tashkent
    expect(isoDate(toDateOnly(t))).toBe("2026-10-06");
    expect(isoDate(t)).toBe("2026-10-06");
  });
  it("dates stored at UTC midnight keep their day", () => {
    const d = new Date("2026-10-05T00:00:00Z");
    expect(toDateOnly(d).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(isoDate(d)).toBe("2026-10-05");
  });
  it("date strings from forms stay the same day", () => {
    expect(toDateOnly("2026-01-31").toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
});
