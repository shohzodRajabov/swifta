import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Prisma, StatusGroupCode } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { computeMetrics, sumAmounts, zero, type Amount } from "@/lib/metrics";
import { resolvePeriod } from "@/lib/period";
import { STATUS_GROUP_ORDER } from "@/lib/statuses";
import { formatDate, toDateOnly } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { Badge, Button, Card, CardHeader, PageHeader, Select } from "@/components/ui";
import { Money, type MoneyValue } from "@/components/money";
import { MonthlyChart, PlanActualChart, StageChart } from "@/components/charts";
import { StatusBadge } from "@/components/project-bits";
import { PeriodFields } from "@/components/period-filter";
import { supplierBalances } from "@/lib/suppliers";
import { averageCost, stockLevels } from "@/lib/stock";
import { projectWhere } from "@/server/projects/access";
import { getStatusCatalog } from "@/server/projects/status";
import { computePnl } from "@/server/finance/pnl";
import { contractorBalances } from "@/server/contractors/balances";
import { missingDocsByProject } from "@/server/projects/missing-docs";
import { attentionCounts } from "@/server/attention";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  if (!can(user, "dashboard.view")) redirect(can(user, "worker.self") ? "/me" : "/projects");
  const sp = (await searchParams) as {
    client?: string;
    manager?: string;
    foreman?: string;
    group?: string;
    status?: string;
    period?: string;
    from?: string;
    to?: string;
  };
  const t = await getTranslations();
  const finance = can(user, "finance.view");
  const today = toDateOnly(new Date());
  const period = resolvePeriod(sp, "year");

  const and: Prisma.ProjectWhereInput[] = [projectWhere(user)];
  if (sp.client) and.push({ OR: [{ clientId: sp.client }, { ownerId: sp.client }] });
  if (sp.manager) and.push({ managerId: sp.manager });
  if (sp.foreman) and.push({ foremanId: sp.foreman });
  if (sp.group && STATUS_GROUP_ORDER.includes(sp.group as StatusGroupCode))
    and.push({ statusDef: { group: { code: sp.group as StatusGroupCode } } });
  if (sp.status && sp.status !== "ALL") and.push({ status: sp.status as Prisma.EnumProjectStatusFilter["equals"] });
  if (!sp.status) and.push({ status: { in: ["ACTIVE", "ON_HOLD"] } });

  const [projects, clients, people, catalog] = await Promise.all([
    db.project.findMany({
      where: { AND: and },
      include: { client: { select: { name: true } }, statusDef: { include: { group: true } } },
    }),
    db.client.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getStatusCatalog(user.companyId),
  ]);
  const ids = projects.map((p) => p.id);
  const [metrics, missingDocs, attention] = await Promise.all([
    computeMetrics(projects),
    missingDocsByProject(user.companyId, ids),
    attentionCounts(user, ids),
  ]);
  const ms = projects.map((p) => metrics.get(p.id)!);

  const groupCount = (codes: StatusGroupCode[]) => projects.filter((p) => p.statusDef && codes.includes(p.statusDef.group.code)).length;
  const objectKpis: [string, number, string | undefined, boolean?][] = [
    [t("dashboard.totalObjects"), projects.length, undefined],
    [t("dashboard.activeObjects"), projects.filter((p) => p.status === "ACTIVE" && !metrics.get(p.id)!.finished).length, undefined],
    [t("dashboard.newObjects"), groupCount(["NEW", "OFFER"]), "NEW"],
    [t("dashboard.contracted"), groupCount(["CONTRACT"]), "CONTRACT"],
    [t("dashboard.inWork"), groupCount(["WORK"]), "WORK"],
    [t("dashboard.testing"), groupCount(["TESTING", "LAUNCHED"]), "TESTING"],
    [t("dashboard.completed"), groupCount(["DONE"]), "DONE"],
    [t("dashboard.service"), groupCount(["SERVICE"]), "SERVICE"],
    [t("dashboard.delayed"), ms.filter((m) => m.delayed).length, undefined, true],
  ];

  const total = (pick: (m: (typeof ms)[number]) => Amount) => sumAmounts(ms.map(pick));

  // Period figures from the P&L engine; payables are company-wide.
  let pnl: Awaited<ReturnType<typeof computePnl>> | null = null;
  let supplierDebt = zero();
  let contractorDebt = zero();
  let received = zero();
  if (finance) {
    const [p, sb, cb, pays] = await Promise.all([
      computePnl(user.companyId, period.from, period.to),
      supplierBalances(user.companyId),
      contractorBalances(user.companyId),
      db.clientPayment.aggregate({
        where: { projectId: { in: ids }, date: { ...(period.from ? { gte: period.from } : {}), ...(period.to ? { lte: period.to } : {}) } },
        _sum: { amountUzs: true, amountUsd: true },
        _count: true,
      }),
    ]);
    pnl = p;
    supplierDebt = [...sb.values()].reduce((a, b) => ({ uzs: a.uzs + Math.max(0, b.debt.uzs), usd: a.usd + Math.max(0, b.debt.usd), count: a.count + 1 }), zero());
    contractorDebt = [...cb.values()].reduce((a, b) => ({ uzs: a.uzs + Math.max(0, b.payable.uzs), usd: a.usd + Math.max(0, b.payable.usd), count: a.count + 1 }), zero());
    received = { uzs: Number(pays._sum.amountUzs ?? 0), usd: Number(pays._sum.amountUsd ?? 0), count: pays._count };
  }

  // Warehouse overview
  let warehouse: { value: MoneyValue; low: number; incoming: MoneyValue } | null = null;
  if (finance && can(user, "warehouse.view")) {
    const [levels, products, openLines] = await Promise.all([
      stockLevels(user.companyId),
      db.product.findMany({ where: { companyId: user.companyId, active: true }, select: { id: true, minStock: true } }),
      db.purchaseOrderLine.findMany({
        where: { order: { companyId: user.companyId, status: { in: ["ORDERED", "PARTIAL"] } } },
        select: { qty: true, amountUzs: true, amountUsd: true, movements: { where: { type: "RECEIPT" }, select: { qty: true } } },
      }),
    ]);
    const avg = await averageCost(user.companyId, products.map((p) => p.id));
    const value = levels.reduce(
      (a, l) => ({ uzs: a.uzs + l.qty * (avg.get(l.productId)?.uzs ?? 0), usd: a.usd + l.qty * (avg.get(l.productId)?.usd ?? 0), count: a.count + 1 }),
      zero(),
    );
    const low = products.filter(
      (p) => Number(p.minStock) > 0 && levels.filter((l) => l.productId === p.id).reduce((s, l) => s + l.qty, 0) < Number(p.minStock),
    ).length;
    const incoming = openLines.reduce((a, l) => {
      const ratio = Math.max(0, 1 - l.movements.reduce((s, m) => s + Number(m.qty), 0) / Number(l.qty));
      return { uzs: a.uzs + Number(l.amountUzs) * ratio, usd: a.usd + Number(l.amountUsd) * ratio, count: a.count + 1 };
    }, zero());
    warehouse = { value, low, incoming };
  }

  const stageData = catalog.map((g) => ({
    name: `${g.letter}. ${g.name}`,
    count: projects.filter((p) => p.statusDef?.groupId === g.id).length,
  }));
  const planActual = projects
    .map((p) => ({ p, m: metrics.get(p.id)! }))
    .filter(({ m }) => m.cost.plan.uzs > 0 || m.cost.actual.uzs > 0)
    .sort((a, b) => b.m.contractTotalGross.uzs - a.m.contractTotalGross.uzs)
    .slice(0, 10)
    .map(({ p, m }) => ({
      name: p.name.length > 22 ? p.name.slice(0, 21) + "…" : p.name,
      plan: m.cost.plan.uzs,
      actual: m.cost.actual.uzs,
      forecast: m.cost.forecast.uzs,
    }));

  const attentionList = projects
    .map((p) => {
      const m = metrics.get(p.id)!;
      const reasons: string[] = [];
      if (m.delayed) reasons.push(t("dashboard.reasonDelayed"));
      if (finance && m.overBudget) reasons.push(t("dashboard.reasonOverBudget"));
      if (finance && m.marginDrop) reasons.push(t("dashboard.reasonMarginDrop"));
      if (finance && m.overdueDebt.uzs > 0) reasons.push(t("dashboard.reasonOverdueDebt"));
      if (missingDocs.has(p.id)) reasons.push(t("dashboard.reasonMissingDocs"));
      return { p, m, reasons };
    })
    .filter((r) => r.reasons.length > 0);

  const upcoming = finance
    ? await db.paymentMilestone.findMany({
        where: { projectId: { in: ids }, dueDate: { gte: today, lte: new Date(today.getTime() + 14 * 86400000) } },
        orderBy: { dueDate: "asc" },
        include: { project: { select: { id: true, name: true } } },
      })
    : [];

  const kpi = (label: string, value: MoneyValue, extra?: React.ReactNode, hint?: string) => (
    <Card className="p-4">
      <div className="mb-1 text-xs text-muted" title={hint}>
        {label}
        {hint && " ⓘ"}
      </div>
      <Money value={value} size="lg" compact align="left" tone="auto" />
      {extra && <div className="mt-1 text-xs text-muted">{extra}</div>}
    </Card>
  );
  const contractTotal = total((m) => m.contractTotalGross);
  const revenuePlan = total((m) => m.revenue.plan);
  const forecastProfit = total((m) => m.profit.forecast);
  const planProfit = total((m) => m.profit.plan);

  return (
    <>
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-2 p-3">
          <Select name="client" defaultValue={sp.client ?? ""} className="w-48" aria-label={t("dashboard.client")}>
            <option value="">
              {t("dashboard.client")}: {t("common.all")}
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select name="manager" defaultValue={sp.manager ?? ""} className="w-44" aria-label={t("dashboard.manager")}>
            <option value="">
              {t("dashboard.manager")}: {t("common.all")}
            </option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Select name="foreman" defaultValue={sp.foreman ?? ""} className="w-40" aria-label={t("projects.foreman")}>
            <option value="">
              {t("projects.foreman")}: {t("common.all")}
            </option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Select name="group" defaultValue={sp.group ?? ""} className="w-48" aria-label={t("projects.statusGroup")}>
            <option value="">
              {t("projects.statusGroup")}: {t("common.all")}
            </option>
            {catalog.map((g) => (
              <option key={g.id} value={g.code}>
                {g.letter}. {g.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label={t("projects.lifecycle")}>
            <option value="">
              {t("projectStatus.ACTIVE")} + {t("projectStatus.ON_HOLD")}
            </option>
            <option value="ALL">{t("common.all")}</option>
            {(["ACTIVE", "ON_HOLD", "CLOSED", "CANCELLED"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`projectStatus.${s}`)}
              </option>
            ))}
          </Select>
          {finance && <PeriodFields period={period} />}
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
          <Link href="/" className="px-2 py-2 text-sm text-muted hover:text-text">
            {t("common.reset")}
          </Link>
        </form>
      </Card>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("dashboard.objects")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-9">
          {objectKpis.map(([label, value, group, danger]) => {
            const body = (
              <Card className="h-full p-4 transition-colors hover:border-primary/40">
                <div className="text-xs text-muted">{label}</div>
                <div className={`num mt-1 text-2xl font-semibold ${danger && value > 0 ? "text-danger" : ""}`}>{value}</div>
              </Card>
            );
            return group ? (
              <Link key={label} href={`/projects?group=${group}`}>
                {body}
              </Link>
            ) : (
              <div key={label}>{body}</div>
            );
          })}
        </div>
      </section>

      {attention.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">{t("dashboard.attentionCenter")}</h2>
          <div className="flex flex-wrap gap-2">
            {attention.map((a) => (
              <Link key={a.key} href={a.href}>
                <Badge tone={a.tone} className="gap-1.5 px-3 py-1.5 text-sm">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  <span className="num font-semibold">{a.count}</span> {t(`attention.${a.key}`)}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {finance && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">{t("dashboard.portfolio")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpi(t("finance.contractTotal"), contractTotal)}
            {kpi(t("dashboard.forecastCost"), total((m) => m.cost.forecast), `${t("common.plan")}: ${formatPercent(revenuePlan.uzs ? (total((m) => m.cost.plan).uzs / revenuePlan.uzs) * 100 : null)} ${t("dashboard.ofRevenue")}`)}
            {kpi(t("dashboard.actualCost"), total((m) => m.cost.actual))}
            {kpi(
              t("finance.forecastProfit"),
              forecastProfit,
              `${t("dashboard.margin")}: ${formatPercent(revenuePlan.uzs ? (forecastProfit.uzs / revenuePlan.uzs) * 100 : null)} · ${t("common.plan")}: ${formatPercent(revenuePlan.uzs ? (planProfit.uzs / revenuePlan.uzs) * 100 : null)}`,
              t("dashboard.forecastHint"),
            )}
            {kpi(t("finance.receivable"), total((m) => m.receivable), (
              <>
                {t("finance.overdue")}: <Money value={total((m) => m.overdueDebt)} size="sm" compact align="left" />
              </>
            ))}
            {kpi(t("dashboard.supplierDebt"), supplierDebt)}
            {kpi(t("dashboard.contractorDebt"), contractorDebt)}
            {kpi(t("finance.actsSigned"), total((m) => m.actsGross))}
          </div>
        </section>
      )}

      {finance && pnl && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">
            {t("dashboard.periodTitle")} · {t(`period.${period.key}`)}
            {period.from && ` (${formatDate(period.from)} — ${formatDate(period.to)})`}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {kpi(t("pnl.revenue"), pnl.total.revenue)}
            {kpi(t("dashboard.received"), received)}
            {kpi(t("pnl.direct"), pnl.total.direct)}
            {kpi(t("pnl.overhead"), pnl.total.overhead)}
            {kpi(
              t("pnl.net"),
              pnl.total.net,
              <>
                {t("pnl.profitTax")}: <Money value={pnl.total.profitTax} size="sm" compact align="left" />
              </>,
              t("dashboard.netHint"),
            )}
          </div>
        </section>
      )}

      {warehouse && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">{t("dashboard.warehouseTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {kpi(t("warehouse.totalValue"), warehouse.value)}
            <Card className="p-4">
              <div className="mb-1 text-xs text-muted">{t("warehouse.lowCount")}</div>
              <Link href="/warehouse?low=1" className={`num text-2xl font-semibold ${warehouse.low > 0 ? "text-danger" : ""}`}>
                {warehouse.low}
              </Link>
            </Card>
            {kpi(t("warehouse.incoming"), warehouse.incoming)}
          </div>
        </section>
      )}

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {finance && pnl ? (
          <Card>
            <CardHeader title={t("dashboard.chartMonthly")} />
            <div className="p-4">
              <MonthlyChart
                data={pnl.months.map((m) => ({
                  month: `${m.month.slice(5, 7)}.${m.month.slice(2, 4)}`,
                  revenue: m.revenue,
                  expense: m.direct + m.overhead,
                  profit: m.net,
                }))}
                labels={{ revenue: t("dashboard.revenue"), expense: t("dashboard.expense"), profit: t("dashboard.profit") }}
              />
            </div>
          </Card>
        ) : (
          <div />
        )}
        <Card>
          <CardHeader title={t("dashboard.chartStages")} />
          <div className="p-4">
            <StageChart data={stageData} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("dashboard.attention")} />
          {attentionList.length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-8 text-sm text-success">
              <CheckCircle2 className="size-5" aria-hidden />
              {t("dashboard.allGood")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {attentionList.map(({ p, m, reasons }) => (
                <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">
                      {p.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={p.statusDef} compact />
                      {reasons.map((r) => (
                        <Badge key={r} tone="danger">
                          <AlertTriangle className="size-3" aria-hidden />
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {finance && (
                    <div className="text-right text-xs">
                      <div className="text-muted">{t("dashboard.margin")}</div>
                      <div className="num">
                        {formatPercent(m.margin.plan)} →{" "}
                        <span className={m.marginDrop ? "text-danger" : ""}>{formatPercent(m.margin.forecast)}</span>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {finance && (
          <Card>
            <CardHeader title={t("dashboard.chartPlanActual")} />
            <div className="p-4">
              {planActual.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">{t("common.noData")}</div>
              ) : (
                <PlanActualChart
                  data={planActual}
                  labels={{ plan: t("common.plan"), actual: t("common.actual"), forecast: t("common.forecast") }}
                />
              )}
            </div>
            {upcoming.length > 0 && (
              <div className="border-t border-border">
                <div className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("dashboard.upcoming")}</div>
                <ul className="divide-y divide-border">
                  {upcoming.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <div>
                        <Link href={`/projects/${u.project.id}?tab=revenue`} className="hover:text-primary">
                          {u.project.name}
                        </Link>
                        <div className="text-xs text-muted">
                          {u.name} · {formatDate(u.dueDate)}
                        </div>
                      </div>
                      <Money value={{ uzs: Number(u.amountUzs), usd: Number(u.amountUsd), count: 1 }} size="sm" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
