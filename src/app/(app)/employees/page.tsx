import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { db } from "@/lib/db";
import { dailyCost } from "@/lib/payroll";
import { formatNumber } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { isoDate, toDateOnly } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, LinkButton, PageHeader, Select, Table, Td, Th, Notice } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { EfficiencyBadge } from "@/components/task-bits";
import { efficiencyIndexes } from "@/server/workforce/efficiency";
import { computePayroll } from "@/server/workforce/payroll";
import { closePayrollMonth, createGroup, markAttendance, reopenPayrollMonth } from "./actions";
import { ATTENDANCE_TYPES, EMPLOYEE_TABS, EmployeeTabs, employeeTabVisible, type EmployeeTab } from "./tabs";

export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  const user = await requirePermission("employees.view");
  const sp = (await searchParams) as { tab?: string; q?: string; month?: string; inactive?: string };
  const tab: EmployeeTab = EMPLOYEE_TABS.includes(sp.tab as EmployeeTab) && employeeTabVisible(user, sp.tab as EmployeeTab) ? (sp.tab as EmployeeTab) : "list";
  const t = await getTranslations();

  return (
    <>
      <PageHeader
        title={t("employees.title")}
        actions={
          can(user, "employees.edit") && (
            <LinkButton href="/employees/new">
              <Plus className="size-4" aria-hidden />
              {t("employees.new")}
            </LinkButton>
          )
        }
      />
      <EmployeeTabs user={user} active={tab} />
      {tab === "list" && <ListTab companyId={user.companyId} q={sp.q} showInactive={sp.inactive === "1"} showSalary={can(user, "salaries.view")} />}
      {tab === "groups" && <GroupsTab companyId={user.companyId} canManage={can(user, "groups.manage")} />}
      {tab === "attendance" && <AttendanceTab companyId={user.companyId} month={sp.month} />}
      {tab === "payroll" && <PayrollTab companyId={user.companyId} month={sp.month} canClose={can(user, "payroll.manage")} />}
    </>
  );
}

function currentMonth(m?: string) {
  return m && /^\d{4}-\d{2}$/.test(m) ? m : isoDate(new Date()).slice(0, 7);
}

async function ListTab({ companyId, q, showInactive, showSalary }: { companyId: string; q?: string; showInactive: boolean; showSalary: boolean }) {
  const t = await getTranslations();
  const today = toDateOnly(new Date());
  const [company, employees] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId } }),
    db.employee.findMany({
      where: {
        companyId,
        ...(showInactive ? {} : { active: true }),
        ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { position: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: { fullName: "asc" },
      include: {
        user: { select: { id: true, lastLoginAt: true, roleDef: { select: { name: true, key: true } } } },
        memberships: {
          where: { fromDate: { lte: today }, OR: [{ toDate: null }, { toDate: { gte: today } }] },
          include: { group: { select: { id: true, name: true } } },
        },
      },
    }),
  ]);
  const eff = await efficiencyIndexes(companyId, employees.map((e) => e.id));
  return (
    <Card>
      <form className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Input name="q" defaultValue={q} placeholder={t("common.search")} className="max-w-sm" />
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" name="inactive" value="1" defaultChecked={showInactive} /> {t("employees.showInactive")}
        </label>
        <Button type="submit" variant="secondary">
          {t("common.filter")}
        </Button>
        <span className="ml-auto text-xs text-muted">{t("employees.efficiencyLegend")}</span>
      </form>
      {employees.length === 0 ? (
        <Empty>{t("employees.empty")}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("employees.fullName")}</Th>
              <Th>{t("employees.position")}</Th>
              <Th>{t("employees.groups")}</Th>
              <Th>{t("employees.efficiency")}</Th>
              <Th className="text-right">{t("employees.sessions")}</Th>
              {showSalary && <Th className="text-right">{t("employees.salary")}</Th>}
              {showSalary && <Th className="text-right">{t("employees.dailyCost")}</Th>}
              <Th>{t("employees.login")}</Th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const ef = eff.get(e.id);
              return (
                <tr key={e.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/employees/${e.id}`} className="font-medium hover:text-primary">
                      {e.fullName}
                    </Link>
                    {e.phone && <div className="num text-xs text-muted">{formatPhone(e.phone)}</div>}
                    {!e.active && <Badge className="mt-1">{t("employees.inactive")}</Badge>}
                  </Td>
                  <Td>{e.position ?? "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {e.memberships.map((m) => (
                        <Link key={m.id} href={`/employees/groups/${m.group.id}`}>
                          <Badge tone={m.role === "LEADER" ? "primary" : "neutral"}>
                            {m.group.name}
                            {m.role === "LEADER" && ` · ${t("groupRole.LEADER")}`}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <EfficiencyBadge index={ef?.index} reliable={ef?.reliable} />
                  </Td>
                  <Td className="num text-right">{ef?.sessions ?? 0}</Td>
                  {showSalary && <Td className="num text-right">{formatNumber(Number(e.salary))}</Td>}
                  {showSalary && <Td className="num text-right">{formatNumber(Math.round(dailyCost(company, e)))}</Td>}
                  <Td>
                    {e.user ? (
                      <Badge tone="success">{e.user.roleDef ? roleLabel(t, e.user.roleDef) : t("employees.hasLogin")}</Badge>
                    ) : (
                      <span className="text-xs text-muted">{t("employees.noLogin")}</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

async function GroupsTab({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const t = await getTranslations();
  const today = toDateOnly(new Date());
  const [groups, employees] = await Promise.all([
    db.workGroup.findMany({
      where: { companyId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        members: {
          where: { fromDate: { lte: today }, OR: [{ toDate: null }, { toDate: { gte: today } }] },
          include: { employee: { select: { fullName: true } } },
          orderBy: { role: "asc" },
        },
        _count: { select: { sessions: true, assignments: true } },
      },
    }),
    canManage ? db.employee.findMany({ where: { companyId, active: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }) : [],
  ]);
  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <Card>
          <CardHeader title={t("groups.new")} subtitle={t("groups.historyHint")} />
          <ActionForm action={createGroup} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("groups.name")} required>
              <Input name="name" required />
            </Field>
            <Field label={t("groups.specialization")}>
              <Input name="specialization" />
            </Field>
            <Field label={t("groupRole.LEADER")}>
              <Select name="leaderId" defaultValue="">
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("groups.fromDate")} required>
              <Input name="fromDate" type="date" required defaultValue={isoDate(new Date())} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <SubmitButton>{t("common.create")}</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.length === 0 && (
          <Card>
            <Empty>{t("groups.empty")}</Empty>
          </Card>
        )}
        {groups.map((g) => (
          <Link key={g.id} href={`/employees/groups/${g.id}`}>
            <Card className="h-full p-4 transition-colors hover:border-primary/50">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{g.name}</div>
                  {g.specialization && <div className="text-xs text-muted">{g.specialization}</div>}
                </div>
                {!g.active && <Badge>{t("employees.inactive")}</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {g.members.map((m) => (
                  <Badge key={m.id} tone={m.role === "LEADER" ? "primary" : "neutral"}>
                    {m.employee.fullName}
                  </Badge>
                ))}
                {g.members.length === 0 && <span className="text-xs text-muted">{t("groups.noMembers")}</span>}
              </div>
              <div className="mt-3 text-xs text-muted">
                {t("groups.stats", { members: String(g.members.length), tasks: String(g._count.assignments), sessions: String(g._count.sessions) })}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

const DAY_SHORT: Record<string, string> = {
  OBJECT: "O",
  WORKSHOP: "S",
  TRAVEL: "Y",
  OFFICE: "F",
  IDLE_MATERIAL: "M",
  IDLE_CLIENT: "B",
  IDLE_OTHER: "T",
  ABSENT: "×",
  LEAVE: "T/O",
  SICK: "K",
};
const DAY_CLASS: Record<string, string> = {
  OBJECT: "bg-success-soft text-success",
  WORKSHOP: "bg-primary-soft text-primary",
  TRAVEL: "bg-primary-soft text-primary",
  OFFICE: "bg-primary-soft text-primary",
  IDLE_MATERIAL: "bg-warning-soft text-warning",
  IDLE_CLIENT: "bg-warning-soft text-warning",
  IDLE_OTHER: "bg-warning-soft text-warning",
  ABSENT: "bg-danger-soft text-danger",
  LEAVE: "bg-surface-2 text-muted",
  SICK: "bg-surface-2 text-muted",
};

async function AttendanceTab({ companyId, month: raw }: { companyId: string; month?: string }) {
  const t = await getTranslations();
  const month = currentMonth(raw);
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  const days = to.getUTCDate();
  const [employees, rows, projects] = await Promise.all([
    db.employee.findMany({ where: { companyId, active: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    db.attendanceDay.findMany({ where: { companyId, date: { gte: from, lte: to } } }),
    db.project.findMany({ where: { companyId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const cell = new Map(rows.map((r) => [`${r.employeeId}:${r.date.getUTCDate()}`, r]));
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t("attendance.mark")} subtitle={t("attendance.markHint")} />
        <ActionForm action={markAttendance} className="grid gap-4 p-5 md:grid-cols-4">
          <Field label={t("common.date")} required>
            <Input name="date" type="date" required defaultValue={isoDate(new Date())} />
          </Field>
          <Field label={t("attendance.type")} required>
            <Select name="type" defaultValue="WORKSHOP">
              {ATTENDANCE_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(`attendanceType.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("attendance.project")} hint={t("attendance.projectHint")}>
            <Select name="projectId" defaultValue="">
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("common.note")}>
            <Input name="note" />
          </Field>
          <fieldset className="md:col-span-4">
            <legend className="mb-1.5 text-sm font-medium">{t("attendance.employees")}</legend>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
              {employees.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="employeeIds" value={e.id} /> {e.fullName}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="md:col-span-4">
            <SubmitButton>{t("common.save")}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <input type="hidden" name="tab" value="attendance" />
          <Input type="month" name="month" defaultValue={month} className="w-44" />
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
          <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
            {ATTENDANCE_TYPES.map((k) => (
              <span key={k} className={`rounded px-1.5 py-0.5 ${DAY_CLASS[k]}`}>
                {DAY_SHORT[k]} — {t(`attendanceType.${k}`)}
              </span>
            ))}
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-surface px-3 py-2 text-left font-medium text-muted">{t("employees.fullName")}</th>
                {Array.from({ length: days }, (_, i) => {
                  const wd = new Date(Date.UTC(y, m - 1, i + 1)).getUTCDay();
                  return (
                    <th key={i} className={`w-7 px-0.5 py-2 text-center font-medium ${wd === 0 ? "text-danger" : "text-muted"}`}>
                      {i + 1}
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-right font-medium text-muted">{t("attendance.worked")}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                let worked = 0;
                return (
                  <tr key={e.id} className="border-t border-border">
                    <td className="sticky left-0 whitespace-nowrap bg-surface px-3 py-1.5">{e.fullName}</td>
                    {Array.from({ length: days }, (_, i) => {
                      const r = cell.get(`${e.id}:${i + 1}`);
                      if (r && !["ABSENT", "LEAVE", "SICK"].includes(r.type)) worked++;
                      return (
                        <td key={i} className="p-0.5 text-center">
                          {r && (
                            <span title={`${t(`attendanceType.${r.type}`)}${r.note ? ` — ${r.note}` : ""}`} className={`block rounded px-0.5 py-0.5 ${DAY_CLASS[r.type]}`}>
                              {DAY_SHORT[r.type]}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="num px-2 text-right font-medium">{worked}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

async function PayrollTab({ companyId, month: raw, canClose }: { companyId: string; month?: string; canClose: boolean }) {
  const t = await getTranslations();
  const month = currentMonth(raw);
  const [{ rows, pendingSessions }, pm] = await Promise.all([
    computePayroll(companyId, month),
    db.payrollMonth.findUnique({ where: { companyId_month: { companyId, month } } }),
  ]);
  const sum = (k: "earned" | "allocated" | "unallocated" | "employerCost") => rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="flex flex-col gap-4">
      <Notice>{t("payroll.hint")}</Notice>
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <input type="hidden" name="tab" value="payroll" />
          <Input type="month" name="month" defaultValue={month} className="w-44" />
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {pm?.status === "CLOSED" ? (
              <>
                <Badge tone="success">{t("payroll.closed")}</Badge>
                {canClose && (
                  <Button formAction={reopenPayrollMonth} name="month" value={month} variant="ghost" className="text-xs">
                    {t("payroll.reopen")}
                  </Button>
                )}
              </>
            ) : (
              pendingSessions > 0 && <Badge tone="warning">{t("payroll.pendingSessions", { n: String(pendingSessions) })}</Badge>
            )}
          </div>
        </form>
        {rows.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("employees.fullName")}</Th>
                <Th className="text-right">{t("employees.salary")}</Th>
                <Th className="text-right">{t("payroll.employerCost")}</Th>
                <Th className="text-right">{t("payroll.days")}</Th>
                <Th className="text-right">{t("employees.dailyCost")}</Th>
                <Th className="text-right">{t("payroll.earned")}</Th>
                <Th className="text-right">{t("payroll.allocated")}</Th>
                <Th className="text-right">{t("payroll.unallocated")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <Td>
                    <Link href={`/employees/${r.employeeId}`} className="hover:text-primary">
                      {r.fullName}
                    </Link>
                    <div className="text-xs text-muted">
                      {Object.entries(r.byType)
                        .map(([k, v]) => `${t(`attendanceType.${k}`)}: ${v}`)
                        .join(" · ")}
                    </div>
                  </Td>
                  <Td className="num text-right">{formatNumber(r.salary)}</Td>
                  <Td className="num text-right">{formatNumber(Math.round(r.employerCost))}</Td>
                  <Td className="num text-right">
                    {r.workedDays} / {r.normDays}
                  </Td>
                  <Td className="num text-right">{formatNumber(Math.round(r.dailyRate))}</Td>
                  <Td className="num text-right">{formatNumber(Math.round(r.earned))}</Td>
                  <Td className="num text-right">{formatNumber(Math.round(r.allocated))}</Td>
                  <Td className="num text-right">{formatNumber(Math.round(r.unallocated))}</Td>
                </tr>
              ))}
              <tr className="font-semibold">
                <Td>{t("common.total")}</Td>
                <Td />
                <Td className="num text-right">{formatNumber(Math.round(sum("employerCost")))}</Td>
                <Td />
                <Td />
                <Td className="num text-right">{formatNumber(Math.round(sum("earned")))}</Td>
                <Td className="num text-right">{formatNumber(Math.round(sum("allocated")))}</Td>
                <Td className="num text-right">{formatNumber(Math.round(sum("unallocated")))}</Td>
              </tr>
            </tbody>
          </Table>
        )}
        {canClose && pm?.status !== "CLOSED" && rows.length > 0 && (
          <ActionForm action={closePayrollMonth} className="border-t border-border p-4">
            <input type="hidden" name="month" value={month} />
            <p className="mb-3 text-sm text-muted">{t("payroll.closeHint")}</p>
            <SubmitButton>{t("payroll.close")}</SubmitButton>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
