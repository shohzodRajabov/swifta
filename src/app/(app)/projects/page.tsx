import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import type { Prisma, StatusGroupCode } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { STATUS_GROUP_ORDER } from "@/lib/statuses";
import { formatDate } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { Button, Card, Empty, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { DelayedBadge, PriorityBadge, ProgressBar, StatusBadge } from "@/components/project-bits";
import { projectWhere } from "@/server/projects/access";
import { getStatusCatalog } from "@/server/projects/status";
import { projectProgress } from "@/server/projects/progress";

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const user = await requirePermission("projects.view");
  const sp = (await searchParams) as { q?: string; group?: string; status?: string; manager?: string };
  const t = await getTranslations();
  const showMoney = can(user, "finance.view");
  const catalog = await getStatusCatalog(user.companyId);

  const where: Prisma.ProjectWhereInput = { AND: [projectWhere(user)] };
  const and = where.AND as Prisma.ProjectWhereInput[];
  if (sp.q)
    and.push({
      OR: [
        { name: { contains: sp.q, mode: "insensitive" } },
        { code: { contains: sp.q, mode: "insensitive" } },
        { client: { name: { contains: sp.q, mode: "insensitive" } } },
        { owner: { name: { contains: sp.q, mode: "insensitive" } } },
        { contractNumber: { contains: sp.q, mode: "insensitive" } },
        { address: { contains: sp.q, mode: "insensitive" } },
      ],
    });
  if (sp.group && STATUS_GROUP_ORDER.includes(sp.group as StatusGroupCode))
    and.push({ statusDef: { group: { code: sp.group as StatusGroupCode } } });
  if (sp.manager) and.push({ managerId: sp.manager });
  const lifecycle = sp.status ?? "ACTIVE";
  if (lifecycle !== "ALL") and.push({ status: lifecycle as Prisma.EnumProjectStatusFilter["equals"] });

  const [projects, managers] = await Promise.all([
    db.project.findMany({
      where,
      include: {
        client: { select: { name: true } },
        owner: { select: { name: true } },
        manager: { select: { name: true } },
        statusDef: { include: { group: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    db.user.findMany({
      where: { companyId: user.companyId, managedProjects: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const [metrics, progress] = await Promise.all([computeMetrics(projects), projectProgress(projects.map((p) => p.id))]);

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        actions={
          can(user, "projects.edit") && (
            <LinkButton href="/projects/new">
              <Plus className="size-4" aria-hidden />
              {t("projects.new")}
            </LinkButton>
          )
        }
      />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-border p-3">
          <Input name="q" defaultValue={sp.q} placeholder={t("common.searchPlaceholder")} className="max-w-xs" />
          <Select name="group" defaultValue={sp.group ?? ""} className="max-w-60">
            <option value="">
              {t("projects.statusGroup")}: {t("common.all")}
            </option>
            {catalog.map((g) => (
              <option key={g.id} value={g.code}>
                {g.letter}. {g.name}
              </option>
            ))}
          </Select>
          {managers.length > 0 && (
            <Select name="manager" defaultValue={sp.manager ?? ""} className="max-w-52">
              <option value="">
                {t("projects.manager")}: {t("common.all")}
              </option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
          <Select name="status" defaultValue={lifecycle} className="max-w-44">
            <option value="ALL">
              {t("projects.lifecycle")}: {t("common.all")}
            </option>
            {(["ACTIVE", "ON_HOLD", "CLOSED", "CANCELLED"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`projectStatus.${s}`)}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
        </form>
        {projects.length === 0 ? (
          <Empty>{t("projects.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("projects.code")}</Th>
                <Th>{t("projects.name")}</Th>
                <Th>{t("projects.status")}</Th>
                <Th>{t("projects.progress")}</Th>
                <Th>{t("projects.plannedEndDate")}</Th>
                <Th>{t("projects.manager")}</Th>
                {showMoney && <Th className="text-right">{t("finance.contractTotal")}</Th>}
                {showMoney && <Th className="text-right">{t("finance.forecastProfit")}</Th>}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const m = metrics.get(p.id)!;
                return (
                  <tr key={p.id} className="hover:bg-surface-2/60">
                    <Td className="num text-muted">{p.code}</Td>
                    <Td>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">
                        {p.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {p.client.name}
                        {p.owner && p.owner.name !== p.client.name && <span>· {p.owner.name}</span>}
                        {(p.priority === "HIGH" || p.priority === "CRITICAL") && <PriorityBadge priority={p.priority} />}
                        {m.delayed && <DelayedBadge />}
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge status={p.statusDef} />
                    </Td>
                    <Td>
                      <ProgressBar percent={progress.get(p.id)?.percent ?? null} />
                    </Td>
                    <Td className="num">{formatDate(p.plannedEndDate)}</Td>
                    <Td>{p.manager?.name ?? "—"}</Td>
                    {showMoney && (
                      <Td className="text-right">
                        <Money value={m.contractTotalGross} size="sm" />
                      </Td>
                    )}
                    {showMoney && (
                      <Td className="text-right">
                        <Money value={m.profit.forecast} size="sm" tone="auto" />
                        <div className="num text-xs text-muted">{formatPercent(m.margin.forecast)}</div>
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
