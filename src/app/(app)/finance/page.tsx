import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { COST_CATEGORIES, computeMetrics, sumAmounts } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { ExpenseForm, ExpenseTable } from "@/components/expenses";

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const user = await requirePermission("finance.view");
  const sp = (await searchParams) as { tab?: string; project?: string; category?: string; from?: string; to?: string };
  const tab = sp.tab === "receivables" ? "receivables" : "expenses";
  const t = await getTranslations();

  const projects = await db.project.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true } } },
  });

  const tabs = (
    <nav className="mb-5 flex gap-1 border-b border-border">
      {(["expenses", "receivables"] as const).map((k) => (
        <Link
          key={k}
          href={k === "expenses" ? "/finance" : "/finance?tab=receivables"}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm",
            tab === k ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t(k === "expenses" ? "finance.tabExpenses" : "finance.tabReceivables")}
        </Link>
      ))}
    </nav>
  );

  if (tab === "receivables") {
    const metrics = await computeMetrics(projects);
    const rows = projects
      .map((p) => ({ p, m: metrics.get(p.id)! }))
      .filter((r) => r.m.contract.uzs > 0)
      .sort((a, b) => b.m.overdueDebt.uzs - a.m.overdueDebt.uzs || b.m.clientDebt.uzs - a.m.clientDebt.uzs);
    const total = (k: "contract" | "received" | "clientDebt" | "overdueDebt") => sumAmounts(rows.map((r) => r.m[k]));
    return (
      <>
        <PageHeader title={t("finance.title")} />
        {tabs}
        <Card>
          <CardHeader title={t("finance.debtByProject")} />
          {rows.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("projects.name")}</Th>
                  <Th>{t("projects.client")}</Th>
                  <Th className="text-right">{t("projects.contractAmount")}</Th>
                  <Th className="text-right">{t("payments.paid")}</Th>
                  <Th className="text-right">{t("dashboard.clientDebt")}</Th>
                  <Th className="text-right">{t("dashboard.overdueDebt")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, m }) => (
                  <tr key={p.id}>
                    <Td>
                      <Link href={`/projects/${p.id}?tab=payments`} className="font-medium hover:text-primary">
                        {p.name}
                      </Link>
                      <div className="num text-xs text-muted">{p.code}</div>
                    </Td>
                    <Td>{p.client.name}</Td>
                    <Td className="text-right">
                      <Money size="sm" value={m.contract} />
                    </Td>
                    <Td className="text-right">
                      <Money size="sm" value={m.received} />
                    </Td>
                    <Td className="text-right">
                      <Money size="sm" value={m.clientDebt} />
                    </Td>
                    <Td className="text-right">
                      {m.overdueDebt.uzs > 0 ? (
                        <Money size="sm" value={{ ...m.overdueDebt, uzs: m.overdueDebt.uzs }} />
                      ) : (
                        <Badge tone="success">0</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <Td colSpan={2}>{t("common.total")}</Td>
                  {(["contract", "received", "clientDebt", "overdueDebt"] as const).map((k) => (
                    <Td key={k} className="text-right">
                      <Money size="sm" value={total(k)} />
                    </Td>
                  ))}
                </tr>
              </tfoot>
            </Table>
          )}
        </Card>
      </>
    );
  }

  const where: Prisma.ExpenseWhereInput = { project: { companyId: user.companyId } };
  if (sp.project) where.projectId = sp.project;
  if (sp.category && (COST_CATEGORIES as string[]).includes(sp.category))
    where.category = sp.category as (typeof COST_CATEGORIES)[number];
  if (sp.from || sp.to)
    where.date = { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to) } : {}) };
  const rows = await db.expense.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: { createdBy: { select: { name: true } }, project: { select: { id: true, code: true, name: true } } },
  });
  const total = sumAmounts(rows.map((r) => ({ uzs: Number(r.amountUzs), usd: Number(r.amountUsd), count: 1 })));
  const canEdit = can(user.role, "expenses.edit");

  return (
    <>
      <PageHeader title={t("finance.title")} />
      {tabs}
      <div className="flex flex-col gap-6">
        {canEdit && (
          <Card>
            <CardHeader title={t("expenses.add")} />
            <ExpenseForm projects={projects.filter((p) => p.status === "ACTIVE")} />
          </Card>
        )}
        <Card>
          <CardHeader title={t("expenses.title")} action={<Money value={total} size="sm" />} />
          <form className="flex flex-wrap gap-2 border-b border-border p-3">
            <Select name="project" defaultValue={sp.project ?? ""} className="max-w-64">
              <option value="">
                {t("expenses.project")}: {t("common.all")}
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
            <Select name="category" defaultValue={sp.category ?? ""} className="max-w-52">
              <option value="">
                {t("expenses.category")}: {t("common.all")}
              </option>
              {COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`costCategory.${c}`)}
                </option>
              ))}
            </Select>
            <Input type="date" name="from" defaultValue={sp.from} className="w-40" aria-label={t("common.from")} />
            <Input type="date" name="to" defaultValue={sp.to} className="w-40" aria-label={t("common.to")} />
            <Button type="submit" variant="secondary">
              {t("common.filter")}
            </Button>
          </form>
          <ExpenseTable rows={rows} canEdit={canEdit} showProject />
        </Card>
      </div>
    </>
  );
}
