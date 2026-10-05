import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { MANUAL_COST_CATEGORIES, computeMetrics, sumAmounts, zero } from "@/lib/metrics";
import { supplierBalances } from "@/lib/suppliers";
import { contractorBalances } from "@/server/contractors/balances";
import { Badge, Button, Card, CardHeader, Empty, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { ExpenseForm, ExpenseTable } from "@/components/expenses";
import { FinanceTabs } from "@/components/finance-tabs";
import { projectWhere } from "@/server/projects/access";
import { pendingApprovalsCount } from "@/server/finance/pending";

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const user = await requirePermission("finance.view");
  const sp = (await searchParams) as { tab?: string; project?: string; category?: string; from?: string; to?: string };
  const tab = sp.tab === "receivables" || sp.tab === "payables" ? sp.tab : "expenses";
  const t = await getTranslations();
  const pending = can(user, "finance.approve") ? await pendingApprovalsCount(user.companyId) : 0;

  const projects = await db.project.findMany({
    where: projectWhere(user),
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true } } },
  });

  const header = (
    <>
      <PageHeader title={t("finance.title")} />
      <FinanceTabs user={user} active={tab} pending={pending} />
    </>
  );

  if (tab === "receivables") {
    const metrics = await computeMetrics(projects);
    const rows = projects
      .map((p) => ({ p, m: metrics.get(p.id)! }))
      .filter((r) => r.m.contractTotalGross.uzs > 0 || r.m.actsGross.uzs > 0)
      .sort((a, b) => b.m.overdueDebt.uzs - a.m.overdueDebt.uzs || b.m.receivable.uzs - a.m.receivable.uzs);
    const keys = ["contractTotalGross", "actsGross", "received", "receivable", "advance", "overdueDebt"] as const;
    const total = (k: (typeof keys)[number]) => sumAmounts(rows.map((r) => r.m[k]));
    return (
      <>
        {header}
        <Card>
          <CardHeader title={t("finance.debtByProject")} subtitle={t("finance.receivableHint")} />
          {rows.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("projects.name")}</Th>
                  <Th>{t("projects.customer")}</Th>
                  <Th className="text-right">{t("finance.contractTotal")}</Th>
                  <Th className="text-right">{t("finance.actsSigned")}</Th>
                  <Th className="text-right">{t("finance.received")}</Th>
                  <Th className="text-right">{t("finance.receivable")}</Th>
                  <Th className="text-right">{t("finance.advance")}</Th>
                  <Th className="text-right">{t("finance.overdue")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, m }) => (
                  <tr key={p.id}>
                    <Td>
                      <Link href={`/projects/${p.id}?tab=revenue`} className="font-medium hover:text-primary">
                        {p.name}
                      </Link>
                      <div className="num text-xs text-muted">{p.code}</div>
                    </Td>
                    <Td>{p.client.name}</Td>
                    {keys.map((k) => (
                      <Td key={k} className="text-right">
                        {k === "overdueDebt" && m.overdueDebt.uzs <= 0 ? (
                          <Badge tone="success">0</Badge>
                        ) : (
                          <Money size="sm" value={m[k]} />
                        )}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <Td colSpan={2}>{t("common.total")}</Td>
                  {keys.map((k) => (
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

  if (tab === "payables") {
    const [suppliers, contractors] = await Promise.all([
      db.supplier.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      db.contractor.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    ]);
    const [sb, cb] = await Promise.all([
      supplierBalances(user.companyId),
      contractorBalances(user.companyId),
    ]);
    const sRows = suppliers.map((s) => ({ s, b: sb.get(s.id) })).filter((r) => r.b && (r.b.debt.uzs !== 0 || r.b.ordered.uzs > 0));
    const cRows = contractors.map((c) => ({ c, b: cb.get(c.id) })).filter((r) => r.b && (r.b.payable.uzs !== 0 || r.b.agreed.uzs > 0));
    return (
      <>
        {header}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title={t("finance.supplierPayables")} subtitle={t("finance.supplierPayablesHint")} />
            {sRows.length === 0 ? (
              <Empty>{t("common.noData")}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("suppliers.name")}</Th>
                    <Th className="text-right">{t("suppliers.ordered")}</Th>
                    <Th className="text-right">{t("suppliers.receivedValue")}</Th>
                    <Th className="text-right">{t("suppliers.paid")}</Th>
                    <Th className="text-right">{t("suppliers.debt")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {sRows.map(({ s, b }) => (
                    <tr key={s.id}>
                      <Td>
                        <Link href={`/suppliers/${s.id}`} className="font-medium hover:text-primary">
                          {s.name}
                        </Link>
                      </Td>
                      <Td className="text-right"><Money size="sm" value={b!.ordered} /></Td>
                      <Td className="text-right"><Money size="sm" value={b!.received} /></Td>
                      <Td className="text-right"><Money size="sm" value={b!.paid} /></Td>
                      <Td className="text-right"><Money size="sm" value={b!.debt} tone="auto" /></Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <Td>{t("common.total")}</Td>
                    {(["ordered", "received", "paid", "debt"] as const).map((k) => (
                      <Td key={k} className="text-right">
                        <Money size="sm" value={sRows.reduce((a, r) => ({ uzs: a.uzs + r.b![k].uzs, usd: a.usd + r.b![k].usd, count: a.count + r.b![k].count }), zero())} />
                      </Td>
                    ))}
                  </tr>
                </tfoot>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title={t("finance.contractorPayables")} subtitle={t("finance.contractorPayablesHint")} />
            {cRows.length === 0 ? (
              <Empty>{t("common.noData")}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("contractors.name")}</Th>
                    <Th className="text-right">{t("contractors.agreed")}</Th>
                    <Th className="text-right">{t("contractors.completedValue")}</Th>
                    <Th className="text-right">{t("contractors.paid")}</Th>
                    <Th className="text-right">{t("contractors.payable")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {cRows.map(({ c, b }) => (
                    <tr key={c.id}>
                      <Td>
                        <Link href={`/contractors/${c.id}`} className="font-medium hover:text-primary">
                          {c.name}
                        </Link>
                      </Td>
                      <Td className="text-right"><Money size="sm" value={b!.agreed} /></Td>
                      <Td className="text-right"><Money size="sm" value={b!.completed} /></Td>
                      <Td className="text-right"><Money size="sm" value={b!.paid} /></Td>
                      <Td className="text-right"><Money size="sm" value={b!.payable} tone="auto" /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </>
    );
  }

  const where: Prisma.ExpenseWhereInput = { project: projectWhere(user) };
  if (sp.project) where.projectId = sp.project;
  if (sp.category && (MANUAL_COST_CATEGORIES as string[]).includes(sp.category))
    where.category = sp.category as (typeof MANUAL_COST_CATEGORIES)[number];
  if (sp.from || sp.to)
    where.date = { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to) } : {}) };
  const rows = await db.expense.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: { createdBy: { select: { name: true } }, project: { select: { id: true, code: true, name: true } } },
  });
  const total = sumAmounts(
    rows.filter((r) => r.approval === "APPROVED").map((r) => ({ uzs: Number(r.amountUzs), usd: Number(r.amountUsd), count: 1 })),
  );
  const canEdit = can(user, "expenses.edit");

  return (
    <>
      {header}
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
              {MANUAL_COST_CATEGORIES.map((c) => (
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
