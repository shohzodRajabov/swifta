import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { KpiSubject } from "@prisma/client";
import { Settings2 } from "lucide-react";
import { requireAnyPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { cn, formatDateTime, isoDate, today } from "@/lib/utils";
import { Badge, Button, Card, Empty, Input, LinkButton, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CoverageNote, KpiBar, KpiScore } from "@/components/kpi-bits";
import { kpiTable } from "@/server/kpi/view";
import { bonusPct, coverage, MIN_COVERAGE, parseBonusScale } from "@/lib/kpi";
import { formatNumber } from "@/lib/format";
import { calculateKpi, setKpiPeriodStatus } from "./actions";

const SUBJECTS: KpiSubject[] = ["EMPLOYEE", "GROUP", "CONTRACTOR"];

function prevMonth() {
  const d = today();
  return isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))).slice(0, 7);
}

export default async function KpiPage({ searchParams }: PageProps<"/kpi">) {
  const user = await requireAnyPermission("kpi.view", "kpi.self");
  const sp = (await searchParams) as { month?: string; subject?: string };
  // Workers without the management view see only their own KPI.
  if (!can(user, "kpi.view")) {
    if (!user.employee) redirect("/me");
    redirect(`/kpi/EMPLOYEE/${user.employee.id}${sp.month ? `?month=${sp.month}` : ""}`);
  }
  const t = await getTranslations();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : prevMonth();
  const subject: KpiSubject = SUBJECTS.includes(sp.subject as KpiSubject) ? (sp.subject as KpiSubject) : "EMPLOYEE";
  const manage = can(user, "kpi.manage");
  const [table, periods] = await Promise.all([
    kpiTable(user.companyId, subject, month),
    db.kpiPeriod.findMany({ where: { companyId: user.companyId, month }, select: { subject: true, status: true } }),
  ]);
  const keys = table.rule?.components.map((c) => c.key) ?? [];
  // KPI bonus (employees): fixed amounts once the month is approved, otherwise an estimate.
  const company = await db.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { kpiBonusEnabled: true, kpiBonusScale: true } });
  const showBonus = subject === "EMPLOYEE" && company.kpiBonusEnabled && can(user, "salaries.view");
  const approved = table.period?.status === "APPROVED";
  const bonusOf = new Map<string, { pct: number; amount: number }>();
  if (showBonus && table.rows.length) {
    const scale = parseBonusScale(company.kpiBonusScale);
    const [emps, snaps] = await Promise.all([
      db.employee.findMany({ where: { companyId: user.companyId, id: { in: table.rows.map((r) => r.id) } }, select: { id: true, salary: true } }),
      approved ? db.kpiSnapshot.findMany({ where: { periodId: table.period!.id }, select: { employeeId: true, bonusPct: true, bonusUzs: true } }) : [],
    ]);
    for (const r of table.rows) {
      const fixed = snaps.find((x) => x.employeeId === r.id);
      const pct = approved ? Number(fixed?.bonusPct ?? 0) : bonusPct(r.score, coverage(r.components), scale);
      const salary = Number(emps.find((e) => e.id === r.id)?.salary ?? 0);
      bonusOf.set(r.id, { pct, amount: approved ? Number(fixed?.bonusUzs ?? 0) : (salary * pct) / 100 });
    }
  }
  const counted = table.rows.filter((r) => coverage(r.components) >= MIN_COVERAGE);
  const avg = counted.length ? counted.reduce((s, r) => s + (r.score ?? 0), 0) / counted.length : null;
  const href = (q: Record<string, string>) => `/kpi?${new URLSearchParams({ month, subject, ...q }).toString()}`;

  return (
    <>
      <PageHeader
        title={t("kpi.title")}
        subtitle={t("kpi.subtitle")}
        actions={
          <LinkButton href="/kpi/rules" variant="secondary">
            <Settings2 className="size-4" aria-hidden />
            {t("kpi.rules")}
          </LinkButton>
        }
      />
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {SUBJECTS.map((s) => {
          const p = periods.find((x) => x.subject === s);
          return (
            <Link
              key={s}
              href={href({ subject: s })}
              className={cn("-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm", subject === s ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-text")}
            >
              {t(`kpi.subject_${s}`)}
              {p && <span className={cn("size-1.5 rounded-full", p.status === "APPROVED" ? "bg-success" : "bg-warning")} />}
            </Link>
          );
        })}
      </nav>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <form className="flex items-center gap-2">
            <input type="hidden" name="subject" value={subject} />
            <Input type="month" name="month" defaultValue={month} className="w-44" />
            <Button type="submit" variant="secondary">
              {t("common.filter")}
            </Button>
          </form>
          <div className="text-sm">
            {table.period ? (
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={table.period.status === "APPROVED" ? "success" : "warning"}>{t(`kpi.status_${table.period.status}`)}</Badge>
                <span className="text-xs text-muted">
                  {t("kpi.calculatedAt", { at: formatDateTime(table.period.calculatedAt) })}
                  {table.rule && ` · ${table.rule.name} v${table.rule.version}`}
                </span>
              </span>
            ) : (
              <Badge>{t("kpi.live")}</Badge>
            )}
          </div>
          {manage && (
            <div className="ml-auto flex gap-2">
              {table.period?.status !== "APPROVED" && (
                <ActionForm action={calculateKpi}>
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="subject" value={subject} />
                  <SubmitButton variant={table.period ? "secondary" : "primary"}>{table.period ? t("kpi.recalculate") : t("kpi.calculate")}</SubmitButton>
                </ActionForm>
              )}
              {table.period && (
                <form action={setKpiPeriodStatus}>
                  <input type="hidden" name="id" value={table.period.id} />
                  <input type="hidden" name="to" value={table.period.status === "APPROVED" ? "CALCULATED" : "APPROVED"} />
                  <Button type="submit" variant={table.period.status === "APPROVED" ? "ghost" : "primary"}>
                    {table.period.status === "APPROVED" ? t("kpi.reopen") : t("kpi.approve")}
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
        {table.live && (
          <div className="border-t border-border px-3 py-2">
            <Notice>{t("kpi.liveHint")}</Notice>
          </div>
        )}
      </Card>

      <Card>
        {table.rows.length === 0 ? (
          <Empty>{t("kpi.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t(`kpi.subject_${subject}`)}</Th>
                <Th className="text-right">KPI</Th>
                {showBonus && (
                  <Th className="text-right" title={approved ? t("kpi.bonusFixed") : t("kpi.bonusEstimate")}>
                    {t("kpi.bonus")}
                  </Th>
                )}
                {keys.map((k) => (
                  <Th key={k} title={t(`kpiComponent.${k}_hint`)}>
                    {t(`kpiComponent.${k}`)}
                    <span className="ml-1 font-normal normal-case text-muted/70">{table.rule!.components.find((c) => c.key === k)!.weight}%</span>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/kpi/${subject}/${r.id}?month=${month}`} className="font-medium hover:text-primary">
                      {r.name}
                    </Link>
                  </Td>
                  <Td className="text-right">
                    <Link href={`/kpi/${subject}/${r.id}?month=${month}`}>
                      <KpiScore value={r.score} />
                    </Link>
                    <CoverageNote components={r.components} />
                  </Td>
                  {showBonus && (
                    <Td className="num text-right text-sm">
                      {bonusOf.get(r.id)?.pct ? (
                        <>
                          {approved ? "" : "≈ "}
                          {formatNumber(Math.round(bonusOf.get(r.id)!.amount))}
                          <div className="text-[11px] text-muted">{bonusOf.get(r.id)!.pct}%</div>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                  )}
                  {keys.map((k) => (
                    <Td key={k}>
                      <KpiBar value={r.components.find((c) => c.key === k)?.value ?? null} />
                    </Td>
                  ))}
                </tr>
              ))}
              {avg !== null && (
                <tr>
                  <Td className="text-muted">{t("kpi.average")}</Td>
                  <Td className="text-right">
                    <KpiScore value={avg} />
                  </Td>
                  <Td colSpan={keys.length + (showBonus ? 1 : 0)} />
                </tr>
              )}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
