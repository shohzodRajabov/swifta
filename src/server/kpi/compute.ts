// KPI computation from recorded facts (sessions, tasks, inspections, remarks, attendance, contractor work).
// No "server-only" import: the demo generator (tsx) uses it too.
import type { KpiSubject, Prisma, PrismaClient } from "@prisma/client";
import { combine, coverage, MIN_COVERAGE, monthBounds, pct, type ComponentResult, type KpiSource, type RuleComponent, type SnapshotComponent } from "@/lib/kpi";

type Db = PrismaClient | Prisma.TransactionClient;
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const DAY = 86400000;
const WORKED = ["OBJECT", "WORKSHOP", "TRAVEL", "OFFICE", "IDLE_MATERIAL", "IDLE_CLIENT", "IDLE_OTHER"];
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const taskLabel = (t: { number: number; title: string }) => `T-${t.number} ${t.title}`;
const cap = <T,>(a: T[], k = 60) => a.slice(0, k);

export type SubjectResult = { id: string; name: string; score: number | null; components: SnapshotComponent[] };

/** Best first, but results based on little data go to the end. */
export function sortResults(rows: SubjectResult[]) {
  const ok = (r: SubjectResult) => coverage(r.components) >= MIN_COVERAGE;
  return rows.sort((a, b) => Number(ok(b)) - Number(ok(a)) || (b.score ?? -1) - (a.score ?? -1));
}

/** Rule in force for the month (effective at the month end), or the latest active one. */
export async function ruleFor(db: Db, companyId: string, subject: KpiSubject, month: string) {
  const { to } = monthBounds(month);
  return (
    (await db.kpiRule.findFirst({
      where: { companyId, subject, status: { not: "DRAFT" }, effectiveFrom: { lte: to }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: to } }] },
      orderBy: { version: "desc" },
    })) ?? (await db.kpiRule.findFirst({ where: { companyId, subject, status: "ACTIVE" }, orderBy: { version: "desc" } }))
  );
}

const param = (rule: RuleComponent[], key: string, p: string, def: number) => rule.find((c) => c.key === key)?.params?.[p] ?? def;

// ---- shared facts for EMPLOYEE / GROUP ------------------------------------------

async function loadMonth(db: Db, companyId: string, month: string) {
  const { from, to, end } = monthBounds(month);
  const sessions = await db.workSession.findMany({
    where: { companyId, date: { gte: from, lte: to }, status: { not: "REJECTED" } },
    select: {
      id: true,
      date: true,
      createdAt: true,
      quantity: true,
      unit: true,
      groupId: true,
      leaderId: true,
      status: true,
      task: { select: { id: true, number: true, title: true, workTypeId: true } },
      members: { select: { employeeId: true, hours: true, contributionQty: true, confirmation: true } },
    },
  });
  // average output per person-hour by work type (company, this month)
  const avg = new Map<string, { q: number; h: number }>();
  for (const s of sessions) {
    const k = s.task.workTypeId ?? "-";
    const a = avg.get(k) ?? { q: 0, h: 0 };
    a.q += n(s.quantity);
    a.h += s.members.reduce((x, m) => x + n(m.hours), 0);
    avg.set(k, a);
  }
  const rate = (wt: string | null) => {
    const a = avg.get(wt ?? "-");
    return a && a.h > 0 ? a.q / a.h : 0;
  };
  // all sessions ever (to know who worked on which task)
  const allSessions = await db.workSession.findMany({
    where: { companyId, status: { not: "REJECTED" }, date: { lte: to } },
    select: { taskId: true, groupId: true, members: { select: { employeeId: true } } },
  });
  const finishedTasks = await db.task.findMany({
    where: { companyId, actualFinish: { gte: from, lt: end } },
    select: { id: true, number: true, title: true, deadline: true, actualFinish: true },
  });
  const inspections = await db.inspection.findMany({
    where: { at: { gte: from, lt: end }, task: { companyId } },
    select: { id: true, attempt: true, result: true, at: true, note: true, task: { select: { id: true, number: true, title: true } } },
  });
  const remarks = await db.remark.findMany({
    where: { companyId, createdAt: { gte: from, lt: end }, taskId: { not: null } },
    select: { id: true, number: true, description: true, taskId: true, createdAt: true },
  });
  return { sessions, rate, allSessions, finishedTasks, inspections, remarks, from, to, end };
}
type MonthFacts = Awaited<ReturnType<typeof loadMonth>>;

function deadlineComponent(f: MonthFacts, taskIds: Set<string>): ComponentResult {
  const list = f.finishedTasks.filter((t) => taskIds.has(t.id) && t.deadline);
  const sources: KpiSource[] = list.map((t) => {
    const late = Math.max(0, Math.ceil((t.actualFinish!.getTime() - (t.deadline!.getTime() + DAY - 1)) / DAY));
    return { type: "task", id: t.id, label: taskLabel(t), detail: late > 0 ? `+${late}` : "✓", good: late === 0 };
  });
  const onTime = sources.filter((s) => s.good).length;
  return { value: pct(onTime, list.length), raw: { finished: list.length, onTime }, sources: cap(sources) };
}

function inspectionComponents(f: MonthFacts, taskIds: Set<string>): { firstPass: ComponentResult; rework: ComponentResult } {
  const list = f.inspections.filter((i) => taskIds.has(i.task.id));
  const first = list.filter((i) => i.attempt === 1);
  const passed = first.filter((i) => i.result === "PASSED").length;
  const rejected = list.filter((i) => i.result === "REJECTED").length;
  const src = (arr: typeof list): KpiSource[] =>
    cap(arr.map((i) => ({ type: "inspection", id: i.task.id, label: taskLabel(i.task), detail: `#${i.attempt} ${fmt(i.at)}${i.note ? ` · ${i.note}` : ""}`, good: i.result === "PASSED" })));
  return {
    firstPass: { value: pct(passed, first.length), raw: { inspected: first.length, passed }, sources: src(first) },
    rework: { value: list.length ? 100 - (pct(rejected, list.length) ?? 0) : null, raw: { inspections: list.length, rejected }, sources: src(list) },
  };
}

function remarksComponent(f: MonthFacts, taskIds: Set<string>, penalty: number, active: boolean): ComponentResult {
  const list = f.remarks.filter((r) => r.taskId && taskIds.has(r.taskId));
  return {
    value: active ? Math.max(0, 100 - list.length * penalty) : null,
    raw: { remarks: list.length, penalty },
    sources: cap(list.map((r) => ({ type: "remark", id: r.id, label: `#${r.number} ${r.description.slice(0, 80)}`, detail: fmt(r.createdAt), good: false }))),
  };
}

function quantityComponent(f: MonthFacts, rows: { sessionId: string; date: Date; task: { id: string; number: number; title: string; workTypeId: string | null }; qty: number; hours: number; unit: string | null }[], target: number): ComponentResult {
  let done = 0;
  let expected = 0;
  for (const r of rows) {
    done += r.qty;
    expected += r.hours * f.rate(r.task.workTypeId);
  }
  const ratio = expected > 0 ? done / expected : null;
  return {
    value: ratio === null ? null : Math.min(100, (ratio / (target || 1)) * 100),
    raw: { ratio: ratio === null ? null : Math.round(ratio * 100) / 100, sessions: rows.length, hours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 10) / 10 },
    sources: cap(
      [...rows]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .map((r) => ({ type: "session", id: r.task.id, label: taskLabel(r.task), detail: `${fmt(r.date)} · ${Math.round(r.qty * 100) / 100} ${r.unit ?? ""} / ${r.hours} h` })),
    ),
  };
}

// ---- EMPLOYEE -------------------------------------------------------------------

export async function computeEmployees(db: Db, companyId: string, month: string, rule: RuleComponent[]): Promise<SubjectResult[]> {
  const f = await loadMonth(db, companyId, month);
  const [employees, attendance] = await Promise.all([
    db.employee.findMany({ where: { companyId }, select: { id: true, fullName: true, active: true } }),
    db.attendanceDay.findMany({ where: { companyId, date: { gte: f.from, lte: f.to } }, select: { id: true, employeeId: true, date: true, type: true, note: true } }),
  ]);
  const out: SubjectResult[] = [];
  for (const e of employees) {
    const mine = f.sessions.filter((s) => s.members.some((m) => m.employeeId === e.id));
    const days = attendance.filter((a) => a.employeeId === e.id);
    if (mine.length === 0 && days.length === 0) continue;
    const taskIds = new Set(f.allSessions.filter((s) => s.members.some((m) => m.employeeId === e.id)).map((s) => s.taskId));
    const rows = mine.map((s) => {
      const m = s.members.find((x) => x.employeeId === e.id)!;
      return { sessionId: s.id, date: s.date, task: s.task, qty: n(m.contributionQty), hours: n(m.hours), unit: s.unit };
    });
    const insp = inspectionComponents(f, taskIds);
    const worked = days.filter((d) => WORKED.includes(d.type)).length;
    const absent = days.filter((d) => d.type === "ABSENT").length;
    const led = mine.filter((s) => s.leaderId === e.id);
    const ledOk = led.filter((s) => s.createdAt.getTime() - s.date.getTime() <= 2 * DAY && !s.members.some((m) => m.confirmation === "DISPUTED"));
    const results: Record<string, ComponentResult> = {
      quantity: quantityComponent(f, rows, param(rule, "quantity", "target", 1)),
      deadline: deadlineComponent(f, new Set(mine.map((s) => s.task.id).concat([...taskIds]))),
      firstPass: insp.firstPass,
      rework: insp.rework,
      remarks: remarksComponent(f, taskIds, param(rule, "remarks", "penalty", 15), mine.length > 0),
      attendance: {
        value: worked + absent > 0 ? pct(worked, worked + absent) : null,
        raw: { worked, absent },
        sources: cap(days.filter((d) => d.type === "ABSENT").map((d) => ({ type: "attendance", id: d.id, label: fmt(d.date), detail: d.note ?? "", good: false }))),
      },
      leadership: {
        value: led.length ? pct(ledOk.length, led.length) : null,
        raw: { sessionsLed: led.length, onTimeNoDisputes: ledOk.length },
        sources: cap(led.map((s) => ({ type: "session", id: s.task.id, label: taskLabel(s.task), detail: fmt(s.date), good: ledOk.includes(s) }))),
      },
    };
    const c = combine(rule, results);
    out.push({ id: e.id, name: e.fullName, ...c });
  }
  return sortResults(out);
}

// ---- GROUP ----------------------------------------------------------------------

export async function computeGroups(db: Db, companyId: string, month: string, rule: RuleComponent[]): Promise<SubjectResult[]> {
  const f = await loadMonth(db, companyId, month);
  const groups = await db.workGroup.findMany({ where: { companyId }, select: { id: true, name: true } });
  const out: SubjectResult[] = [];
  for (const g of groups) {
    const mine = f.sessions.filter((s) => s.groupId === g.id);
    if (mine.length === 0) continue;
    const taskIds = new Set(f.allSessions.filter((s) => s.groupId === g.id).map((s) => s.taskId));
    const rows = mine.map((s) => ({ sessionId: s.id, date: s.date, task: s.task, qty: n(s.quantity), hours: s.members.reduce((x, m) => x + n(m.hours), 0), unit: s.unit }));
    const insp = inspectionComponents(f, taskIds);
    const clean = mine.filter((s) => s.status !== "REJECTED" && !s.members.some((m) => m.confirmation === "DISPUTED"));
    const results: Record<string, ComponentResult> = {
      quantity: quantityComponent(f, rows, param(rule, "quantity", "target", 1)),
      deadline: deadlineComponent(f, taskIds),
      firstPass: insp.firstPass,
      rework: insp.rework,
      remarks: remarksComponent(f, taskIds, param(rule, "remarks", "penalty", 15), true),
      discipline: {
        value: pct(clean.length, mine.length),
        raw: { sessions: mine.length, clean: clean.length },
        sources: cap(mine.filter((s) => !clean.includes(s)).map((s) => ({ type: "session", id: s.task.id, label: taskLabel(s.task), detail: fmt(s.date), good: false }))),
      },
    };
    out.push({ id: g.id, name: g.name, ...combine(rule, results) });
  }
  return sortResults(out);
}

// ---- CONTRACTOR -----------------------------------------------------------------

export async function computeContractors(db: Db, companyId: string, month: string, rule: RuleComponent[]): Promise<SubjectResult[]> {
  const { from, end } = monthBounds(month);
  const rows = await db.taskAssignment.findMany({
    where: {
      kind: "CONTRACTOR",
      contractor: { companyId },
      OR: [{ verifiedAt: { gte: from, lt: end } }, { completedAt: { gte: from, lt: end } }],
    },
    select: {
      id: true,
      outsourceStatus: true,
      deadline: true,
      completedAt: true,
      qualityScore: true,
      reworkCount: true,
      agreedUzs: true,
      actualUzs: true,
      contractor: { select: { id: true, name: true } },
      task: { select: { id: true, number: true, title: true, deadline: true } },
    },
  });
  const tolerance = param(rule, "price", "tolerance", 20);
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.contractor!.id, [...(by.get(r.contractor!.id) ?? []), r]);
  const out: SubjectResult[] = [];
  for (const [id, list] of by) {
    const src = (r: (typeof list)[number], detail: string, good: boolean): KpiSource => ({ type: "assignment", id: r.task.id, label: taskLabel(r.task), detail, good });
    const rated = list.filter((r) => r.qualityScore);
    const timed = list.filter((r) => r.completedAt && (r.deadline ?? r.task.deadline));
    const lateDays = (r: (typeof list)[number]) => Math.max(0, Math.ceil((r.completedAt!.getTime() - ((r.deadline ?? r.task.deadline)!.getTime() + DAY - 1)) / DAY));
    const priced = list.filter((r) => n(r.agreedUzs) > 0 && r.actualUzs !== null);
    const overrun = priced.map((r) => ((n(r.actualUzs) - n(r.agreedUzs)) / n(r.agreedUzs)) * 100);
    const avgOver = overrun.length ? overrun.reduce((a, b) => a + b, 0) / overrun.length : null;
    const results: Record<string, ComponentResult> = {
      quality: {
        value: rated.length ? ((rated.reduce((s, r) => s + r.qualityScore!, 0) / rated.length - 1) / 4) * 100 : null,
        raw: { rated: rated.length, average: rated.length ? Math.round((rated.reduce((s, r) => s + r.qualityScore!, 0) / rated.length) * 10) / 10 : null },
        sources: rated.map((r) => src(r, `★${r.qualityScore}`, r.qualityScore! >= 4)),
      },
      deadline: {
        value: pct(timed.filter((r) => lateDays(r) === 0).length, timed.length),
        raw: { finished: timed.length, onTime: timed.filter((r) => lateDays(r) === 0).length },
        sources: timed.map((r) => src(r, lateDays(r) ? `+${lateDays(r)}` : "✓", lateDays(r) === 0)),
      },
      rework: {
        value: list.length ? 100 - (pct(list.filter((r) => r.reworkCount > 0).length, list.length) ?? 0) : null,
        raw: { jobs: list.length, reworked: list.filter((r) => r.reworkCount > 0).length },
        sources: list.map((r) => src(r, r.reworkCount ? `×${r.reworkCount}` : "✓", r.reworkCount === 0)),
      },
      price: {
        value: avgOver === null ? null : Math.max(0, 100 - (Math.max(0, avgOver) / (tolerance || 20)) * 100),
        raw: { overrunPct: avgOver === null ? null : Math.round(avgOver * 10) / 10, tolerance },
        sources: priced.map((r, i) => src(r, `${overrun[i] > 0 ? "+" : ""}${overrun[i].toFixed(1)}%`, overrun[i] <= 0)),
      },
    };
    out.push({ id, name: list[0].contractor!.name, ...combine(rule, results) });
  }
  return sortResults(out);
}

export async function computeSubject(db: Db, companyId: string, subject: KpiSubject, month: string, rule: RuleComponent[]) {
  if (subject === "GROUP") return computeGroups(db, companyId, month, rule);
  if (subject === "CONTRACTOR") return computeContractors(db, companyId, month, rule);
  return computeEmployees(db, companyId, month, rule);
}

/** Calculate (or recalculate) a month: snapshots are replaced until the period is approved. */
export async function calculatePeriod(db: PrismaClient, companyId: string, subject: KpiSubject, month: string) {
  const rule = await ruleFor(db, companyId, subject, month);
  if (!rule) return null;
  const existing = await db.kpiPeriod.findUnique({ where: { companyId_month_subject: { companyId, month, subject } } });
  if (existing?.status === "APPROVED") return existing;
  const results = await computeSubject(db, companyId, subject, month, rule.components as RuleComponent[]);
  return db.$transaction(async (tx) => {
    const period = await tx.kpiPeriod.upsert({
      where: { companyId_month_subject: { companyId, month, subject } },
      create: { companyId, month, subject, ruleId: rule.id },
      update: { ruleId: rule.id, calculatedAt: new Date(), status: "CALCULATED" },
    });
    await tx.kpiSnapshot.deleteMany({ where: { periodId: period.id } });
    for (const r of results) {
      if (r.score === null) continue;
      await tx.kpiSnapshot.create({
        data: {
          periodId: period.id,
          employeeId: subject === "EMPLOYEE" ? r.id : null,
          groupId: subject === "GROUP" ? r.id : null,
          contractorId: subject === "CONTRACTOR" ? r.id : null,
          score: r.score,
          components: JSON.parse(JSON.stringify(r.components)),
        },
      });
    }
    return period;
  });
}
