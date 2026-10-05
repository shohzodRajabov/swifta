import type { Col, Row } from "./defs";

type T = (key: string, params?: Record<string, string>) => string;

/** Text of a "badge" cell: values are stored as "<namespace>:<KEY>" and translated. */
export function badgeText(t: T, v: unknown) {
  const s = String(v ?? "");
  const i = s.indexOf(":");
  return i > 0 ? t(`${s.slice(0, i)}.${s.slice(i + 1)}`) : s;
}

/** First-column label for P&L category rows ("cat:LABOR"). */
export function cellText(t: T, col: Col, row: Row): string {
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return "";
  if (col.type === "badge") return badgeText(t, v);
  if (typeof v === "string" && v.startsWith("cat:")) return `  ${t(`costCategory.${v.slice(4)}`)}`;
  return String(v);
}
