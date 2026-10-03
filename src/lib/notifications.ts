import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { can } from "./permissions";
import { computeMetrics } from "./metrics";
import { stockLevels } from "./stock";
import { projectMaterials } from "./materials";
import { toDateOnly } from "./utils";

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
  const finance = can(user.role, "finance.view");
  const out: Notification[] = [];

  const projects = await db.project.findMany({ where: { companyId, status: "ACTIVE" } });
  const metrics = await computeMetrics(projects);

  for (const p of projects) {
    const m = metrics.get(p.id)!;
    const params = { name: p.name };
    if (m.delayed) out.push({ key: `delay:${p.id}`, severity: "critical", message: "projectDelayed", params, href: `/projects/${p.id}`, date: p.plannedEndDate ?? undefined });
    else if (p.plannedEndDate && p.stage !== "COMPLETED" && p.plannedEndDate.getTime() - today.getTime() <= 14 * DAY)
      out.push({ key: `ending:${p.id}`, severity: "warning", message: "contractEnding", params, href: `/projects/${p.id}`, date: p.plannedEndDate });
    if (finance && m.overBudget) out.push({ key: `budget:${p.id}`, severity: "critical", message: "budgetOver", params, href: `/projects/${p.id}?tab=budget` });
    if (finance && m.marginDrop) out.push({ key: `margin:${p.id}`, severity: "warning", message: "marginDrop", params, href: `/projects/${p.id}` });
  }

  if (finance || can(user.role, "payments.edit")) {
    const milestones = await db.paymentMilestone.findMany({
      where: { project: { companyId, status: "ACTIVE" }, dueDate: { lt: today } },
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
          href: `/projects/${ms.projectId}?tab=payments`,
          date: ms.dueDate ?? undefined,
        });
    }
  }

  if (can(user.role, "warehouse.view")) {
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

  if (can(user.role, "procurement.view")) {
    const orders = await db.purchaseOrder.findMany({
      where: { companyId, status: { in: ["ORDERED", "PARTIAL", "RECEIVED"] } },
      include: { supplier: { select: { name: true } }, payments: { select: { amountUzs: true } } },
    });
    for (const o of orders) {
      const params = { number: o.number, supplier: o.supplier.name };
      if (o.status !== "RECEIVED" && o.expectedDate && o.expectedDate < today)
        out.push({ key: `po:${o.id}`, severity: "critical", message: "poOverdue", params, href: `/procurement/${o.id}`, date: o.expectedDate });
      const paid = o.payments.reduce((s, p) => s + Number(p.amountUzs), 0);
      if (
        (finance || can(user.role, "supplierPayments.edit")) &&
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

  if (can(user.role, "projects.view")) {
    const company = await db.company.findUnique({ where: { id: companyId }, select: { overuseThreshold: true } });
    const withUse = await db.project.findMany({
      where: { companyId, status: "ACTIVE", movements: { some: { type: "CONSUMPTION" } } },
      select: { id: true, name: true },
    });
    for (const p of withUse) {
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

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
