import { describe, expect, it } from "vitest";
import { pdfFirstPageSize, sameSheet } from "@/lib/drawing-match";

describe("drawing versions: same sheet?", () => {
  it("reads the first page size", () => {
    expect(pdfFirstPageSize("<< /Type /Page /MediaBox [0 0 2384 1684] >> /MediaBox [0 0 595 842]")).toEqual({ w: 2384, h: 1684 });
    expect(pdfFirstPageSize("no box")).toBeNull();
  });
  it("carries zones only to a matching sheet", () => {
    const a4 = { pageCount: 1, pageWidth: 842, pageHeight: 595 };
    expect(sameSheet(a4, { pageCount: 1, pageWidth: 841, pageHeight: 595.3 })).toBe(true);
    expect(sameSheet(a4, { pageCount: 38, pageWidth: 842, pageHeight: 595 })).toBe(false);
    expect(sameSheet(a4, { pageCount: 1, pageWidth: 595, pageHeight: 842 })).toBe(false);
    expect(sameSheet(a4, { pageCount: 1, pageWidth: 2384, pageHeight: 1684 })).toBe(false);
    expect(sameSheet({ pageCount: 1, pageWidth: null, pageHeight: null }, a4)).toBe(true);
  });
});
