import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { KpiSubject } from "@prisma/client";
import { requireAnyPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { isoDate, today } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Input, Notice, PageHeader } from "@/components/ui";
import { CoverageNote, KpiScore, scoreTone } from "@/components/kpi-bits";
import { cn } from "@/lib/utils";
import { kpiHistory, kpiTable } from "@/server/kpi/view";

const SUBJECTS: KpiSubject[] = ["EMPLOYEE", "GROUP", "CONTRACTOR"];

export default async function KpiDetailPage({ params, searchParams }: PageProps<"/kpi/[subject]/[id]">) {
  const { subject: raw, id } = await params;
  const sp = (await searchParams) as { month?: string };
  const user = await requireAnyPermission("kpi.view", "kpi.self");
  const subject = raw as KpiSubject;
  if (!SUBJECTS.includes(subject)) notFound();
  const own = subject === "EMPLOYEE" && user.employee?.id === id;
  if (!can(user, "kpi.view") && !own) redirect("/forbidden");
  const t = await getTranslations();
  const d = today();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))).slice(0, 7);

  const name =
    subject === "EMPLOYEE"
      ? (await db.employee.findFirst({ where: { id, companyId: user.companyId }, select: { fullName: true } }))?.fullName
      : subject === "GROUP"
        ? (await db.workGroup.findFirst({ where: { id, companyId: user.companyId }, select: { name: true } }))?.name
        : (await db.contractor.findFirst({ where: { id, companyId: user.companyId }, select: { name: true } }))?.name;
  if (!name) notFound();
  const [table, history] = await Promise.all([kpiTable(user.companyId, subject, month), kpiHistory(user.companyId, subject, id)]);
  const row = table.rows.find((r) => r.id === id);
  const profile = subject === "EMPLOYEE" ? `/employees/${id}` : subject === "GROUP" ? `/employees/groups/${id}` : `/contractors/${id}`;

  return (
    <>
      <PageHeader
        title={name}
        back={can(user, "kpi.view") ? { href: `/kpi?subject=${subject}&month=${month}`, label: t("kpi.title") } : undefined}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {t(`kpi.subject_${subject}`)} · {month}
            {table.period ? <Badge tone={table.period.status === "APPROVED" ? "success" : "warning"}>{t(`kpi.status_${table.period.status}`)}</Badge> : <Badge>{t("kpi.live")}</Badge>}
            {can(user, "kpi.view") && (
              <Link href={profile} className="text-primary">
                {t("kpi.profile")} →
              </Link>
            )}
          </span>
        }
        actions={
          <form className="flex gap-2">
            <Input type="month" name="month" defaultValue={month} className="w-44" />
            <Button type="submit" variant="secondary">
              {t("common.filter")}
            </Button>
          </form>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-muted">KPI · {month}</div>
          <div className="mt-1 text-4xl">
            <KpiScore value={row?.score ?? null} />
            {row && <CoverageNote components={row.components} />}
          </div>
          {row ? (
            <p className="mt-2 text-xs text-muted">{t("kpi.formulaExplained", { rule: `${table.rule?.name} v${table.rule?.version}` })}</p>
          ) : (
            <p className="mt-2 text-sm text-muted">{t("kpi.noData")}</p>
          )}
          {row && (
            <div className="mt-4 space-y-1.5 text-sm">
              {row.components.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2">
                  <span className="text-muted">
                    {t(`kpiComponent.${c.key}`)} <span className="text-xs">({c.weight}%)</span>
                  </span>
                  <span className="num">
                    <span className={scoreTone(c.value)}>{c.value === null ? "—" : `${Math.round(c.value)}%`}</span>
                    <span className="ml-2 text-xs text-muted">{c.weighted === null ? t("kpi.noDataShort") : `+${c.weighted.toFixed(1)}`}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5 lg:col-span-2">
          <div className="text-xs uppercase tracking-wide text-muted">{t("kpi.history")}</div>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("kpi.noHistory")}</p>
          ) : (
            <div className="mt-4 flex h-40 items-end gap-3">
              {[...history].reverse().map((h) => (
                <Link key={h.month} href={`?month=${h.month}`} className="flex flex-1 flex-col items-center gap-1">
                  <span className={cn("num text-xs font-medium", scoreTone(h.score))}>{Math.round(h.score)}</span>
                  <span className={cn("w-full rounded-t", h.month === month ? "bg-primary" : "bg-primary/40")} style={{ height: `${Math.max(4, h.score) * 1.1}px` }} />
                  <span className="num text-[11px] text-muted">{h.month.slice(2)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {table.live && (
        <div className="mt-4">
          <Notice>{t("kpi.liveHint")}</Notice>
        </div>
      )}

      {row && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {row.components.map((c) => (
            <Card key={c.key}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {t(`kpiComponent.${c.key}`)} <span className={cn("num", scoreTone(c.value))}>{c.value === null ? "—" : `${Math.round(c.value)}%`}</span>
                  </span>
                }
                subtitle={t(`kpiComponent.${c.key}_hint`)}
              />
              <div className="px-5 py-3 text-xs text-muted">
                {Object.entries(c.raw)
                  .filter(([, v]) => v !== null)
                  .map(([k, v]) => `${t(`kpiRaw.${k}`)}: ${v}`)
                  .join(" · ")}
              </div>
              {c.sources.length > 0 && (
                <ul className="max-h-72 divide-y divide-border overflow-y-auto border-t border-border text-sm">
                  {c.sources.map((s, i) => (
                    <li key={i} className="flex items-center gap-2 px-5 py-1.5">
                      <span className={cn("size-1.5 shrink-0 rounded-full", s.good === undefined ? "bg-muted" : s.good ? "bg-success" : "bg-danger")} />
                      {s.type === "remark" ? (
                        <Link href={`/remarks/${s.id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                          {s.label}
                        </Link>
                      ) : s.type === "attendance" ? (
                        <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      ) : (
                        <Link href={`/tasks/${s.id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                          {s.label}
                        </Link>
                      )}
                      {s.detail && <span className="num shrink-0 text-xs text-muted">{s.type === "attendance" && s.detail === "?" ? t("kpiRaw.unmarked") : s.detail}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
