import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Pencil, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { computeMetrics, sumAmounts } from "@/lib/metrics";
import { Badge, Card, CardHeader, Empty, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { StatusBadge } from "@/components/project-bits";

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const user = await requirePermission("clients.view");
  const client = await db.client.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      projects: { orderBy: { createdAt: "desc" }, include: { statusDef: { include: { group: true } } } },
      ownedProjects: {
        where: { NOT: { clientId: id } },
        orderBy: { createdAt: "desc" },
        include: { statusDef: { include: { group: true } }, client: { select: { name: true } } },
      },
    },
  });
  if (!client) notFound();
  const t = await getTranslations();
  const showMoney = can(user, "finance.view") || can(user, "payments.edit");
  const metrics = showMoney ? await computeMetrics(client.projects) : null;
  const all = metrics ? [...metrics.values()] : [];

  const info: [string, string | null][] = [
    [t("clients.type"), t(`clientType.${client.type}`)],
    [t("clients.contactPerson"), client.contactPerson],
    [t("clients.phone"), client.phone],
    [t("clients.email"), client.email],
    [t("clients.address"), client.address],
    [t("clients.tin"), client.tin],
    [t("clients.bankDetails"), client.bankDetails],
    [t("common.note"), client.note],
  ];

  return (
    <>
      <PageHeader
        title={client.name}
        back={{ href: "/clients", label: t("clients.title") }}
        actions={
          <>
            {can(user, "projects.edit") && (
              <LinkButton href={`/projects/new?client=${client.id}`} variant="secondary">
                <Plus className="size-4" aria-hidden />
                {t("projects.new")}
              </LinkButton>
            )}
            {can(user, "clients.edit") && (
              <LinkButton href={`/clients/${client.id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden />
                {t("common.edit")}
              </LinkButton>
            )}
          </>
        }
      />

      {metrics && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {(
            [
              ["clients.contracts", sumAmounts(all.map((m) => m.contractTotalGross))],
              ["clients.paid", sumAmounts(all.map((m) => m.received))],
              ["clients.debt", sumAmounts(all.map((m) => m.receivable))],
            ] as const
          ).map(([label, value]) => (
            <Card key={label} className="p-4">
              <div className="mb-1 text-xs text-muted">{t(label)}</div>
              <Money value={value} size="lg" align="left" />
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title={t("clients.projects")} />
          {client.projects.length === 0 ? (
            <Empty>{t("projects.empty")}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("projects.code")}</Th>
                  <Th>{t("projects.name")}</Th>
                  <Th>{t("projects.status")}</Th>
                  {metrics && <Th className="text-right">{t("projects.contractAmount")}</Th>}
                  {metrics && <Th className="text-right">{t("clients.debt")}</Th>}
                </tr>
              </thead>
              <tbody>
                {client.projects.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-2/60">
                    <Td className="num text-muted">{p.code}</Td>
                    <Td>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">
                        {p.name}
                      </Link>
                    </Td>
                    <Td>
                      <StatusBadge status={p.statusDef} />
                    </Td>
                    {metrics && (
                      <Td className="text-right">
                        <Money value={metrics.get(p.id)!.contractTotalGross} size="sm" />
                      </Td>
                    )}
                    {metrics && (
                      <Td className="text-right">
                        <Money value={metrics.get(p.id)!.receivable} size="sm" />
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {client.ownedProjects.length > 0 && (
          <Card className="xl:col-start-1">
            <CardHeader title={t("clients.ownedProjects")} subtitle={t("clients.ownedProjectsHint")} />
            <Table>
              <tbody>
                {client.ownedProjects.map((p) => (
                  <tr key={p.id}>
                    <Td className="num text-muted">{p.code}</Td>
                    <Td>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">
                        {p.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {t("projects.customer")}: {p.client.name}
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge status={p.statusDef} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        <Card className="xl:col-start-2 xl:row-start-1">
          <CardHeader title={t("projects.info")} />
          <dl className="divide-y divide-border text-sm">
            {info.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] gap-3 px-5 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="whitespace-pre-line break-words">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-1.5 border-t border-border px-5 py-3">
            <Badge>{t("common.phaseNotice", { n: 3 })}</Badge>
          </div>
        </Card>
      </div>
    </>
  );
}
