import { getTranslations } from "next-intl/server";
import type { Client, Project } from "@prisma/client";
import type { ProjectMetrics } from "@/lib/metrics";
import { formatDate } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui";
import { Money } from "@/components/money";

export async function OverviewTab({
  project,
  metrics: m,
  showFinance,
}: {
  project: Project & { client: Client; manager: { name: string } | null; engineer: { name: string } | null };
  metrics: ProjectMetrics;
  showFinance: boolean;
}) {
  const t = await getTranslations();
  const info: [string, string | null][] = [
    [t("projects.client"), project.client.name],
    [t("projects.address"), project.address],
    [t("projects.contractNumber"), project.contractNumber],
    [t("projects.contractDate"), project.contractDate ? formatDate(project.contractDate) : null],
    [t("projects.manager"), project.manager?.name ?? null],
    [t("projects.engineer"), project.engineer?.name ?? null],
    [t("projects.installTeam"), project.installTeam],
    [t("projects.startDate"), project.startDate ? formatDate(project.startDate) : null],
    [t("projects.plannedEndDate"), project.plannedEndDate ? formatDate(project.plannedEndDate) : null],
    [t("projects.actualEndDate"), project.actualEndDate ? formatDate(project.actualEndDate) : null],
    [t("common.note"), project.note],
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      {showFinance ? (
        <Card className="@container min-w-0">
          <CardHeader title={t("projects.financeSummary")} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5 text-left font-medium" />
                  <th className="px-4 py-2.5 text-right font-medium">{t("common.plan")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("common.commitment")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("common.actual")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-t border-border">
                <tr>
                  <td className="px-5 py-3 font-medium">{t("projects.revenue")}</td>
                  <td className="px-4 py-3 text-right">
                    <Money value={m.contract} />
                  </td>
                  <td className="px-4 py-3 text-right text-muted">—</td>
                  <td className="px-4 py-3 text-right">
                    <Money value={m.received} />
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 font-medium">{t("projects.costs")}</td>
                  <td className="px-4 py-3 text-right">
                    <Money value={m.plannedCost} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money value={m.committedCost} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Money value={m.actualCost} />
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 font-medium">{t("projects.profit")}</td>
                  <td className="px-4 py-3 text-right">
                    <Money value={m.plannedProfit} tone="auto" />
                    <div className="num text-xs text-muted">{formatPercent(m.plannedMargin)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-muted">—</td>
                  <td className="px-4 py-3 text-right">
                    <Money value={m.cashProfit} tone="auto" />
                    <div className="text-xs text-muted">{t("dashboard.cashProfit")}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 border-t border-border p-5 @xl:grid-cols-3">
            <div>
              <div className="text-xs text-muted" title={t("dashboard.expectedProfitHint")}>
                {t("dashboard.expectedProfit")} ⓘ
              </div>
              <Money value={m.expectedProfit} tone="auto" align="left" />
              <div className="num text-xs text-muted">{formatPercent(m.expectedMargin)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">{t("dashboard.clientDebt")}</div>
              <Money value={m.clientDebt} align="left" />
            </div>
            <div>
              <div className="text-xs text-muted">{t("dashboard.overdueDebt")}</div>
              <Money value={m.overdueDebt} align="left" tone="auto" />
            </div>
          </div>
        </Card>
      ) : (
        <div />
      )}
      <Card>
        <CardHeader title={t("projects.info")} />
        <dl className="divide-y divide-border text-sm">
          {info.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[140px_1fr] gap-3 px-5 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="whitespace-pre-line break-words">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
