import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { STAGES } from "@/lib/stages";
import { formatDate } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { Button, Card, Empty, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { DelayedBadge, PriorityBadge, ProgressBar, StageBadge } from "@/components/project-bits";

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const user = await requirePermission("projects.view");
  const sp = (await searchParams) as { q?: string; stage?: string; status?: string };
  const t = await getTranslations();
  const showMoney = can(user.role, "finance.view");

  const where: Prisma.ProjectWhereInput = { companyId: user.companyId };
  if (sp.q)
    where.OR = [
      { name: { contains: sp.q, mode: "insensitive" } },
      { code: { contains: sp.q, mode: "insensitive" } },
      { client: { name: { contains: sp.q, mode: "insensitive" } } },
      { contractNumber: { contains: sp.q, mode: "insensitive" } },
    ];
  if (sp.stage && (STAGES as string[]).includes(sp.stage)) where.stage = sp.stage as (typeof STAGES)[number];
  where.status = (sp.status as Prisma.EnumProjectStatusFilter["equals"]) || "ACTIVE";
  if (sp.status === "ALL") delete where.status;

  const projects = await db.project.findMany({
    where,
    include: { client: { select: { name: true } }, manager: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
  const metrics = await computeMetrics(projects);

  return (
    <>
      <PageHeader
        title={t("projects.title")}
        actions={
          can(user.role, "projects.edit") && (
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
          <Select name="stage" defaultValue={sp.stage ?? ""} className="max-w-52">
            <option value="">
              {t("projects.stage")}: {t("common.all")}
            </option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {t(`stages.${s}`)}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={sp.status ?? "ACTIVE"} className="max-w-44">
            <option value="ALL">
              {t("projects.status")}: {t("common.all")}
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
                <Th>{t("projects.stage")}</Th>
                <Th>{t("projects.progress")}</Th>
                <Th>{t("projects.plannedEndDate")}</Th>
                <Th>{t("projects.manager")}</Th>
                {showMoney && <Th className="text-right">{t("projects.contractAmount")}</Th>}
                {showMoney && <Th className="text-right">{t("dashboard.expectedProfit")}</Th>}
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
                        {p.priority !== "MEDIUM" && p.priority !== "LOW" && <PriorityBadge priority={p.priority} />}
                        {m.delayed && <DelayedBadge />}
                      </div>
                    </Td>
                    <Td>
                      <StageBadge stage={p.stage} />
                    </Td>
                    <Td>
                      <ProgressBar stage={p.stage} />
                    </Td>
                    <Td className="num">{formatDate(p.plannedEndDate)}</Td>
                    <Td>{p.manager?.name ?? "—"}</Td>
                    {showMoney && (
                      <Td className="text-right">
                        <Money value={m.contract} size="sm" />
                      </Td>
                    )}
                    {showMoney && (
                      <Td className="text-right">
                        <Money value={m.expectedProfit} size="sm" tone="auto" />
                        <div className="num text-xs text-muted">{formatPercent(m.expectedMargin)}</div>
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
