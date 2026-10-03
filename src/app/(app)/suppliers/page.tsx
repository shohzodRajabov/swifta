import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { supplierBalances } from "@/lib/suppliers";
import { Card, Empty, Input, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";

export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  const user = await requirePermission("suppliers.view");
  const { q } = (await searchParams) as { q?: string };
  const t = await getTranslations();
  const showMoney = can(user, "finance.view") || can(user, "supplierPayments.edit");

  const suppliers = await db.supplier.findMany({
    where: {
      companyId: user.companyId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { contactPerson: { contains: q, mode: "insensitive" } },
              { tin: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
  const balances = showMoney ? await supplierBalances(user.companyId, suppliers.map((s) => s.id)) : null;
  const zero = { uzs: 0, usd: 0, count: 0 };

  return (
    <>
      <PageHeader
        title={t("suppliers.title")}
        actions={
          can(user, "suppliers.edit") && (
            <LinkButton href="/suppliers/new">
              <Plus className="size-4" aria-hidden />
              {t("suppliers.new")}
            </LinkButton>
          )
        }
      />
      <Card>
        <form className="border-b border-border p-3">
          <Input name="q" defaultValue={q} placeholder={t("common.search")} className="max-w-sm" />
        </form>
        {suppliers.length === 0 ? (
          <Empty>{t("suppliers.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("suppliers.name")}</Th>
                <Th>{t("suppliers.contactPerson")}</Th>
                <Th>{t("suppliers.phone")}</Th>
                {balances && <Th className="text-right">{t("suppliers.ordered")}</Th>}
                {balances && <Th className="text-right">{t("suppliers.paid")}</Th>}
                {balances && <Th className="text-right">{t("suppliers.debt")}</Th>}
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => {
                const b = balances?.get(s.id);
                return (
                  <tr key={s.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/suppliers/${s.id}`} className="font-medium hover:text-primary">
                        {s.name}
                      </Link>
                      {s.paymentTerms && <div className="text-xs text-muted">{s.paymentTerms}</div>}
                    </Td>
                    <Td>{s.contactPerson ?? "—"}</Td>
                    <Td className="num">{s.phone ?? "—"}</Td>
                    {balances && (
                      <Td className="text-right">
                        <Money size="sm" value={b?.ordered ?? zero} />
                      </Td>
                    )}
                    {balances && (
                      <Td className="text-right">
                        <Money size="sm" value={b?.paid ?? zero} />
                      </Td>
                    )}
                    {balances && (
                      <Td className="text-right">
                        <Money size="sm" value={b?.debt ?? zero} />
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
