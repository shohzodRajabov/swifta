import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Pencil } from "lucide-react";
import type { ProjectStage } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { DelayedBadge, PriorityBadge, StageBadge, StatusBadge } from "@/components/project-bits";
import { StageTimeline } from "./stage-timeline";
import { StageForm } from "./stage-form";
import { changeStage } from "../actions";
import { OverviewTab } from "./tabs/overview";
import { BomTab } from "./tabs/bom";
import { BudgetTab } from "./tabs/budget";
import { PaymentsTab } from "./tabs/payments";
import { ExpensesTab } from "./tabs/expenses";
import { HistoryTab } from "./tabs/history";

const TABS = ["overview", "bom", "budget", "payments", "expenses", "history"] as const;
type Tab = (typeof TABS)[number];

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const { tab: rawTab } = (await searchParams) as { tab?: string };
  const user = await requirePermission("projects.view");
  const project = await db.project.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      client: true,
      manager: { select: { name: true } },
      engineer: { select: { name: true } },
      stageEvents: { orderBy: { enteredAt: "asc" } },
    },
  });
  if (!project) notFound();
  const t = await getTranslations();
  const m = (await computeMetrics([project])).get(project.id)!;

  const finance = can(user.role, "finance.view");
  const visible: Record<Tab, boolean> = {
    overview: true,
    bom: true,
    budget: finance,
    payments: finance || can(user.role, "payments.edit"),
    expenses: finance || can(user.role, "expenses.edit"),
    history: can(user.role, "audit.view") || can(user.role, "projects.edit"),
  };
  const tab: Tab = TABS.includes(rawTab as Tab) && visible[rawTab as Tab] ? (rawTab as Tab) : "overview";
  const tabLabel: Record<Tab, string> = {
    overview: t("projects.tabOverview"),
    bom: t("projects.tabBom"),
    budget: t("projects.tabBudget"),
    payments: t("projects.tabPayments"),
    expenses: t("projects.tabExpenses"),
    history: t("projects.tabHistory"),
  };

  const reached = new Map<ProjectStage, Date>();
  for (const e of project.stageEvents) reached.set(e.stage, e.enteredAt);

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
            <StageBadge stage={project.stage} />
            <StatusBadge status={project.status} />
            {project.priority !== "MEDIUM" && <PriorityBadge priority={project.priority} />}
            {m.delayed && <DelayedBadge />}
          </div>
        }
        actions={
          can(user.role, "projects.edit") && (
            <LinkButton href={`/projects/${project.id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden />
              {t("common.edit")}
            </LinkButton>
          )
        }
      />

      <Card className="mb-6 p-4">
        <StageTimeline stage={project.stage} reached={reached} />
        {can(user.role, "projects.stage") && (
          <div className="mt-3 border-t border-border pt-3">
            <StageForm action={changeStage.bind(null, project.id)} stage={project.stage} />
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
      {tab === "bom" && <BomTab user={user} projectId={project.id} />}
      {tab === "budget" && <BudgetTab user={user} projectId={project.id} metrics={m} />}
      {tab === "payments" && <PaymentsTab user={user} projectId={project.id} metrics={m} />}
      {tab === "expenses" && <ExpensesTab user={user} projectId={project.id} />}
      {tab === "history" && <HistoryTab projectId={project.id} companyId={user.companyId} />}
    </>
  );
}
