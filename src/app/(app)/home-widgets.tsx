import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock, ClipboardCheck, Gauge, HandCoins, Package, Wrench } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { slaHours, slaStatus, type Prio } from "@/lib/sla";
import { stockLevels } from "@/lib/stock";
import { cn, isoDate, toDateOnly } from "@/lib/utils";
import { Card } from "@/components/ui";
import { KpiScore } from "@/components/kpi-bits";
import { coverage, MIN_COVERAGE } from "@/lib/kpi";
import { taskWhere } from "@/server/workforce/access";
import { pendingApprovalsCount } from "@/server/finance/pending";
import { kpiTable } from "@/server/kpi/view";

type Item = { label: string; value: number | React.ReactNode; href: string; tone?: "danger" | "warning" | "success" };
type Widget = { key: string; title: string; icon: React.ReactNode; items: Item[] };
const DAY = 86400000;

/** "My day" blocks adapted to the user's permissions (role-based home). */
export async function HomeWidgets({ user, compact = false }: { user: CurrentUser; compact?: boolean }) {
  const t = await getTranslations("home");
  const today = toDateOnly(new Date());
  const widgets: Widget[] = [];

  if (can(user, "tasks.manage") || can(user, "inspections.perform") || can(user, "sessions.approve")) {
    const scope = taskWhere(user);
    const [overdue, dueToday, toInspect, sessions, myRemarks] = await Promise.all([
      db.task.count({ where: { AND: [scope, { status: { notIn: ["APPROVED", "CANCELLED", "COMPLETED", "INSPECTION"] }, deadline: { lt: today } }] } }),
      db.task.count({ where: { AND: [scope, { status: { notIn: ["APPROVED", "CANCELLED"] }, deadline: today }] } }),
      can(user, "inspections.perform") ? db.task.count({ where: { AND: [scope, { status: { in: ["COMPLETED", "INSPECTION"] } }] } }) : Promise.resolve(0),
      can(user, "sessions.approve") ? db.workSession.count({ where: { companyId: user.companyId, status: "SUBMITTED", task: scope } }) : Promise.resolve(0),
      db.remark.count({ where: { companyId: user.companyId, responsibleUserId: user.id, status: { not: "ACCEPTED" } } }),
    ]);
    widgets.push({
      key: "tasks",
      title: t("tasks"),
      icon: <CalendarClock className="size-4" />,
      items: [
        { label: t("overdue"), value: overdue, href: "/tasks?due=overdue", tone: overdue ? "danger" : undefined },
        { label: t("dueToday"), value: dueToday, href: "/calendar", tone: dueToday ? "warning" : undefined },
        ...(can(user, "inspections.perform") ? [{ label: t("toInspect"), value: toInspect, href: "/tasks?status=COMPLETED", tone: toInspect ? ("warning" as const) : undefined }] : []),
        ...(can(user, "sessions.approve") ? [{ label: t("sessionsToApprove"), value: sessions, href: "/tasks/sessions", tone: sessions ? ("warning" as const) : undefined }] : []),
        { label: t("myRemarks"), value: myRemarks, href: "/remarks?mine=1" },
      ],
    });
  }

  const extra: Item[] = [];
  if (can(user, "finance.approve")) {
    const n = await pendingApprovalsCount(user.companyId);
    extra.push({ label: t("approvals"), value: n, href: "/finance/approvals", tone: n ? "warning" : undefined });
  }
  if (can(user, "import.approve")) {
    const n = await db.smetaImport.count({ where: { companyId: user.companyId, status: "DRAFT" } });
    if (n) extra.push({ label: t("imports"), value: n, href: "/projects", tone: "warning" });
  }
  if (can(user, "outsource.verify")) {
    const n = await db.taskAssignment.count({ where: { kind: "CONTRACTOR", outsourceStatus: "COMPLETED", task: { companyId: user.companyId } } });
    extra.push({ label: t("outsourceToVerify"), value: n, href: "/contractors", tone: n ? "warning" : undefined });
  }
  if (can(user, "drawings.edit")) {
    const n = await db.drawingZone.count({ where: { needsReview: true, version: { drawing: { companyId: user.companyId } } } });
    if (n) extra.push({ label: t("zonesToReview"), value: n, href: "/projects", tone: "warning" });
  }
  if (extra.length) widgets.push({ key: "approvals", title: t("decisions"), icon: <ClipboardCheck className="size-4" />, items: extra });

  if (can(user, "service.view")) {
    const open = await db.serviceTicket.findMany({
      where: { companyId: user.companyId, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS"] }, planned: false },
      select: { reportedAt: true, respondedAt: true, resolvedAt: true, dueAt: true, priority: true, responsibleUserId: true, serviceContract: { select: { slaResponseHours: true, slaResolveHours: true } } },
    });
    const breached = open.filter((x) => slaStatus(x, slaHours(x.priority as Prio, x.serviceContract)).resolve === "BREACHED").length;
    const visits = await db.serviceTicket.count({ where: { companyId: user.companyId, planned: true, status: { in: ["NEW", "ASSIGNED"] }, dueAt: { lte: new Date(today.getTime() + 7 * DAY) } } });
    widgets.push({
      key: "service",
      title: t("service"),
      icon: <Wrench className="size-4" />,
      items: [
        { label: t("openTickets"), value: open.length, href: "/service" },
        { label: t("slaBreached"), value: breached, href: "/service", tone: breached ? "danger" : undefined },
        { label: t("myTickets"), value: open.filter((x) => x.responsibleUserId === user.id).length, href: "/service" },
        { label: t("visitsWeek"), value: visits, href: "/service?status=NEW" },
      ],
    });
  }

  if (can(user, "warehouse.view") || can(user, "procurement.view")) {
    const [levels, products, expected, late] = await Promise.all([
      stockLevels(user.companyId),
      db.product.findMany({ where: { companyId: user.companyId, active: true, minStock: { gt: 0 } }, select: { id: true, minStock: true } }),
      db.purchaseOrder.count({ where: { companyId: user.companyId, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { gte: today, lte: new Date(today.getTime() + 7 * DAY) } } }),
      db.purchaseOrder.count({ where: { companyId: user.companyId, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: today } } }),
    ]);
    const low = products.filter((p) => levels.filter((l) => l.productId === p.id).reduce((s, l) => s + l.qty, 0) < Number(p.minStock)).length;
    widgets.push({
      key: "supply",
      title: t("supply"),
      icon: <Package className="size-4" />,
      items: [
        { label: t("lowStock"), value: low, href: "/warehouse?low=1", tone: low ? "warning" : undefined },
        { label: t("poThisWeek"), value: expected, href: "/procurement" },
        { label: t("poLate"), value: late, href: "/procurement", tone: late ? "danger" : undefined },
      ],
    });
  }

  if (can(user, "kpi.view")) {
    const d = new Date();
    const month = isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))).slice(0, 7);
    const [emp, grp] = await Promise.all([kpiTable(user.companyId, "EMPLOYEE", month), kpiTable(user.companyId, "GROUP", month)]);
    const ok = emp.rows.filter((r) => coverage(r.components) >= MIN_COVERAGE && r.score !== null);
    const avg = ok.length ? ok.reduce((s, r) => s + r.score!, 0) / ok.length : null;
    const low = [...ok].sort((a, b) => a.score! - b.score!).slice(0, 3);
    const gAvg = grp.rows.length ? grp.rows.reduce((s, r) => s + (r.score ?? 0), 0) / grp.rows.length : null;
    widgets.push({
      key: "kpi",
      title: t("kpi", { month }),
      icon: <Gauge className="size-4" />,
      items: [
        { label: t("kpiEmployees"), value: <KpiScore value={avg} />, href: `/kpi?month=${month}` },
        { label: t("kpiGroups"), value: <KpiScore value={gAvg} />, href: `/kpi?subject=GROUP&month=${month}` },
        ...low.map((r) => ({ label: `↓ ${r.name}`, value: <KpiScore value={r.score} />, href: `/kpi/EMPLOYEE/${r.id}?month=${month}` })),
      ],
    });
  }

  if (can(user, "payroll.manage")) {
    const d = new Date();
    const month = isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))).slice(0, 7);
    const pm = await db.payrollMonth.findUnique({ where: { companyId_month: { companyId: user.companyId, month } } });
    widgets.push({
      key: "payroll",
      title: t("payroll"),
      icon: <HandCoins className="size-4" />,
      items: [{ label: t("payrollMonth", { month }), value: pm?.status === "CLOSED" ? "✓" : t("payrollOpen"), href: `/employees?tab=payroll&month=${month}`, tone: pm?.status === "CLOSED" ? "success" : "warning" }],
    });
  }

  // On the management dashboard only items that need attention are shown.
  const shown = compact
    ? widgets.map((w) => ({ ...w, items: w.items.filter((i) => typeof i.value !== "number" || i.value > 0).filter((i) => i.tone === "danger" || i.tone === "warning") })).filter((w) => w.items.length > 0)
    : widgets;
  if (shown.length === 0) return null;
  return (
    <div className={cn("mb-6 grid gap-4 md:grid-cols-2", compact ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
      {shown.map((w) => (
        <Card key={w.key} className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="text-primary">{w.icon}</span>
            {w.title}
          </div>
          <ul className="divide-y divide-border">
            {w.items.map((it) => (
              <li key={it.label}>
                <Link href={it.href} className="flex items-center justify-between gap-2 py-1.5 text-sm hover:text-primary">
                  <span className="truncate text-muted">{it.label}</span>
                  <span className={cn("num font-semibold", it.tone === "danger" && "text-danger", it.tone === "warning" && "text-warning", it.tone === "success" && "text-success")}>{it.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

