import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { can } from "./permissions";
import { computeMetrics } from "./metrics";
import { stockLevels } from "./stock";
import { projectMaterials } from "./materials";
import { toDateOnly } from "./utils";
import { projectWhere } from "@/server/projects/access";
import { missingDocsByProject } from "@/server/projects/missing-docs";
import { slaHours, slaStatus, type Prio } from "./sla";

/**
 * Notifications are derived from the current data on every request, so they are always accurate
 * and disappear on their own once the underlying problem is fixed.
 */
export type Notification = {
  key: string;
  severity: "critical" | "warning";
  message: string; // key in the `notifications` namespace
  params: Record<string, string>;
  href: string;
  date?: Date;
};

const DAY = 86400000;

export async function getNotifications(user: CurrentUser): Promise<Notification[]> {
  const companyId = user.companyId;
  const today = toDateOnly(new Date());
  const finance = can(user, "finance.view");
  const out: Notification[] = [];

  const projects = await db.project.findMany({ where: { AND: [projectWhere(user), { status: "ACTIVE" }] } });
  const ids = projects.map((p) => p.id);
  const [metrics, missing] = await Promise.all([computeMetrics(projects), missingDocsByProject(companyId, ids)]);

  for (const p of projects) {
    const m = metrics.get(p.id)!;
    const params = { name: p.name };
    if (m.delayed) out.push({ key: `delay:${p.id}`, severity: "critical", message: "projectDelayed", params, href: `/projects/${p.id}`, date: p.plannedEndDate ?? undefined });
    else if (p.plannedEndDate && !m.finished && p.plannedEndDate.getTime() - today.getTime() <= 14 * DAY)
      out.push({ key: `ending:${p.id}`, severity: "warning", message: "contractEnding", params, href: `/projects/${p.id}`, date: p.plannedEndDate });
    if (finance && m.overBudget) out.push({ key: `budget:${p.id}`, severity: "critical", message: "budgetOver", params, href: `/projects/${p.id}?tab=budget` });
    if (finance && m.marginDrop) out.push({ key: `margin:${p.id}`, severity: "warning", message: "marginDrop", params, href: `/projects/${p.id}` });
    if (missing.has(p.id))
      out.push({ key: `docs:${p.id}`, severity: "warning", message: "documentMissing", params, href: `/projects/${p.id}?tab=documents` });
    if (p.warrantyEnd && p.warrantyEnd >= today && p.warrantyEnd.getTime() - today.getTime() <= 30 * DAY)
      out.push({ key: `warranty:${p.id}`, severity: "warning", message: "warrantyEnding", params, href: `/projects/${p.id}`, date: p.warrantyEnd });
  }

  if (finance || can(user, "payments.edit")) {
    const milestones = await db.paymentMilestone.findMany({
      where: { projectId: { in: ids }, dueDate: { lt: today } },
      include: { project: { select: { id: true, name: true } } },
    });
    for (const ms of milestones) {
      const m = metrics.get(ms.projectId);
      if (m && m.overdueDebt.uzs > 0.5)
        out.push({
          key: `ms:${ms.id}`,
          severity: "critical",
          message: "milestoneOverdue",
          params: { name: ms.project.name, milestone: ms.name },
          href: `/projects/${ms.projectId}?tab=revenue`,
          date: ms.dueDate ?? undefined,
        });
    }
  }

  // Tasks assigned to me / overdue / inspections waiting for me
  const empId = user.employee?.id;
  const myTasks = await db.task.findMany({
    where: {
      projectId: { in: ids },
      status: { notIn: ["APPROVED", "CANCELLED"] },
      OR: [
        { responsibleId: user.id },
        { inspectorId: user.id, status: "INSPECTION" },
        { approverId: user.id, status: "INSPECTION" },
        ...(empId
          ? [{ assignments: { some: { OR: [{ employeeId: empId }, { group: { members: { some: { employeeId: empId, toDate: null } } } }] } } }]
          : []),
      ],
    },
    select: { id: true, number: true, title: true, status: true, deadline: true, inspectorId: true, approverId: true, createdAt: true },
    take: 200,
  });
  for (const tk of myTasks) {
    const params = { task: `#${tk.number} ${tk.title}` };
    if (tk.status === "INSPECTION" && (tk.inspectorId === user.id || tk.approverId === user.id))
      out.push({ key: `insp:${tk.id}`, severity: "warning", message: "inspectionRequested", params, href: `/tasks/${tk.id}` });
    if (tk.deadline && tk.deadline < today)
      out.push({ key: `overdue:${tk.id}`, severity: "critical", message: "taskOverdue", params, href: `/tasks/${tk.id}`, date: tk.deadline });
    else if (tk.deadline && tk.deadline.getTime() === today.getTime())
      out.push({ key: `today:${tk.id}`, severity: "warning", message: "taskDueToday", params, href: `/tasks/${tk.id}`, date: tk.deadline });
    else if (tk.deadline && tk.deadline.getTime() - today.getTime() <= 2 * DAY)
      out.push({ key: `soon:${tk.id}`, severity: "warning", message: "deadlineApproaching", params, href: `/tasks/${tk.id}`, date: tk.deadline });
    if (tk.status === "ASSIGNED" && Date.now() - tk.createdAt.getTime() < 3 * DAY)
      out.push({ key: `assigned:${tk.id}`, severity: "warning", message: "taskAssigned", params, href: `/tasks/${tk.id}` });
    if (tk.status === "REWORK") out.push({ key: `rework:${tk.id}`, severity: "critical", message: "rework", params, href: `/tasks/${tk.id}` });
  }

  // Remarks assigned to me
  const myRemarks = await db.remark.findMany({
    where: { companyId, responsibleUserId: user.id, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS"] } },
    select: { id: true, number: true, description: true, deadline: true },
    take: 100,
  });
  for (const r of myRemarks)
    out.push({
      key: `remark:${r.id}`,
      severity: r.deadline && r.deadline < today ? "critical" : "warning",
      message: "remarkCreated",
      params: { remark: `#${r.number} ${r.description.slice(0, 60)}` },
      href: `/remarks/${r.id}`,
      date: r.deadline ?? undefined,
    });

  // Work sessions waiting for my confirmation
  if (empId) {
    const pending = await db.workSessionMember.findMany({
      where: { employeeId: empId, confirmation: "PENDING" },
      include: { session: { select: { id: true, date: true, task: { select: { title: true } } } } },
      take: 50,
    });
    for (const p of pending)
      out.push({
        key: `confirm:${p.id}`,
        severity: "warning",
        message: "confirmSession",
        params: { task: p.session.task.title },
        href: `/me`,
        date: p.session.date,
      });
  }

  if (can(user, "warehouse.view")) {
    const [levels, products] = await Promise.all([
      stockLevels(companyId),
      db.product.findMany({ where: { companyId, active: true, minStock: { gt: 0 } } }),
    ]);
    for (const p of products) {
      const qty = levels.filter((l) => l.productId === p.id).reduce((s, l) => s + l.qty, 0);
      if (qty < Number(p.minStock))
        out.push({ key: `low:${p.id}`, severity: "warning", message: "lowStock", params: { name: p.name }, href: "/warehouse?low=1" });
    }
  }

  if (can(user, "procurement.view")) {
    const orders = await db.purchaseOrder.findMany({
      where: { companyId, status: { in: ["ORDERED", "PARTIAL", "RECEIVED"] } },
      include: { supplier: { select: { name: true } }, payments: { where: { approval: "APPROVED" }, select: { amountUzs: true } } },
    });
    for (const o of orders) {
      const params = { number: o.number, supplier: o.supplier.name };
      if (o.status !== "RECEIVED" && o.expectedDate && o.expectedDate < today)
        out.push({ key: `po:${o.id}`, severity: "critical", message: "poOverdue", params, href: `/procurement/${o.id}`, date: o.expectedDate });
      const paid = o.payments.reduce((s, p) => s + Number(p.amountUzs), 0);
      if (
        (finance || can(user, "supplierPayments.edit")) &&
        o.paymentDueDate &&
        o.paymentDueDate.getTime() - today.getTime() <= 3 * DAY &&
        paid + 0.5 < Number(o.totalUzs)
      )
        out.push({
          key: `pay:${o.id}`,
          severity: o.paymentDueDate < today ? "critical" : "warning",
          message: "supplierPaymentDue",
          params,
          href: `/suppliers/${o.supplierId}`,
          date: o.paymentDueDate,
        });
    }
  }

  if (can(user, "outsource.verify")) {
    const done = await db.taskAssignment.findMany({
      where: { kind: "CONTRACTOR", outsourceStatus: "COMPLETED", task: { projectId: { in: ids } } },
      include: { contractor: { select: { name: true } }, task: { select: { id: true, title: true } } },
      take: 50,
    });
    for (const a of done)
      out.push({
        key: `contractor:${a.id}`,
        severity: "warning",
        message: "contractorTaskCompleted",
        params: { contractor: a.contractor?.name ?? "", task: a.task.title },
        href: `/tasks/${a.task.id}`,
      });
  }

  if (can(user, "finance.approve")) {
    const [e, o, s, c] = await Promise.all([
      db.expense.count({ where: { project: { companyId }, approval: "PENDING" } }),
      db.overheadExpense.count({ where: { companyId, approval: "PENDING" } }),
      db.supplierPayment.count({ where: { supplier: { companyId }, approval: "PENDING" } }),
      db.contractorPayment.count({ where: { contractor: { companyId }, approval: "PENDING" } }),
    ]);
    const n = e + o + s + c;
    if (n > 0) out.push({ key: "approvals", severity: "warning", message: "pendingApprovals", params: { n: String(n) }, href: "/finance/approvals" });
  }

  if (can(user, "projects.view")) {
    const company = await db.company.findUnique({ where: { id: companyId }, select: { overuseThreshold: true } });
    const withUse = projects.filter((p) => p.id); // all accessible active projects
    const consumed = await db.stockMovement.groupBy({
      by: ["projectId"],
      where: { projectId: { in: withUse.map((p) => p.id) }, type: "CONSUMPTION" },
    });
    for (const row of consumed) {
      const p = projects.find((x) => x.id === row.projectId);
      if (!p) continue;
      for (const r of await projectMaterials(p.id, Number(company?.overuseThreshold ?? 5))) {
        if (r.overuse)
          out.push({
            key: `over:${p.id}:${r.key}`,
            severity: "critical",
            message: "overuse",
            params: { name: p.name, material: r.name },
            href: `/projects/${p.id}?tab=materials`,
          });
      }
    }
  }

  // Service: SLA breaches, visits due soon (mine), contracts ending.
  if (can(user, "service.view")) {
    const tickets = await db.serviceTicket.findMany({
      where: { companyId, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS"] } },
      select: { id: true, number: true, title: true, planned: true, priority: true, reportedAt: true, respondedAt: true, resolvedAt: true, dueAt: true, responsibleUserId: true, serviceContract: { select: { slaResponseHours: true, slaResolveHours: true, slaBusinessHours: true } } },
    });
    for (const x of tickets) {
      const params = { ticket: `S-${x.number} ${x.title}` };
      if (x.planned) {
        if (x.responsibleUserId === user.id && x.dueAt && x.dueAt.getTime() - today.getTime() <= 3 * DAY)
          out.push({ key: `visit:${x.id}`, severity: "warning", message: "serviceVisitDue", params, href: `/service/tickets/${x.id}`, date: x.dueAt });
        continue;
      }
      const sla = slaStatus(x, slaHours(x.priority as Prio, x.serviceContract));
      if (sla.response === "BREACHED" || sla.resolve === "BREACHED")
        out.push({ key: `sla:${x.id}`, severity: "critical", message: "serviceSlaBreached", params, href: `/service/tickets/${x.id}`, date: sla.resolveDue });
      else if (!x.responsibleUserId)
        out.push({ key: `ticket:${x.id}`, severity: "warning", message: "serviceTicketNew", params, href: `/service/tickets/${x.id}` });
    }
    const contracts = await db.serviceContract.findMany({
      where: { companyId, status: "ACTIVE", endDate: { gte: today, lte: new Date(today.getTime() + 30 * DAY) } },
      select: { id: true, number: true, endDate: true, client: { select: { name: true } } },
    });
    for (const c of contracts)
      out.push({ key: `sc:${c.id}`, severity: "warning", message: "serviceContractEnding", params: { number: c.number, client: c.client.name }, href: `/service/contracts/${c.id}`, date: c.endDate });
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
