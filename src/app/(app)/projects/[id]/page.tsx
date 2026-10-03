import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Pencil } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { DelayedBadge, LifecycleBadge, PriorityBadge, StatusBadge } from "@/components/project-bits";
import { projectWhere } from "@/server/projects/access";
import { getStatusCatalog } from "@/server/projects/status";
import { StatusTimeline } from "./stage-timeline";
import { StatusForm } from "./stage-form";
import { changeStatus } from "../actions";
import { OverviewTab } from "./tabs/overview";
import { BomTab } from "./tabs/bom";
import { BudgetTab } from "./tabs/budget";
import { RevenueTab } from "./tabs/revenue";
import { ExpensesTab } from "./tabs/expenses";
import { HistoryTab } from "./tabs/history";
import { MaterialsTab } from "./tabs/materials";
import { DocumentsTab } from "./tabs/documents";

const TABS = ["overview", "revenue", "budget", "expenses", "bom", "materials", "documents", "history"] as const;
type Tab = (typeof TABS)[number];

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const { tab: rawTab } = (await searchParams) as { tab?: string };
  const user = await requirePermission("projects.view");
  const project = await db.project.findFirst({
    where: { AND: [{ id }, projectWhere(user)] },
    include: {
      client: true,
      owner: true,
      legalEntity: true,
      manager: { select: { name: true } },
      engineer: { select: { name: true } },
      chiefEngineer: { select: { name: true } },
      foreman: { select: { name: true } },
      statusDef: { include: { group: true } },
      stageEvents: { orderBy: { enteredAt: "asc" }, include: { statusDef: true } },
    },
  });
  if (!project) notFound();
  const t = await getTranslations();
  const [m, catalog] = await Promise.all([
    computeMetrics([project]).then((r) => r.get(project.id)!),
    getStatusCatalog(user.companyId),
  ]);

  const finance = can(user, "finance.view");
  const visible: Record<Tab, boolean> = {
    overview: true,
    revenue: finance || can(user, "payments.edit") || can(user, "acts.edit"),
    budget: finance,
    expenses: finance || can(user, "expenses.edit"),
    bom: true,
    materials: true,
    documents: can(user, "documents.view"),
    history: can(user, "audit.view") || can(user, "projects.edit"),
  };
  const tab: Tab = TABS.includes(rawTab as Tab) && visible[rawTab as Tab] ? (rawTab as Tab) : "overview";
  const tabLabel: Record<Tab, string> = {
    overview: t("projects.tabOverview"),
    revenue: t("projects.tabRevenue"),
    budget: t("projects.tabBudget"),
    expenses: t("projects.tabExpenses"),
    bom: t("projects.tabBom"),
    materials: t("materials.tab"),
    documents: t("projects.tabDocuments"),
    history: t("projects.tabHistory"),
  };

  // First date each status group was entered.
  const reached = new Map<string, Date>();
  for (const e of project.stageEvents) {
    const groupId = e.statusDef?.groupId;
    if (groupId && !reached.has(groupId)) reached.set(groupId, e.enteredAt);
  }

  return (
    <>
      <PageHeader
        title={project.name}
        back={{ href: "/projects", label: t("projects.title") }}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <span className="num">{project.code}</span>
            <span>·</span>
            <Link href={`/clients/${project.clientId}`} className="hover:text-primary">
              {project.client.name}
            </Link>
            <StatusBadge status={project.statusDef} />
            {project.status !== "ACTIVE" && <LifecycleBadge status={project.status} />}
            {project.priority !== "MEDIUM" && <PriorityBadge priority={project.priority} />}
            {m.delayed && <DelayedBadge />}
          </div>
        }
        actions={
          can(user, "projects.edit") && (
            <LinkButton href={`/projects/${project.id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden />
              {t("common.edit")}
            </LinkButton>
          )
        }
      />

      <Card className="mb-6 p-4">
        <StatusTimeline catalog={catalog} currentStatusId={project.statusId} reached={reached} />
        {can(user, "projects.status") && (
          <div className="mt-3 border-t border-border pt-3">
            <StatusForm
              action={changeStatus.bind(null, project.id)}
              catalog={catalog.map((g) => ({
                id: g.id,
                letter: g.letter,
                name: g.name,
                statuses: g.statuses.map((s) => ({ id: s.id, code: s.code, name: s.name, active: s.active })),
              }))}
              currentStatusId={project.statusId}
            />
          </div>
        )}
      </Card>

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.filter((k) => visible[k]).map((k) => (
          <Link
            key={k}
            href={k === "overview" ? `/projects/${project.id}` : `/projects/${project.id}?tab=${k}`}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              tab === k ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-text",
            )}
          >
            {tabLabel[k]}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab project={project} metrics={m} showFinance={finance} />}
      {tab === "revenue" && <RevenueTab user={user} project={project} metrics={m} />}
      {tab === "budget" && <BudgetTab user={user} projectId={project.id} metrics={m} />}
      {tab === "expenses" && <ExpensesTab user={user} projectId={project.id} />}
      {tab === "bom" && <BomTab user={user} projectId={project.id} />}
      {tab === "materials" && <MaterialsTab user={user} projectId={project.id} />}
      {tab === "documents" && <DocumentsTab user={user} projectId={project.id} catalog={catalog} />}
      {tab === "history" && <HistoryTab projectId={project.id} companyId={user.companyId} />}
    </>
  );
}
