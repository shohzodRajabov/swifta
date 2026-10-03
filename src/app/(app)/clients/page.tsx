import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { computeMetrics, sumAmounts } from "@/lib/metrics";
import { Badge, Card, Empty, Input, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const user = await requirePermission("clients.view");
  const { q } = (await searchParams) as { q?: string };
  const t = await getTranslations();
  const showMoney = can(user, "finance.view") || can(user, "payments.edit");

  const clients = await db.client.findMany({
    where: {
      companyId: user.companyId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { contactPerson: { contains: q, mode: "insensitive" } },
              { tin: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    include: { projects: true, ownedProjects: { select: { id: true } } },
    orderBy: { name: "asc" },
  });
  const metrics = showMoney ? await computeMetrics(clients.flatMap((c) => c.projects)) : null;

  return (
    <>
      <PageHeader
        title={t("clients.title")}
        actions={
          can(user, "clients.edit") && (
            <LinkButton href="/clients/new">
              <Plus className="size-4" aria-hidden />
              {t("clients.new")}
            </LinkButton>
          )
        }
      />
      <Card>
        <form className="border-b border-border p-3">
          <Input name="q" defaultValue={q} placeholder={t("common.search")} className="max-w-sm" />
        </form>
        {clients.length === 0 ? (
          <Empty>{t("clients.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("clients.name")}</Th>
                <Th>{t("clients.contactPerson")}</Th>
                <Th>{t("clients.phone")}</Th>
                <Th className="text-right">{t("clients.projects")}</Th>
                {metrics && <Th className="text-right">{t("clients.contracts")}</Th>}
                {metrics && <Th className="text-right">{t("clients.debt")}</Th>}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const ms = c.projects.map((p) => metrics?.get(p.id)).filter((m) => !!m);
                return (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <Td>
                      <Link href={`/clients/${c.id}`} className="font-medium hover:text-primary">
                        {c.name}
                      </Link>
                      <div className="mt-0.5">
                        <Badge>{t(`clientType.${c.type}`)}</Badge>
                      </div>
                    </Td>
                    <Td>{c.contactPerson ?? "—"}</Td>
                    <Td className="num">{c.phone ?? "—"}</Td>
                    <Td className="num text-right">{c.projects.length}</Td>
                    {metrics && (
                      <Td className="text-right">
                        <Money value={sumAmounts(ms.map((m) => m.contractTotalGross))} size="sm" />
                      </Td>
                    )}
                    {metrics && (
                      <Td className="text-right">
                        <Money value={sumAmounts(ms.map((m) => m.receivable))} size="sm" />
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
