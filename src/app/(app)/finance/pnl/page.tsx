import { getTranslations } from "next-intl/server";
import { requireAnyPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolvePeriod } from "@/lib/period";
import { formatPercent, formatUzs } from "@/lib/format";
import { Button, Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { FinanceTabs } from "@/components/finance-tabs";
import { PeriodFields } from "@/components/period-filter";
import { computePnl, type PnlRow } from "@/server/finance/pnl";
import { pendingApprovalsCount } from "@/server/finance/pending";
import { redirect } from "next/navigation";

export default async function PnlPage({ searchParams }: PageProps<"/finance/pnl">) {
  const user = await requireAnyPermission("finance.view");
  if (!can(user, "overhead.view")) redirect("/forbidden");
  const sp = (await searchParams) as { period?: string; from?: string; to?: string };
  const period = resolvePeriod(sp, "year");
  const t = await getTranslations();
  const [pnl, pending] = await Promise.all([
    computePnl(user.companyId, period.from, period.to),
    can(user, "finance.approve") ? pendingApprovalsCount(user.companyId) : Promise.resolve(0),
  ]);
  const lines: { key: keyof PnlRow; strong?: boolean; tone?: boolean }[] = [
    { key: "revenue" },
    { key: "direct" },
    { key: "gross", strong: true, tone: true },
    { key: "overhead" },
    { key: "operating", strong: true, tone: true },
    { key: "profitTax" },
    { key: "net", strong: true, tone: true },
  ];
  const margin = pnl.total.revenue.uzs > 0 ? (pnl.total.net.uzs / pnl.total.revenue.uzs) * 100 : null;

  return (
    <>
      <PageHeader title={t("finance.title")} />
      <FinanceTabs user={user} active="pnl" pending={pending} />
      <div className="flex flex-col gap-6">
        <Card>
          <form className="flex flex-wrap items-center gap-2 p-3">
            <PeriodFields period={period} />
            <Button type="submit" variant="secondary">
              {t("common.filter")}
            </Button>
            <div className="ml-auto text-sm text-muted">
              {t("finance.netMargin")}: <span className="num font-semibold text-text">{formatPercent(margin)}</span>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title={t("finance.pnlTitle")} subtitle={t("finance.pnlHint")} />
          <Table>
            <thead>
              <tr>
                <Th />
                {pnl.entities.map((e) => (
                  <Th key={e.id} className="text-right">
                    {e.name}
                    <div className="font-normal normal-case">{t(`taxRegime.${e.regime}`)}</div>
                  </Th>
                ))}
                <Th className="text-right">{t("common.total")}</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className={l.strong ? "font-semibold" : undefined}>
                  <Td>{t(`pnl.${l.key}`)}</Td>
                  {pnl.entities.map((e) => (
                    <Td key={e.id} className="text-right">
                      <Money size="sm" value={e.row[l.key]} tone={l.tone ? "auto" : undefined} />
                    </Td>
                  ))}
                  <Td className="text-right">
                    <Money size="sm" value={pnl.total[l.key]} tone={l.tone ? "auto" : undefined} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title={t("finance.directByCategory")} />
            {Object.keys(pnl.directByCategory).length === 0 ? (
              <Empty>{t("common.noData")}</Empty>
            ) : (
              <Table>
                <tbody>
                  {Object.entries(pnl.directByCategory)
                    .sort((a, b) => b[1].uzs - a[1].uzs)
                    .map(([c, v]) => (
                      <tr key={c}>
                        <Td>{t(`costCategory.${c}`)}</Td>
                        <Td className="text-right">
                          <Money size="sm" value={v} />
                        </Td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title={t("finance.byMonth")} />
            {pnl.months.length === 0 ? (
              <Empty>{t("common.noData")}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("period.month")}</Th>
                    <Th className="text-right">{t("pnl.revenue")}</Th>
                    <Th className="text-right">{t("pnl.direct")}</Th>
                    <Th className="text-right">{t("pnl.overhead")}</Th>
                    <Th className="text-right">{t("pnl.beforeTax")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {pnl.months.map((m) => (
                    <tr key={m.month}>
                      <Td className="num">{m.month}</Td>
                      <Td className="num text-right">{formatUzs(m.revenue)}</Td>
                      <Td className="num text-right">{formatUzs(m.direct)}</Td>
                      <Td className="num text-right">{formatUzs(m.overhead)}</Td>
                      <Td className={`num text-right font-medium ${m.net < 0 ? "text-danger" : ""}`}>{formatUzs(m.net)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
