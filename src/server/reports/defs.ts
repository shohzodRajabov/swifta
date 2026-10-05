import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";
import { computeMetrics } from "@/lib/metrics";
import { projectMaterials } from "@/lib/materials";
import { averageCost, stockLevels } from "@/lib/stock";
import { slaHours, slaStatus, type Prio } from "@/lib/sla";
import { coverage, MIN_COVERAGE, type RuleComponent } from "@/lib/kpi";
import { toDateOnly } from "@/lib/utils";
import { projectWhere } from "@/server/projects/access";
import { projectProgress } from "@/server/projects/progress";
import { computePnl } from "@/server/finance/pnl";
import { efficiencyIndexes } from "@/server/workforce/efficiency";
import { deadlineState } from "@/server/workforce/tasks";
import { contractorScores } from "@/server/contractors/score";
import { contractorBalances } from "@/server/contractors/balances";
import { taskSummaries } from "@/server/drawings/drawings";
import { ticketCost } from "@/server/service/service";
import { computeSubject, ruleFor } from "@/server/kpi/compute";

export type ColType = "text" | "int" | "num" | "money" | "pct" | "date" | "badge";
/** `label` is a translation key; `labelParams` optional. Values in rows are plain (string / number / Date / null). */
export type Col = { key: string; label: string; type?: ColType };
export type Row = Record<string, string | number | Date | null> & { _href?: string; _tone?: "danger" | "warning" | "success" | null };
export type ReportData = { columns: Col[]; rows: Row[]; totals?: Row; note?: string };
export type ReportCtx = { user: CurrentUser; from: Date | null; to: Date | null; projectId: string | null; month: string };
export type ReportDef = {
  key: string;
  group: "projects" | "finance" | "people" | "supply" | "quality" | "service";
  perms: Permission[];
  filters: ("period" | "project" | "month")[];
  run: (ctx: ReportCtx) => Promise<ReportData>;
};

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const DAY = 86400000;
const range = (c: ReportCtx) => (c.from || c.to ? { ...(c.from ? { gte: c.from } : {}), ...(c.to ? { lte: c.to } : {}) } : undefined);
const projectsFor = (c: ReportCtx): Prisma.ProjectWhereInput => ({ AND: [projectWhere(c.user), c.projectId ? { id: c.projectId } : {}] });
const sum = (rows: Row[], key: string) => rows.reduce((s, r) => s + n(r[key]), 0);

export const REPORTS: ReportDef[] = [
  // ---------------------------------------------------------------- projects
  {
    key: "projects",
    group: "projects",
    perms: ["finance.view"],
    filters: ["project"],
    async run(c) {
      const projects = await db.project.findMany({
        where: { AND: [projectsFor(c), { status: { not: "CANCELLED" } }] },
        include: { client: { select: { name: true } }, statusDef: { include: { group: true } } },
        orderBy: { code: "asc" },
      });
      const [metrics, progress] = await Promise.all([computeMetrics(projects), projectProgress(projects.map((p) => p.id))]);
      const rows: Row[] = projects.map((p) => {
        const m = metrics.get(p.id)!;
        return {
          _href: `/projects/${p.id}`,
          _tone: m.delayed || m.overBudget ? "danger" : m.marginDrop ? "warning" : null,
          code: p.code,
          name: p.name,
          client: p.client.name,
          status: p.statusDef ? `${p.statusDef.group.letter}. ${p.statusDef.name}` : "—",
          progress: progress.get(p.id)?.percent ?? null,
          contract: m.contractTotalGross.uzs,
          acts: m.revenue.actual.uzs,
          received: m.received.uzs,
          receivable: m.receivable.uzs,
          advance: m.advance.uzs,
          costPlan: m.cost.plan.uzs,
          costForecast: m.cost.forecast.uzs,
          costActual: m.cost.actual.uzs,
          profit: m.profit.forecast.uzs,
          margin: m.margin.forecast,
          end: p.plannedEndDate,
        };
      });
      const totals: Row = { code: "", name: "", contract: sum(rows, "contract"), acts: sum(rows, "acts"), received: sum(rows, "received"), receivable: sum(rows, "receivable"), advance: sum(rows, "advance"), costPlan: sum(rows, "costPlan"), costForecast: sum(rows, "costForecast"), costActual: sum(rows, "costActual"), profit: sum(rows, "profit") };
      return {
        columns: [
          { key: "code", label: "reports.col.code" },
          { key: "name", label: "reports.col.project" },
          { key: "client", label: "reports.col.client" },
          { key: "status", label: "reports.col.status" },
          { key: "progress", label: "reports.col.progress", type: "pct" },
          { key: "contract", label: "reports.col.contract", type: "money" },
          { key: "acts", label: "reports.col.acts", type: "money" },
          { key: "received", label: "reports.col.received", type: "money" },
          { key: "receivable", label: "reports.col.receivable", type: "money" },
          { key: "advance", label: "reports.col.advance", type: "money" },
          { key: "costPlan", label: "reports.col.costPlan", type: "money" },
          { key: "costForecast", label: "reports.col.costForecast", type: "money" },
          { key: "costActual", label: "reports.col.costActual", type: "money" },
          { key: "profit", label: "reports.col.profitForecast", type: "money" },
          { key: "margin", label: "reports.col.margin", type: "pct" },
          { key: "end", label: "reports.col.plannedEnd", type: "date" },
        ],
        rows,
        totals,
      };
    },
  },
  // ---------------------------------------------------------------- finance (P&L by month)
  {
    key: "finance",
    group: "finance",
    perms: ["finance.view"],
    filters: ["period"],
    async run(c) {
      const pnl = await computePnl(c.user.companyId, c.from, c.to);
      const rows: Row[] = pnl.months.map((m) => ({ month: m.month, revenue: m.revenue, direct: m.direct, gross: m.revenue - m.direct, overhead: m.overhead, net: m.net, _tone: m.net < 0 ? "danger" : null }));
      const cats: Row[] = Object.entries(pnl.directByCategory).map(([k, v]) => ({ month: `cat:${k}`, direct: v.uzs }));
      return {
        columns: [
          { key: "month", label: "reports.col.month" },
          { key: "revenue", label: "reports.col.revenue", type: "money" },
          { key: "direct", label: "reports.col.direct", type: "money" },
          { key: "gross", label: "reports.col.gross", type: "money" },
          { key: "overhead", label: "reports.col.overhead", type: "money" },
          { key: "net", label: "reports.col.operating", type: "money" },
        ],
        rows: [...rows, ...cats],
        totals: { month: "", revenue: pnl.total.revenue.uzs, direct: pnl.total.direct.uzs, gross: pnl.total.gross.uzs, overhead: pnl.total.overhead.uzs, net: pnl.total.operating.uzs },
        note: "reports.financeNote",
      };
    },
  },
  // ---------------------------------------------------------------- employees
  {
    key: "employees",
    group: "people",
    perms: ["employees.view", "kpi.view"],
    filters: ["month"],
    async run(c) {
      const { from, to } = monthRange(c.month);
      const [employees, members, days, eff, rule] = await Promise.all([
        db.employee.findMany({ where: { companyId: c.user.companyId, active: true }, orderBy: { fullName: "asc" } }),
        db.workSessionMember.findMany({ where: { session: { companyId: c.user.companyId, date: { gte: from, lte: to }, status: { not: "REJECTED" } } }, select: { employeeId: true, hours: true, contributionQty: true, laborCostUzs: true } }),
        db.attendanceDay.findMany({ where: { companyId: c.user.companyId, date: { gte: from, lte: to } }, select: { employeeId: true, type: true } }),
        efficiencyIndexes(c.user.companyId),
        ruleFor(db, c.user.companyId, "EMPLOYEE", c.month),
      ]);
      const kpi = rule ? await computeSubject(db, c.user.companyId, "EMPLOYEE", c.month, rule.components as RuleComponent[]) : [];
      const showCost = can(c.user, "salaries.view") || can(c.user, "finance.view");
      const rows: Row[] = employees.map((e) => {
        const ms = members.filter((m) => m.employeeId === e.id);
        const ds = days.filter((d) => d.employeeId === e.id);
        const k = kpi.find((x) => x.id === e.id);
        return {
          _href: `/employees/${e.id}`,
          name: e.fullName,
          position: e.position ?? "",
          sessions: ms.length,
          hours: ms.reduce((s, m) => s + n(m.hours), 0),
          workedDays: ds.filter((d) => !["ABSENT", "LEAVE", "SICK"].includes(d.type)).length,
          absent: ds.filter((d) => d.type === "ABSENT").length,
          efficiency: eff.get(e.id)?.index ?? null,
          kpi: k && coverage(k.components) >= MIN_COVERAGE ? k.score : null,
          ...(showCost ? { labor: ms.reduce((s, m) => s + n(m.laborCostUzs), 0) } : {}),
          _tone: k?.score !== null && k?.score !== undefined && k.score < 70 ? "danger" : null,
        };
      });
      return {
        columns: [
          { key: "name", label: "reports.col.employee" },
          { key: "position", label: "reports.col.position" },
          { key: "sessions", label: "reports.col.sessions", type: "int" },
          { key: "hours", label: "reports.col.hours", type: "num" },
          { key: "workedDays", label: "reports.col.workedDays", type: "int" },
          { key: "absent", label: "reports.col.absent", type: "int" },
          { key: "efficiency", label: "reports.col.efficiency", type: "num" },
          { key: "kpi", label: "reports.col.kpi", type: "pct" },
          ...(showCost ? [{ key: "labor", label: "reports.col.laborCost", type: "money" as const }] : []),
        ],
        rows,
      };
    },
  },
  // ---------------------------------------------------------------- groups
  {
    key: "groups",
    group: "people",
    perms: ["employees.view", "kpi.view"],
    filters: ["month"],
    async run(c) {
      const { from, to } = monthRange(c.month);
      const [groups, sessions, rule] = await Promise.all([
        db.workGroup.findMany({ where: { companyId: c.user.companyId }, orderBy: { name: "asc" }, include: { members: { where: { toDate: null } } } }),
        db.workSession.findMany({ where: { companyId: c.user.companyId, date: { gte: from, lte: to }, status: { not: "REJECTED" }, groupId: { not: null } }, select: { groupId: true, taskId: true, laborCostUzs: true, members: { select: { hours: true } } } }),
        ruleFor(db, c.user.companyId, "GROUP", c.month),
      ]);
      const kpi = rule ? await computeSubject(db, c.user.companyId, "GROUP", c.month, rule.components as RuleComponent[]) : [];
      const rows: Row[] = groups.map((g) => {
        const ss = sessions.filter((s) => s.groupId === g.id);
        const k = kpi.find((x) => x.id === g.id);
        const comp = (key: string) => k?.components.find((x) => x.key === key)?.value ?? null;
        return {
          _href: `/employees/groups/${g.id}`,
          name: g.name,
          members: g.members.length,
          sessions: ss.length,
          tasks: new Set(ss.map((s) => s.taskId)).size,
          hours: ss.reduce((s, x) => s + x.members.reduce((a, m) => a + n(m.hours), 0), 0),
          labor: ss.reduce((s, x) => s + n(x.laborCostUzs), 0),
          deadline: comp("deadline"),
          firstPass: comp("firstPass"),
          kpi: k?.score ?? null,
        };
      });
      return {
        columns: [
          { key: "name", label: "reports.col.group" },
          { key: "members", label: "reports.col.members", type: "int" },
          { key: "sessions", label: "reports.col.sessions", type: "int" },
          { key: "tasks", label: "reports.col.tasks", type: "int" },
          { key: "hours", label: "reports.col.hours", type: "num" },
          { key: "labor", label: "reports.col.laborCost", type: "money" },
          { key: "deadline", label: "reports.col.onTime", type: "pct" },
          { key: "firstPass", label: "reports.col.firstPass", type: "pct" },
          { key: "kpi", label: "reports.col.kpi", type: "pct" },
        ],
        rows,
      };
    },
  },
  // ---------------------------------------------------------------- contractors
  {
    key: "contractors",
    group: "people",
    perms: ["contractors.view"],
    filters: [],
    async run(c) {
      const contractors = await db.contractor.findMany({ where: { companyId: c.user.companyId }, orderBy: { name: "asc" } });
      const ids = contractors.map((x) => x.id);
      const [scores, balances] = await Promise.all([contractorScores(c.user.companyId, ids), contractorBalances(c.user.companyId, ids)]);
      const money = can(c.user, "finance.view") || can(c.user, "contractorPayments.edit");
      const rows: Row[] = contractors.map((x) => {
        const s = scores.get(x.id);
        const b = balances.get(x.id);
        const st = s?.stats;
        return {
          _href: `/contractors/${x.id}`,
          _tone: x.availability === "BLACKLISTED" ? "danger" : null,
          name: x.name,
          specs: x.specializations.join(", "),
          completed: st?.verified ?? 0,
          onTime: st?.withDeadline ? (st.onTime / st.withDeadline) * 100 : null,
          quality: st?.avgQuality ?? null,
          rework: st && st.total - st.active > 0 ? Math.min(100, (st.reworked / (st.total - st.active)) * 100) : null,
          rating: s?.rating ?? null,
          reliability: s?.reliability ?? null,
          ...(money ? { cost: b?.completed.uzs ?? 0, paid: b?.paid.uzs ?? 0, outstanding: b?.payable.uzs ?? 0 } : {}),
        };
      });
      return {
        columns: [
          { key: "name", label: "reports.col.contractor" },
          { key: "specs", label: "reports.col.specs" },
          { key: "completed", label: "reports.col.completed", type: "int" },
          { key: "onTime", label: "reports.col.onTime", type: "pct" },
          { key: "quality", label: "reports.col.quality", type: "num" },
          { key: "rework", label: "reports.col.reworkPct", type: "pct" },
          { key: "rating", label: "reports.col.rating", type: "num" },
          { key: "reliability", label: "reports.col.reliability", type: "pct" },
          ...(money
            ? ([
                { key: "cost", label: "reports.col.totalCost", type: "money" },
                { key: "paid", label: "reports.col.paid", type: "money" },
                { key: "outstanding", label: "reports.col.outstanding", type: "money" },
              ] as Col[])
            : []),
        ],
        rows,
      };
    },
  },
  // ---------------------------------------------------------------- materials
  {
    key: "materials",
    group: "supply",
    perms: ["projects.view"],
    filters: ["project"],
    async run(c) {
      const projects = await db.project.findMany({ where: { AND: [projectsFor(c), { bomItems: { some: {} } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } });
      const company = await db.company.findUniqueOrThrow({ where: { id: c.user.companyId }, select: { overuseThreshold: true } });
      const rows: Row[] = [];
      for (const p of projects) {
        for (const m of await projectMaterials(p.id, n(company.overuseThreshold))) {
          rows.push({
            _href: `/projects/${p.id}?tab=materials`,
            _tone: m.overuse ? "danger" : null,
            project: p.name,
            name: m.name,
            unit: m.unit,
            planned: m.planned,
            ordered: m.ordered,
            received: m.received,
            issued: m.issued,
            used: m.used,
            onSite: m.onSite,
            variance: m.variance,
          });
        }
      }
      return {
        columns: [
          { key: "project", label: "reports.col.project" },
          { key: "name", label: "reports.col.material" },
          { key: "unit", label: "reports.col.unit" },
          { key: "planned", label: "reports.col.planned", type: "num" },
          { key: "ordered", label: "reports.col.ordered", type: "num" },
          { key: "received", label: "reports.col.receivedQty", type: "num" },
          { key: "issued", label: "reports.col.issued", type: "num" },
          { key: "used", label: "reports.col.used", type: "num" },
          { key: "onSite", label: "reports.col.onSite", type: "num" },
          { key: "variance", label: "reports.col.variance", type: "num" },
        ],
        rows,
      };
    },
  },
  // ---------------------------------------------------------------- warehouse
  {
    key: "warehouse",
    group: "supply",
    perms: ["warehouse.view"],
    filters: [],
    async run(c) {
      const [levels, products, warehouses] = await Promise.all([
        stockLevels(c.user.companyId),
        db.product.findMany({ where: { companyId: c.user.companyId }, orderBy: { name: "asc" } }),
        db.warehouse.findMany({ where: { companyId: c.user.companyId }, select: { id: true, name: true } }),
      ]);
      const costs = await averageCost(c.user.companyId, products.map((p) => p.id));
      const rows: Row[] = [];
      for (const p of products) {
        const ls = levels.filter((l) => l.productId === p.id && Math.abs(l.qty) > 1e-9);
        const total = ls.reduce((s, l) => s + l.qty, 0);
        if (ls.length === 0 && n(p.minStock) === 0) continue;
        const low = n(p.minStock) > 0 && total < n(p.minStock);
        const cost = costs.get(p.id)?.uzs ?? 0;
        rows.push({
          _href: `/catalog/${p.id}`,
          _tone: low ? "warning" : null,
          sku: p.sku ?? "",
          name: p.name,
          warehouse: ls.map((l) => warehouses.find((w) => w.id === l.warehouseId)?.name).filter(Boolean).join(", "),
          qty: total,
          unit: p.unit,
          minStock: n(p.minStock),
          avgCost: cost,
          value: total * cost,
        });
      }
      return {
        columns: [
          { key: "sku", label: "reports.col.sku" },
          { key: "name", label: "reports.col.product" },
          { key: "warehouse", label: "reports.col.warehouse" },
          { key: "qty", label: "reports.col.qty", type: "num" },
          { key: "unit", label: "reports.col.unit" },
          { key: "minStock", label: "reports.col.minStock", type: "num" },
          { key: "avgCost", label: "reports.col.avgCost", type: "money" },
          { key: "value", label: "reports.col.stockValue", type: "money" },
        ],
        rows,
        totals: { sku: "", name: "", value: sum(rows, "value") },
      };
    },
  },
  // ---------------------------------------------------------------- procurement
  {
    key: "procurement",
    group: "supply",
    perms: ["procurement.view"],
    filters: ["period", "project"],
    async run(c) {
      const today = toDateOnly(new Date());
      const orders = await db.purchaseOrder.findMany({
        where: { companyId: c.user.companyId, orderDate: range(c), ...(c.projectId ? { projectId: c.projectId } : {}) },
        include: { supplier: { select: { name: true } }, project: { select: { name: true } }, payments: { where: { approval: "APPROVED" }, select: { amountUzs: true } } },
        orderBy: { orderDate: "desc" },
      });
      const rows: Row[] = orders.map((o) => {
        const paid = o.payments.reduce((s, p) => s + n(p.amountUzs), 0);
        const late = o.status !== "RECEIVED" && o.status !== "CANCELLED" && o.expectedDate && o.expectedDate < today;
        return {
          _href: `/procurement/${o.id}`,
          _tone: late ? "danger" : null,
          number: o.number,
          supplier: o.supplier.name,
          project: o.project?.name ?? "—",
          status: `poStatus:${o.status}`,
          orderDate: o.orderDate,
          expected: o.expectedDate,
          total: n(o.totalUzs),
          paid,
          debt: n(o.totalUzs) - paid,
        };
      });
      return {
        columns: [
          { key: "number", label: "reports.col.number" },
          { key: "supplier", label: "reports.col.supplier" },
          { key: "project", label: "reports.col.project" },
          { key: "status", label: "reports.col.status", type: "badge" },
          { key: "orderDate", label: "reports.col.orderDate", type: "date" },
          { key: "expected", label: "reports.col.expected", type: "date" },
          { key: "total", label: "reports.col.total", type: "money" },
          { key: "paid", label: "reports.col.paid", type: "money" },
          { key: "debt", label: "reports.col.debt", type: "money" },
        ],
        rows,
        totals: { number: "", total: sum(rows, "total"), paid: sum(rows, "paid"), debt: sum(rows, "debt") },
      };
    },
  },
  // ---------------------------------------------------------------- deadlines
  {
    key: "deadlines",
    group: "quality",
    perms: ["tasks.view"],
    filters: ["project"],
    async run(c) {
      const today = toDateOnly(new Date());
      const tasks = await db.task.findMany({
        where: { companyId: c.user.companyId, project: projectsFor(c), status: { notIn: ["APPROVED", "CANCELLED"] }, deadline: { lte: new Date(today.getTime() + 7 * DAY) } },
        include: { project: { select: { name: true } }, responsible: { select: { name: true } }, assignments: { include: { group: { select: { name: true } }, employee: { select: { fullName: true } }, contractor: { select: { name: true } } } } },
        orderBy: { deadline: "asc" },
      });
      const rows: Row[] = tasks.map((t) => {
        const st = deadlineState(t);
        const days = t.deadline ? Math.round((today.getTime() - t.deadline.getTime()) / DAY) : 0;
        return {
          _href: `/tasks/${t.id}`,
          _tone: st === "OVERDUE" ? "danger" : "warning",
          task: `T-${t.number} ${t.title}`,
          project: t.project.name,
          performers: t.assignments.map((a) => a.group?.name ?? a.employee?.fullName ?? a.contractor?.name).filter(Boolean).join(", "),
          responsible: t.responsible?.name ?? "—",
          status: `taskStatus:${t.status}`,
          deadline: t.deadline,
          daysLate: days > 0 ? days : null,
          reported: t.reportedPercent,
        };
      });
      return {
        columns: [
          { key: "task", label: "reports.col.task" },
          { key: "project", label: "reports.col.project" },
          { key: "performers", label: "reports.col.performers" },
          { key: "responsible", label: "reports.col.responsible" },
          { key: "status", label: "reports.col.status", type: "badge" },
          { key: "deadline", label: "reports.col.deadline", type: "date" },
          { key: "daysLate", label: "reports.col.daysLate", type: "int" },
          { key: "reported", label: "reports.col.reported", type: "pct" },
        ],
        rows,
        note: "reports.deadlinesNote",
      };
    },
  },
  // ---------------------------------------------------------------- remarks
  {
    key: "remarks",
    group: "quality",
    perms: ["tasks.view", "remarks.manage"],
    filters: ["period", "project"],
    async run(c) {
      const today = toDateOnly(new Date());
      const remarks = await db.remark.findMany({
        where: { companyId: c.user.companyId, project: projectsFor(c), createdAt: range(c) },
        include: { project: { select: { name: true } }, task: { select: { number: true, title: true } }, responsible: { select: { name: true } }, location: { select: { name: true } } },
        orderBy: { number: "desc" },
      });
      const rows: Row[] = remarks.map((r) => {
        const open = r.status !== "ACCEPTED";
        const age = Math.round(((r.acceptedAt ?? new Date()).getTime() - r.createdAt.getTime()) / DAY);
        return {
          _href: `/remarks/${r.id}`,
          _tone: open && r.deadline && r.deadline < today ? "danger" : open ? "warning" : null,
          number: `#${r.number}`,
          description: r.description,
          project: r.project.name,
          place: [r.location?.name, r.task ? `T-${r.task.number}` : null].filter(Boolean).join(" · "),
          responsible: r.responsible?.name ?? "—",
          priority: `priority:${r.priority}`,
          status: `remarkStatus:${r.status}`,
          created: r.createdAt,
          deadline: r.deadline,
          age,
        };
      });
      return {
        columns: [
          { key: "number", label: "reports.col.number" },
          { key: "description", label: "reports.col.description" },
          { key: "project", label: "reports.col.project" },
          { key: "place", label: "reports.col.place" },
          { key: "responsible", label: "reports.col.responsible" },
          { key: "priority", label: "reports.col.priority", type: "badge" },
          { key: "status", label: "reports.col.status", type: "badge" },
          { key: "created", label: "reports.col.created", type: "date" },
          { key: "deadline", label: "reports.col.deadline", type: "date" },
          { key: "age", label: "reports.col.ageDays", type: "int" },
        ],
        rows,
      };
    },
  },
  // ---------------------------------------------------------------- service
  {
    key: "service",
    group: "service",
    perms: ["service.view"],
    filters: ["period", "project"],
    async run(c) {
      const tickets = await db.serviceTicket.findMany({
        where: { companyId: c.user.companyId, reportedAt: range(c), ...(c.projectId ? { projectId: c.projectId } : {}), planned: false },
        include: { client: { select: { name: true } }, project: { select: { name: true } }, responsible: { select: { name: true } }, serviceContract: { select: { slaResponseHours: true, slaResolveHours: true } }, parts: { select: { qty: true, unitCostUzs: true } } },
        orderBy: { number: "desc" },
      });
      const rows: Row[] = tickets.map((x) => {
        const sla = slaStatus(x, slaHours(x.priority as Prio, x.serviceContract));
        const cost = ticketCost(x);
        return {
          _href: `/service/tickets/${x.id}`,
          _tone: sla.resolve === "BREACHED" || sla.response === "BREACHED" ? "danger" : null,
          number: `S-${x.number}`,
          title: x.title,
          client: x.client?.name ?? x.project?.name ?? "—",
          warranty: x.isWarranty ? "✓" : "",
          status: `ticketStatus:${x.status}`,
          reported: x.reportedAt,
          responseH: x.respondedAt ? (x.respondedAt.getTime() - x.reportedAt.getTime()) / 3600000 : null,
          resolveH: x.resolvedAt ? (x.resolvedAt.getTime() - x.reportedAt.getTime()) / 3600000 : null,
          sla: `sla:resolve_${sla.resolve}`,
          cost: cost.total,
          charge: n(x.chargeUzs),
        };
      });
      return {
        columns: [
          { key: "number", label: "reports.col.number" },
          { key: "title", label: "reports.col.ticket" },
          { key: "client", label: "reports.col.client" },
          { key: "warranty", label: "reports.col.warranty" },
          { key: "status", label: "reports.col.status", type: "badge" },
          { key: "reported", label: "reports.col.reported", type: "date" },
          { key: "responseH", label: "reports.col.responseH", type: "num" },
          { key: "resolveH", label: "reports.col.resolveH", type: "num" },
          { key: "sla", label: "reports.col.sla", type: "badge" },
          { key: "cost", label: "reports.col.totalCost", type: "money" },
          { key: "charge", label: "reports.col.charge", type: "money" },
        ],
        rows,
        totals: { number: "", cost: sum(rows, "cost"), charge: sum(rows, "charge") },
      };
    },
  },
  // ---------------------------------------------------------------- warranty
  {
    key: "warranty",
    group: "service",
    perms: ["service.view", "projects.view"],
    filters: [],
    async run(c) {
      const today = toDateOnly(new Date());
      const projects = await db.project.findMany({
        where: { AND: [projectsFor(c), { warrantyEnd: { not: null } }] },
        include: { client: { select: { name: true } }, serviceTickets: { select: { isWarranty: true, laborCostUzs: true, otherCostUzs: true, parts: { select: { qty: true, unitCostUzs: true } } } } },
        orderBy: { warrantyEnd: "asc" },
      });
      const rows: Row[] = projects.map((p) => {
        const left = Math.ceil((p.warrantyEnd!.getTime() - today.getTime()) / DAY);
        const w = p.serviceTickets.filter((t) => t.isWarranty);
        return {
          _href: `/projects/${p.id}`,
          _tone: left < 0 ? null : left <= 60 ? "warning" : "success",
          project: p.name,
          client: p.client.name,
          start: p.warrantyStart,
          end: p.warrantyEnd,
          months: p.warrantyMonths,
          daysLeft: left,
          tickets: w.length,
          cost: w.reduce((s, t) => s + ticketCost(t).total, 0),
        };
      });
      return {
        columns: [
          { key: "project", label: "reports.col.project" },
          { key: "client", label: "reports.col.client" },
          { key: "start", label: "reports.col.start", type: "date" },
          { key: "end", label: "reports.col.end", type: "date" },
          { key: "months", label: "reports.col.months", type: "int" },
          { key: "daysLeft", label: "reports.col.daysLeft", type: "int" },
          { key: "tickets", label: "reports.col.warrantyTickets", type: "int" },
          { key: "cost", label: "reports.col.warrantyCost", type: "money" },
        ],
        rows,
      };
    },
  },
  // ---------------------------------------------------------------- visual progress (drawings)
  {
    key: "visual",
    group: "projects",
    perms: ["documents.view"],
    filters: ["project"],
    async run(c) {
      const drawings = await db.drawing.findMany({
        where: { project: projectsFor(c) },
        include: { project: { select: { id: true, name: true } }, versions: { orderBy: { version: "desc" }, take: 1, include: { zones: { include: { tasks: { select: { taskId: true } } } } } } },
        orderBy: { createdAt: "asc" },
      });
      const all = [...new Set(drawings.flatMap((d) => d.versions[0]?.zones.flatMap((z) => z.tasks.map((t) => t.taskId)) ?? []))];
      const sums = await taskSummaries(all);
      const rows: Row[] = [];
      for (const d of drawings) {
        for (const z of d.versions[0]?.zones ?? []) {
          const ts = z.tasks.map((t) => sums.get(t.taskId)).filter(Boolean);
          const pct = ts.length ? ts.reduce((s, x) => s + x!.percent, 0) / ts.length : null;
          rows.push({
            _href: `/projects/${d.project.id}/drawings/${d.id}?zone=${z.id}`,
            _tone: ts.some((x) => ["REWORK", "BLOCKED", "REJECTED"].includes(x!.status)) ? "danger" : z.needsReview ? "warning" : pct === 100 ? "success" : null,
            project: d.project.name,
            drawing: `${d.title} v${d.versions[0].version}`,
            zone: z.name,
            tasks: ts.map((x) => `T-${x!.number}`).join(", "),
            progress: pct,
            remarks: ts.reduce((s, x) => s + x!.openRemarks, 0),
          });
        }
      }
      return {
        columns: [
          { key: "project", label: "reports.col.project" },
          { key: "drawing", label: "reports.col.drawing" },
          { key: "zone", label: "reports.col.zone" },
          { key: "tasks", label: "reports.col.tasks" },
          { key: "progress", label: "reports.col.progress", type: "pct" },
          { key: "remarks", label: "reports.col.openRemarks", type: "int" },
        ],
        rows,
      };
    },
  },
];

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0)) };
}

export function reportsFor(user: CurrentUser) {
  return REPORTS.filter((r) => can(user, "reports.view") && r.perms.some((p) => can(user, p)));
}
