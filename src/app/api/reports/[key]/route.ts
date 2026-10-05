import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolvePeriod } from "@/lib/period";
import { isoDate, today } from "@/lib/utils";
import { reportsFor } from "@/server/reports/defs";
import { cellText } from "@/server/reports/format";

export const dynamic = "force-dynamic";

/** Excel export of a report with the same filters as the page. */
export async function GET(request: Request, { params }: RouteContext<"/api/reports/[key]">) {
  const { key } = await params;
  const user = await getCurrentUser();
  if (!user || !can(user, "reports.view")) return new Response("Forbidden", { status: 403 });
  const def = reportsFor(user).find((r) => r.key === key);
  if (!def) return new Response("Not found", { status: 404 });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const period = resolvePeriod(sp, "year");
  const d = today();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))).slice(0, 7);
  const data = await def.run({
    user,
    from: def.filters.includes("period") ? period.from : null,
    to: def.filters.includes("period") ? period.to : null,
    projectId: def.filters.includes("project") && sp.project ? sp.project : null,
    month,
  });
  const t = await getTranslations();
  const T = (k: string, p?: Record<string, string>) => t(k, p);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Swifta";
  wb.created = new Date();
  const title = t(`reports.r_${def.key}`);
  const ws = wb.addWorksheet(title.slice(0, 31), { views: [{ state: "frozen", ySplit: 3 }] });
  ws.addRow([title]).font = { bold: true, size: 14 };
  const filters = [
    def.filters.includes("period") ? `${period.from ? isoDate(period.from) : "…"} — ${period.to ? isoDate(period.to) : "…"}` : null,
    def.filters.includes("month") ? month : null,
    `${user.company.name} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
  ].filter(Boolean);
  ws.addRow([filters.join(" · ")]).font = { color: { argb: "FF64748B" }, size: 9 };
  const header = ws.addRow(data.columns.map((c) => t(c.label)));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  const value = (type: string | undefined, v: unknown, text: string) => {
    if (v === null || v === undefined || v === "") return null;
    if (type === "money" || type === "int" || type === "num") return Number(v);
    if (type === "pct") return Number(v) / 100;
    if (type === "date") return v instanceof Date ? v : new Date(String(v));
    return text;
  };
  for (const r of data.rows) {
    const row = ws.addRow(data.columns.map((c) => value(c.type, r[c.key], cellText(T, c, r))));
    if (r._tone === "danger") row.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E2" } }));
    if (r._tone === "warning") row.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } }));
  }
  if (data.totals) {
    const row = ws.addRow(data.columns.map((c, i) => (i === 0 ? t("common.total") : data.totals![c.key] === undefined || data.totals![c.key] === "" ? null : value(c.type, data.totals![c.key], ""))));
    row.font = { bold: true };
    row.eachCell((cell) => (cell.border = { top: { style: "medium" } }));
  }
  data.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.numFmt = c.type === "money" ? "#,##0" : c.type === "int" ? "#,##0" : c.type === "num" ? "#,##0.0#" : c.type === "pct" ? "0.0%" : c.type === "date" ? "dd.mm.yyyy" : "@";
    const len = Math.max(t(c.label).length, ...data.rows.slice(0, 200).map((r) => cellText(T, c, r).length));
    col.width = Math.min(60, Math.max(10, len + 2));
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: data.columns.length } };
  const buf = await wb.xlsx.writeBuffer();
  const name = `${def.key}-${isoDate(new Date())}.xlsx`;
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
