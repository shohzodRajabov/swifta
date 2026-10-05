import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolvePeriod } from "@/lib/period";
import { formatDate, isoDate } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Empty, Input, Notice, PageHeader, Select } from "@/components/ui";
import { PeriodFields } from "@/components/period-filter";
import { projectWhere } from "@/server/projects/access";
import { reportsFor, type Col, type Row } from "@/server/reports/defs";
import { cellText } from "@/server/reports/format";

function prevMonth() {
  const d = new Date();
  return isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))).slice(0, 7);
}

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[key]">) {
  const { key } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const user = await requirePermission("reports.view");
  const def = reportsFor(user).find((r) => r.key === key);
  if (!def) notFound();
  const t = await getTranslations();
  const period = resolvePeriod(sp, "year");
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : prevMonth();
  const projectId = def.filters.includes("project") && sp.project ? sp.project : null;
  const [data, projects] = await Promise.all([
    def.run({ user, from: def.filters.includes("period") ? period.from : null, to: def.filters.includes("period") ? period.to : null, projectId, month }),
    def.filters.includes("project") ? db.project.findMany({ where: projectWhere(user), orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const T = (k: string, p?: Record<string, string>) => t(k, p);

  const cell = (c: Col, r: Row) => {
    const v = r[c.key];
    if (v === null || v === undefined || v === "") return <span className="text-muted">—</span>;
    switch (c.type) {
      case "money":
        return <span className="num">{formatNumber(Math.round(Number(v)))}</span>;
      case "int":
        return <span className="num">{formatNumber(Number(v))}</span>;
      case "num":
        return <span className="num">{formatNumber(Number(v), Math.abs(Number(v)) < 10 ? 2 : 1)}</span>;
      case "pct":
        return <span className="num">{Number(v).toFixed(1)}%</span>;
      case "date":
        return <span className="num">{formatDate(v as Date)}</span>;
      case "badge":
        return <Badge>{cellText(T, c, r)}</Badge>;
      default:
        return cellText(T, c, r);
    }
  };

  return (
    <>
      <PageHeader
        title={t(`reports.r_${def.key}`)}
        subtitle={t(`reports.r_${def.key}_hint`)}
        back={{ href: "/reports", label: t("reports.title") }}
        actions={
          <a href={`/api/reports/${def.key}${qs ? `?${qs}` : ""}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-fg hover:bg-primary-hover">
            <Download className="size-4" aria-hidden />
            Excel
          </a>
        }
      />
      {def.filters.length > 0 && (
        <Card className="mb-4">
          <form className="flex flex-wrap items-center gap-2 p-3">
            {def.filters.includes("period") && <PeriodFields period={period} />}
            {def.filters.includes("month") && <Input type="month" name="month" defaultValue={month} className="w-44" />}
            {def.filters.includes("project") && (
              <Select name="project" defaultValue={projectId ?? ""} className="w-64">
                <option value="">{t("tasks.allProjects")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
            <Button type="submit" variant="secondary">
              {t("common.filter")}
            </Button>
          </form>
        </Card>
      )}
      {data.note && (
        <div className="mb-4">
          <Notice>{t(data.note)}</Notice>
        </div>
      )}
      <Card>
        {data.rows.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th key={c.key} className={cn("whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted", c.type && !["text", "badge", "date"].includes(c.type) && "text-right")}>
                      {t(c.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className={cn("hover:bg-surface-2/60", r._tone === "danger" && "bg-danger-soft/40", r._tone === "warning" && "bg-warning-soft/30")}>
                    {data.columns.map((c, j) => (
                      <td key={c.key} className={cn("border-b border-border px-3 py-2 align-top", c.type && !["text", "badge", "date"].includes(c.type) && "text-right")}>
                        {j <= 1 && r._href ? (
                          <Link href={r._href} className="hover:text-primary">
                            {cell(c, r)}
                          </Link>
                        ) : (
                          cell(c, r)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {data.totals && (
                  <tr className="font-semibold">
                    {data.columns.map((c, j) => (
                      <td key={c.key} className={cn("border-t-2 border-border px-3 py-2", c.type && !["text", "badge", "date"].includes(c.type) && "text-right")}>
                        {j === 0 ? t("common.total") : data.totals![c.key] !== undefined && data.totals![c.key] !== "" ? cell(c, data.totals!) : ""}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-muted">{t("reports.rowsCount", { n: String(data.rows.length) })}</p>
    </>
  );
}
