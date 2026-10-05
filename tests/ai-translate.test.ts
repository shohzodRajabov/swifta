import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseArray } from "@/server/ai/providers";
import { translit } from "@/lib/translit-uz";

describe("AI translation helpers", () => {
  it("parses a JSON array even with surrounding text", () => {
    expect(parseArray('```json\n["a","b"]\n```', 2)).toEqual(["a", "b"]);
    expect(() => parseArray('["a"]', 2)).toThrow();
  });
  it("transliterates Uzbek for the Cyrillic locale", () => {
    expect(translit("Ventkanal montaji — 2-qavat")).toBe("Вентканал монтажи — 2-қават");
  });
});
