import { getTranslations } from "next-intl/server";
import type { Client, LegalEntity, Project } from "@prisma/client";
import type { ProjectMetrics } from "@/lib/metrics";
import { formatDate } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { Card, CardHeader } from "@/components/ui";
import { Money } from "@/components/money";

type Person = { name: string } | null;

export async function OverviewTab({
  project,
  metrics: m,
  showFinance,
}: {
  project: Project & {
    client: Client;
    owner: Client | null;
    legalEntity: LegalEntity | null;
    manager: Person;
    engineer: Person;
    chiefEngineer: Person;
    foreman: Person;
  };
  metrics: ProjectMetrics;
  showFinance: boolean;
}) {
  const t = await getTranslations();
  const d = (v: Date | null) => (v ? formatDate(v) : null);
  const info: [string, string | null][] = [
    [t("projects.customer"), project.client.name],
    [t("projects.owner"), project.owner?.name ?? project.client.name],
    [t("projects.legalEntity"), project.legalEntity ? `${project.legalEntity.name} · ${t(`taxRegime.${project.legalEntity.taxRegime}`)}` : null],
    [t("projects.objectType"), project.objectType],
    [t("projects.address"), project.address],
    [
      t("projects.siteContactName"),
      [project.siteContactName, project.siteContactPhone ? formatPhone(project.siteContactPhone) : null, project.siteContactEmail]
        .filter(Boolean)
        .join(" · ") || null,
    ],
    [t("projects.contractNumber"), project.contractNumber],
    [t("projects.contractDate"), d(project.contractDate)],
    [t("projects.manager"), project.manager?.name ?? null],
    [t("projects.chiefEngineer"), project.chiefEngineer?.name ?? null],
    [t("projects.foreman"), project.foreman?.name ?? null],
    [t("projects.engineer"), project.engineer?.name ?? null],
    [t("projects.startDate"), d(project.startDate)],
    [t("projects.plannedEndDate"), d(project.plannedEndDate)],
    [t("projects.actualEndDate"), d(project.actualEndDate)],
    [
      t("projects.warranty"),
      project.warrantyStart
        ? `${formatDate(project.warrantyStart)} — ${project.warrantyEnd ? formatDate(project.warrantyEnd) : "…"}`
        : project.warrantyMonths
          ? t("projects.warrantyMonthsValue", { n: project.warrantyMonths })
          : null,
    ],
    [t("common.note"), project.note],
  ];

  const rows: { label: string; v: { plan: typeof m.revenue.plan; forecast: typeof m.revenue.plan; actual: typeof m.revenue.plan }; sub?: string; margin?: boolean }[] = [
    { label: t("finance.revenue"), v: m.revenue, sub: t("finance.revenueActualHint") },
    { label: t("finance.costs"), v: m.cost },
    { label: t("finance.profit"), v: m.profit, margin: true },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      {showFinance ? (
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="@container min-w-0">
            <CardHeader
              title={t("finance.planForecastActual")}
              subtitle={m.regime === "GENERAL" ? t("finance.netOfVatNote") : t("finance.turnoverNote")}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-2.5 text-left font-medium" />
                    <th className="px-4 py-2.5 text-right font-medium">{t("common.plan")}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{t("common.forecast")}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{t("common.actual")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border border-t border-border">
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <td className="px-5 py-3 font-medium">
                        {r.label}
                        {r.sub && <div className="text-xs font-normal text-muted">{r.sub}</div>}
                      </td>
                      {(["plan", "forecast", "actual"] as const).map((k) => (
                        <td key={k} className="px-4 py-3 text-right">
                          <Money value={r.v[k]} tone={r.margin ? "auto" : undefined} />
                          {r.margin && <div className="num text-xs text-muted">{formatPercent(m.margin[k])}</div>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {m.cost.committed.uzs > 0 && (
              <div className="border-t border-border px-5 py-2.5 text-xs text-muted">
                {t("finance.openCommitments")}: <Money value={m.cost.committed} size="sm" align="left" />
              </div>
            )}
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {(
              [
                ["finance.contractTotal", m.contractTotalGross],
                ["finance.received", m.received],
                ["finance.receivable", m.receivable],
                ["finance.advance", m.advance],
                ["finance.overdue", m.overdueDebt],
              ] as const
            ).map(([label, value]) => (
              <Card key={label} className="p-4">
                <div className="mb-1 text-xs text-muted">{t(label)}</div>
                <Money value={value} align="left" tone={label === "finance.overdue" ? "auto" : undefined} />
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div />
      )}
      <Card className="self-start">
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
