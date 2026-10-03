import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordMoney } from "@/lib/money-value";
import { formatDate } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { FinanceTabs } from "@/components/finance-tabs";
import { pendingApprovalsCount } from "@/server/finance/pending";
import { decide } from "./actions";

type Row = {
  kind: "expense" | "overhead" | "supplierPayment" | "contractorPayment";
  id: string;
  date: Date;
  title: string;
  context: string;
  href?: string;
  author?: string | null;
  money: Parameters<typeof recordMoney>[0];
};

export default async function ApprovalsPage() {
  const user = await requirePermission("finance.approve");
  const t = await getTranslations();
  const companyId = user.companyId;
  const [expenses, overheads, supplierPayments, contractorPayments] = await Promise.all([
    db.expense.findMany({
      where: { project: { companyId }, approval: "PENDING" },
      include: { project: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    db.overheadExpense.findMany({ where: { companyId, approval: "PENDING" }, orderBy: { date: "asc" } }),
    db.supplierPayment.findMany({
      where: { supplier: { companyId }, approval: "PENDING" },
      include: { supplier: { select: { id: true, name: true } }, order: { select: { number: true } } },
      orderBy: { date: "asc" },
    }),
    db.contractorPayment.findMany({
      where: { contractor: { companyId }, approval: "PENDING" },
      include: { contractor: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    }),
  ]);
  const rows: Row[] = [
    ...expenses.map((e) => ({
      kind: "expense" as const,
      id: e.id,
      date: e.date,
      title: `${t(`costCategory.${e.category}`)}: ${e.description}`,
      context: e.project.name,
      href: `/projects/${e.project.id}?tab=expenses`,
      author: e.createdBy?.name,
      money: e,
    })),
    ...overheads.map((o) => ({
      kind: "overhead" as const,
      id: o.id,
      date: o.date,
      title: `${t(`overheadCategory.${o.category}`)}: ${o.description}`,
      context: t("finance.tab_overhead"),
      href: "/finance/overhead",
      money: o,
    })),
    ...supplierPayments.map((p) => ({
      kind: "supplierPayment" as const,
      id: p.id,
      date: p.date,
      title: `${t("finance.paymentTo")} ${p.supplier.name}${p.order ? ` (${p.order.number})` : ""}`,
      context: t("nav.suppliers"),
      href: `/suppliers/${p.supplier.id}`,
      money: p,
    })),
    ...contractorPayments.map((p) => ({
      kind: "contractorPayment" as const,
      id: p.id,
      date: p.date,
      title: `${t("finance.paymentTo")} ${p.contractor.name}`,
      context: t("nav.contractors"),
      href: `/contractors/${p.contractor.id}`,
      money: p,
    })),
  ];

  return (
    <>
      <PageHeader title={t("finance.title")} />
      <FinanceTabs user={user} active="approvals" pending={await pendingApprovalsCount(companyId)} />
      <Card>
        <CardHeader title={t("finance.approvalsTitle")} subtitle={t("finance.approvalsHint")} />
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm text-success">
            <CheckCircle2 className="size-5" aria-hidden />
            {t("finance.nothingPending")}
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("common.date")}</Th>
                <Th>{t("finance.description")}</Th>
                <Th className="text-right">{t("common.amount")}</Th>
                <Th>{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}:${r.id}`}>
                  <Td className="num">{formatDate(r.date)}</Td>
                  <Td>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted">
                      <Badge className="mr-1">{t(`finance.kind_${r.kind}`)}</Badge>
                      {r.href ? (
                        <Link href={r.href} className="hover:text-primary">
                          {r.context}
                        </Link>
                      ) : (
                        r.context
                      )}
                      {r.author && ` · ${r.author}`}
                    </div>
                  </Td>
                  <Td className="text-right">
                    <Money size="sm" value={recordMoney(r.money)} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={decide}>
                        <input type="hidden" name="kind" value={r.kind} />
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <Button type="submit" className="h-8">
                          {t("finance.approve")}
                        </Button>
                      </form>
                      <form action={decide} className="flex items-center gap-1">
                        <input type="hidden" name="kind" value={r.kind} />
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="decision" value="REJECTED" />
                        <Input name="reason" placeholder={t("finance.rejectReason")} className="h-8 w-44" />
                        <Button type="submit" variant="danger" className="h-8">
                          {t("finance.reject")}
                        </Button>
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
