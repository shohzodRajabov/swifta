import "server-only";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { toDateOnly } from "@/lib/utils";
import type { CurrentUser } from "@/lib/auth";
import { stockLevels } from "@/lib/stock";
import { computeMetrics } from "@/lib/metrics";
import { missingDocsByProject } from "@/server/projects/missing-docs";
import { pendingApprovalsCount } from "@/server/finance/pending";

export type AttentionItem = { key: string; count: number; href: string; tone: "danger" | "warning" };

/** "Attention required" counters for the dashboard (only non-zero items are returned). */
export async function attentionCounts(user: CurrentUser, projectIds: string[]): Promise<AttentionItem[]> {
  const today = toDateOnly(new Date());
  const openTask = { notIn: ["APPROVED", "CANCELLED"] as ("APPROVED" | "CANCELLED")[] };
  const inProjects = { projectId: { in: projectIds } };
  const [overdueTasks, dueToday, inspections, remarks, sessionsToApprove, unconfirmed, contractorToVerify, missing] =
    await Promise.all([
      db.task.count({ where: { ...inProjects, status: openTask, deadline: { lt: today } } }),
      db.task.count({ where: { ...inProjects, status: openTask, deadline: today } }),
      db.task.count({ where: { ...inProjects, status: "INSPECTION" } }),
      db.remark.count({ where: { ...inProjects, status: { notIn: ["ACCEPTED"] } } }),
      can(user, "sessions.approve") ? db.workSession.count({ where: { ...inProjects, status: "SUBMITTED" } }) : 0,
      db.workSessionMember.count({ where: { confirmation: "PENDING", session: { ...inProjects, date: { lt: today } } } }),
      db.taskAssignment.count({ where: { kind: "CONTRACTOR", outsourceStatus: "COMPLETED", task: inProjects } }),
      missingDocsByProject(user.companyId, projectIds).then((m) => m.size),
    ]);

  let lowStock = 0;
  if (can(user, "warehouse.view")) {
    const [levels, products] = await Promise.all([
      stockLevels(user.companyId),
      db.product.findMany({ where: { companyId: user.companyId, active: true, minStock: { gt: 0 } }, select: { id: true, minStock: true } }),
    ]);
    lowStock = products.filter((p) => levels.filter((l) => l.productId === p.id).reduce((s, l) => s + l.qty, 0) < Number(p.minStock)).length;
  }
  let overduePayments = 0;
  if (can(user, "finance.view")) {
    const projects = await db.project.findMany({ where: { id: { in: projectIds } } });
    const metrics = await computeMetrics(projects);
    overduePayments = [...metrics.values()].filter((m) => m.overdueDebt.uzs > 0).length;
  }
  const pending = can(user, "finance.approve") ? await pendingApprovalsCount(user.companyId) : 0;

  const items: AttentionItem[] = [
    { key: "overdueTasks", count: overdueTasks, href: "/tasks?due=overdue", tone: "danger" },
    { key: "dueToday", count: dueToday, href: "/tasks?due=today", tone: "warning" },
    { key: "inspections", count: inspections, href: "/tasks?status=INSPECTION", tone: "warning" },
    { key: "remarks", count: remarks, href: "/remarks", tone: "warning" },
    { key: "sessionsToApprove", count: sessionsToApprove, href: "/sessions?status=SUBMITTED", tone: "warning" },
    { key: "unconfirmed", count: unconfirmed, href: "/sessions?confirmation=PENDING", tone: "warning" },
    { key: "contractorToVerify", count: contractorToVerify, href: "/contractors?verify=1", tone: "warning" },
    { key: "materialShortage", count: lowStock, href: "/warehouse?low=1", tone: "danger" },
    { key: "overduePayments", count: overduePayments, href: "/finance?tab=receivables", tone: "danger" },
    { key: "pendingApprovals", count: pending, href: "/finance/approvals", tone: "warning" },
    { key: "missingDocs", count: missing, href: "/projects", tone: "warning" },
  ];
  return items.filter((i) => i.count > 0);
}
