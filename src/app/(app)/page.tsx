import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { computeMetrics, sumAmounts } from "@/lib/metrics";
import { STAGE_GROUP, type StageGroup } from "@/lib/stages";
import { formatDate, isoDate, toDateOnly } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Input, PageHeader, Select } from "@/components/ui";
import { Money, type MoneyValue } from "@/components/money";
import { MonthlyChart, PlanActualChart, StageChart } from "@/components/charts";
import { StageBadge } from "@/components/project-bits";
import { supplierBalances } from "@/lib/suppliers";
import { averageCost, stockLevels } from "@/lib/stock";

const GROUPS: StageGroup[] = ["PRESALE", "DESIGN", "PROCUREMENT", "INSTALLATION", "CLOSING", "COMPLETED"];

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  if (!can(user.role, "dashboard.view")) redirect("/projects");
  const sp = (await searchParams) as { client?: string; manager?: string; status?: string; from?: string; to?: string };
  const t = await getTranslations();
  const finance = can(user.role, "finance.view");
  const today = toDateOnly(new Date());

  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  const from = sp.from ? new Date(sp.from) : defaultFrom;
  const to = sp.to ? new Date(sp.to) : today;

  const where: Prisma.ProjectWhereInput = { companyId: user.companyId };
  if (sp.client) where.clientId = sp.client;
  if (sp.manager) where.managerId = sp.manager;
  if (sp.status && sp.status !== "ALL") where.status = sp.status as Prisma.EnumProjectStatusFilter["equals"];
  if (!sp.status) where.status = { in: ["ACTIVE", "ON_HOLD"] };

  const [projects, clients, managers] = await Promise.all([
    db.project.findMany({ where, include: { client: { select: { name: true } } } }),
    db.client.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { companyId: user.companyId, role: { in: ["PROJECT_MANAGER", "ADMIN"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const metrics = await computeMetrics(projects);
  const ms = projects.map((p) => metrics.get(p.id)!);
  const ids = projects.map((p) => p.id);

  const groupCount = (g: StageGroup) => projects.filter((p) => STAGE_GROUP[p.stage] === g).length;
  const objectKpis: [string, number, "danger" | undefined][] = [
    [t("dashboard.totalObjects"), projects.length, undefined],
    [t("dashboard.activeObjects"), projects.filter((p) => p.status === "ACTIVE" && p.stage !== "COMPLETED").length, undefined],
    [t("dashboard.inDesign"), groupCount("DESIGN"), undefined],
    [t("dashboard.inProcurement"), groupCount("PROCUREMENT"), undefined],
    [t("dashboard.inInstallation"), groupCount("INSTALLATION"), undefined],
    [t("dashboard.completed"), groupCount("COMPLETED"), undefined],
    [t("dashboard.delayed"), ms.filter((m) => m.delayed).length, "danger"],
  ];

  const total = (k: "contract" | "plannedCost" | "actualCost" | "plannedProfit" | "expectedProfit" | "cashProfit" | "received" | "clientDebt" | "overdueDebt") =>
    sumAmounts(ms.map((m) => m[k]));
  const contract = total("contract");
  const expected = total("expectedProfit");
  const planned = total("plannedProfit");

  const zeroAmount = { uzs: 0, usd: 0, count: 0 };
  let supplierDebt = zeroAmount;
  if (finance) {
    const balances = await supplierBalances(user.companyId);
    supplierDebt = [...balances.values()].reduce(
      (a, b) => ({ uzs: a.uzs + Math.max(0, b.debt.uzs), usd: a.usd + Math.max(0, b.debt.usd), count: a.count + b.debt.count }),
      zeroAmount,
    );
  }

  // Warehouse overview (company-wide)
  let warehouse: { value: MoneyValue; low: number; incoming: MoneyValue; onSite: MoneyValue } | null = null;
  if (finance && can(user.role, "warehouse.view")) {
    const [levels, products, openLines, siteMoves] = await Promise.all([
      stockLevels(user.companyId),
      db.product.findMany({ where: { companyId: user.companyId, active: true }, select: { id: true, minStock: true } }),
      db.purchaseOrderLine.findMany({
        where: { order: { companyId: user.companyId, status: { in: ["ORDERED", "PARTIAL"] } } },
        select: { qty: true, amountUzs: true, amountUsd: true, movements: { where: { type: "RECEIPT" }, select: { qty: true } } },
      }),
      db.stockMovement.findMany({
        where: { companyId: user.companyId, type: { in: ["ISSUE", "RETURN", "CONSUMPTION"] }, project: { status: "ACTIVE" } },
        select: { type: true, qty: true, unitCostUzs: true, unitCostUsd: true, productId: true },
      }),
    ]);
    const avg = await averageCost(user.companyId, products.map((p) => p.id));
    const value = levels.reduce(
      (a, l) => ({ uzs: a.uzs + l.qty * (avg.get(l.productId)?.uzs ?? 0), usd: a.usd + l.qty * (avg.get(l.productId)?.usd ?? 0), count: a.count + 1 }),
      zeroAmount,
    );
    const low = products.filter(
      (p) => Number(p.minStock) > 0 && levels.filter((l) => l.productId === p.id).reduce((s, l) => s + l.qty, 0) < Number(p.minStock),
    ).length;
    const incoming = openLines.reduce((a, l) => {
      const ratio = Math.max(0, 1 - l.movements.reduce((s, m) => s + Number(m.qty), 0) / Number(l.qty));
      return { uzs: a.uzs + Number(l.amountUzs) * ratio, usd: a.usd + Number(l.amountUsd) * ratio, count: a.count + 1 };
    }, zeroAmount);
    const onSite = siteMoves.reduce((a, m) => {
      const sign = m.type === "ISSUE" ? 1 : -1;
      const cost = m.type === "CONSUMPTION" ? avg.get(m.productId ?? "") ?? { uzs: 0, usd: 0 } : { uzs: Number(m.unitCostUzs), usd: Number(m.unitCostUsd) };
      const q = Number(m.qty) * sign;
      return { uzs: a.uzs + q * cost.uzs, usd: a.usd + q * cost.usd, count: a.count + 1 };
    }, zeroAmount);
    warehouse = { value, low, incoming, onSite };
  }

  // Monthly cash flow for the selected period
  let monthly: { month: string; revenue: number; expense: number; profit: number }[] = [];
  if (finance) {
    const [payments, expenses] = await Promise.all([
      db.clientPayment.findMany({
        where: { projectId: { in: ids }, date: { gte: from, lte: to } },
        select: { date: true, amountUzs: true },
      }),
      db.expense.findMany({
        where: { projectId: { in: ids }, date: { gte: from, lte: to } },
        select: { date: true, amountUzs: true },
      }),
    ]);
    const buckets = new Map<string, { revenue: number; expense: number }>();
    for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d.setUTCMonth(d.getUTCMonth() + 1)) {
      buckets.set(d.toISOString().slice(0, 7), { revenue: 0, expense: 0 });
    }
    for (const p of payments) {
      const b = buckets.get(p.date.toISOString().slice(0, 7));
      if (b) b.revenue += Number(p.amountUzs);
    }
    for (const e of expenses) {
      const b = buckets.get(e.date.toISOString().slice(0, 7));
      if (b) b.expense += Number(e.amountUzs);
    }
    monthly = [...buckets.entries()].map(([k, v]) => ({
      month: `${k.slice(5, 7)}.${k.slice(2, 4)}`,
      ...v,
      profit: v.revenue - v.expense,
    }));
  }

  const stageData = GROUPS.map((g) => ({ name: t(`stageGroups.${g}`), count: groupCount(g) }));
  const planActual = projects
    .map((p) => ({ p, m: metrics.get(p.id)! }))
    .filter(({ m }) => m.plannedCost.uzs > 0 || m.actualCost.uzs > 0)
    .sort((a, b) => b.m.contract.uzs - a.m.contract.uzs)
    .slice(0, 10)
    .map(({ p, m }) => ({ name: p.name.length > 22 ? p.name.slice(0, 21) + "…" : p.name, plan: m.plannedCost.uzs, actual: m.actualCost.uzs }));

  const attention = projects
    .map((p) => {
      const m = metrics.get(p.id)!;
      const reasons: string[] = [];
      if (m.delayed) reasons.push(t("dashboard.reasonDelayed"));
      if (finance && m.overBudget) reasons.push(t("dashboard.reasonOverBudget"));
      if (finance && m.marginDrop) reasons.push(t("dashboard.reasonMarginDrop"));
      if (finance && m.overdueDebt.uzs > 0) reasons.push(t("dashboard.reasonOverdueDebt"));
      return { p, m, reasons };
    })
    .filter((r) => r.reasons.length > 0);

  const upcoming = finance
    ? await db.paymentMilestone.findMany({
        where: {
          projectId: { in: ids },
          dueDate: { gte: today, lte: new Date(today.getTime() + 14 * 86400000) },
        },
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
          <Select name="manager" defaultValue={sp.manager ?? ""} className="w-48" aria-label={t("dashboard.manager")}>
            <option value="">
              {t("dashboard.manager")}: {t("common.all")}
            </option>
            {managers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={sp.status ?? ""} className="w-44" aria-label={t("common.status")}>
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
          {finance && (
            <>
              <Input type="date" name="from" defaultValue={isoDate(from)} className="w-40" aria-label={t("common.from")} />
              <Input type="date" name="to" defaultValue={isoDate(to)} className="w-40" aria-label={t("common.to")} />
            </>
          )}
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {objectKpis.map(([label, value, tone]) => (
            <Card key={label} className="p-4">
              <div className="text-xs text-muted">{label}</div>
              <div className={`num mt-1 text-2xl font-semibold ${tone === "danger" && value > 0 ? "text-danger" : ""}`}>{value}</div>
            </Card>
          ))}
        </div>
      </section>

      {finance && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">{t("dashboard.financeTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpi(t("dashboard.contractTotal"), contract)}
            {kpi(t("dashboard.plannedCost"), total("plannedCost"))}
            {kpi(t("dashboard.actualCost"), total("actualCost"))}
            {kpi(
              t("dashboard.plannedProfit"),
              planned,
              `${t("dashboard.plannedMargin")}: ${formatPercent(contract.uzs ? (planned.uzs / contract.uzs) * 100 : null)}`,
            )}
            {kpi(
              t("dashboard.expectedProfit"),
              expected,
              `${t("dashboard.margin")}: ${formatPercent(contract.uzs ? (expected.uzs / contract.uzs) * 100 : null)}`,
              t("dashboard.expectedProfitHint"),
            )}
            {kpi(t("dashboard.cashProfit"), total("cashProfit"), undefined, t("dashboard.cashProfitHint"))}
            {kpi(t("dashboard.clientDebt"), total("clientDebt"), (
              <>
                {t("dashboard.overdueDebt")}: <Money value={total("overdueDebt")} size="sm" compact align="left" />
              </>
            ))}
            {kpi(t("dashboard.supplierDebt"), supplierDebt)}
          </div>
        </section>
      )}

      {warehouse && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted">{t("dashboard.warehouseTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpi(t("warehouse.totalValue"), warehouse.value)}
            <Card className="p-4">
              <div className="mb-1 text-xs text-muted">{t("warehouse.lowCount")}</div>
              <Link href="/warehouse?low=1" className={`num text-2xl font-semibold ${warehouse.low > 0 ? "text-danger" : ""}`}>
                {warehouse.low}
              </Link>
            </Card>
            {kpi(t("warehouse.incoming"), warehouse.incoming)}
            {kpi(t("warehouse.onSite"), warehouse.onSite)}
          </div>
        </section>
      )}

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {finance ? (
          <Card>
            <CardHeader title={t("dashboard.chartMonthly")} />
            <div className="p-4">
              <MonthlyChart
                data={monthly}
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
          {attention.length === 0 ? (
            <div className="flex items-center gap-2 px-5 py-8 text-sm text-success">
              <CheckCircle2 className="size-5" aria-hidden />
              {t("dashboard.allGood")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map(({ p, m, reasons }) => (
                <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">
                      {p.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StageBadge stage={p.stage} />
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
                        {formatPercent(m.plannedMargin)} →{" "}
                        <span className={m.marginDrop ? "text-danger" : ""}>{formatPercent(m.expectedMargin)}</span>
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
                <PlanActualChart data={planActual} labels={{ plan: t("common.plan"), actual: t("common.actual") }} />
              )}
            </div>
            {upcoming.length > 0 && (
              <div className="border-t border-border">
                <div className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">{t("dashboard.upcoming")}</div>
                <ul className="divide-y divide-border">
                  {upcoming.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <div>
                        <Link href={`/projects/${u.project.id}?tab=payments`} className="hover:text-primary">
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
