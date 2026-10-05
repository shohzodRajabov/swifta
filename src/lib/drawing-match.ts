// Is a new drawing version the same sheet as the previous one (so zones can be carried over)? Pure, unit tested.

export type SheetInfo = { pageCount: number; pageWidth: number | null; pageHeight: number | null };

/** First page size from the PDF bytes (first /MediaBox), in points; null when not found. */
export function pdfFirstPageSize(pdf: string): { w: number; h: number } | null {
  const m = pdf.match(/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/);
  if (!m) return null;
  const [x0, y0, x1, y1] = m.slice(1).map(Number);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  return w > 0 && h > 0 ? { w, h } : null;
}

/**
 * Zones are carried over only when the new file looks like the same sheet: same page count and the same first
 * page size (±2%, either orientation counts as different). Unknown sizes compare by page count alone.
 */
export function sameSheet(prev: SheetInfo, next: SheetInfo): boolean {
  if (prev.pageCount !== next.pageCount) return false;
  if (prev.pageWidth && prev.pageHeight && next.pageWidth && next.pageHeight) {
    const close = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b) <= 0.02;
    return close(prev.pageWidth, next.pageWidth) && close(prev.pageHeight, next.pageHeight);
  }
  return true;
}
