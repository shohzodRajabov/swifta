import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { db } from "@/lib/db";
import { dailyCost, employerMonthlyCost, grossSalary, hourlyCost } from "@/lib/payroll";
import { formatNumber, formatQty } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Badge, Card, CardHeader, Empty, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { EfficiencyBadge, TaskStatusBadge } from "@/components/task-bits";
import { Attachments } from "@/components/attachments";
import { CreateUserForm } from "@/app/(app)/settings/users/otp-forms";
import { efficiencyIndexes } from "@/server/workforce/efficiency";
import { kpiHistory } from "@/server/kpi/view";
import { KpiScore } from "@/components/kpi-bits";
import { EmployeeForm } from "../employee-form";
import { grantLogin, saveEmployee } from "../actions";

export default async function EmployeePage({ params }: PageProps<"/employees/[id]">) {
  const { id } = await params;
  const user = await requirePermission("employees.view");
  const employee = await db.employee.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      user: { include: { roleDef: true } },
      memberships: { include: { group: { select: { id: true, name: true } } }, orderBy: { fromDate: "desc" } },
    },
  });
  if (!employee) notFound();
  const t = await getTranslations();
  const showSalary = can(user, "salaries.view");
  const [company, eff, sessions, tasks, roles, workTypes] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: user.companyId } }),
    efficiencyIndexes(user.companyId, [id]).then((m) => m.get(id)),
    db.workSessionMember.findMany({
      where: { employeeId: id },
      include: { session: { include: { task: { select: { id: true, number: true, title: true, unit: true } }, project: { select: { name: true } } } } },
      orderBy: { session: { date: "desc" } },
      take: 30,
    }),
    db.task.findMany({
      where: {
        companyId: user.companyId,
        status: { notIn: ["APPROVED", "CANCELLED"] },
        assignments: { some: { OR: [{ employeeId: id }, { group: { members: { some: { employeeId: id, toDate: null } } } }] } },
      },
      select: { id: true, number: true, title: true, status: true, deadline: true, project: { select: { name: true } } },
      orderBy: { deadline: "asc" },
      take: 30,
    }),
    can(user, "users.manage") ? db.roleDef.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" } }) : [],
    db.workType.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true, unit: true } }),
  ]);
  const kpi = can(user, "kpi.view") ? await kpiHistory(user.companyId, "EMPLOYEE", id, 3) : [];
  const wtName = (wid: string | null) => workTypes.find((w) => w.id === wid)?.name ?? t("employees.noWorkType");
  const wtUnit = (wid: string | null) => workTypes.find((w) => w.id === wid)?.unit ?? "";

  return (
    <>
      <PageHeader
        title={employee.fullName}
        back={{ href: "/employees", label: t("employees.title") }}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            {employee.position && <span>{employee.position}</span>}
            {employee.phone && <span className="num">{formatPhone(employee.phone)}</span>}
            {!employee.active && <Badge>{t("employees.inactive")}</Badge>}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-muted">{t("employees.efficiency")}</div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-3xl font-semibold">{eff?.index ? eff.index.toFixed(2) : "—"}</span>
            <EfficiencyBadge index={eff?.index} reliable={eff?.reliable} distinct={eff?.distinct} />
          </div>
          <div className="mt-1 text-xs text-muted">
            {t("employees.efficiencyBasis", { sessions: String(eff?.sessions ?? 0), hours: formatNumber(eff?.hours ?? 0) })}
          </div>
          {kpi.length > 0 && (
            <Link href={`/kpi/EMPLOYEE/${employee.id}?month=${kpi[0].month}`} className="mt-2 flex flex-wrap gap-x-3 text-xs">
              {kpi.map((k) => (
                <span key={k.month}>
                  <span className="text-muted">KPI {k.month}:</span> <KpiScore value={k.score} />
                </span>
              ))}
            </Link>
          )}
          {eff && eff.byWorkType.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {eff.byWorkType.map((w) => (
                <li key={w.workTypeId ?? "-"} className="flex justify-between gap-2">
                  <span>{wtName(w.workTypeId)}</span>
                  <span className="num text-muted">
                    {formatQty(w.ratePerHour)} {wtUnit(w.workTypeId)}/{t("employees.hourShort")} · {w.index.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {showSalary && (
          <Card className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted">{t("employees.costTitle")}</div>
            <dl className="mt-2 space-y-1 text-sm">
              {[
                [t("employees.salary"), Number(employee.salary)],
                [t("employees.gross"), grossSalary(company, employee.salary)],
                [t("payroll.employerCost"), employerMonthlyCost(company, employee.salary)],
                [t("employees.dailyCost"), dailyCost(company, employee)],
                [t("employees.hourlyCost"), hourlyCost(company, employee)],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num">{formatNumber(Math.round(v as number))}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted">{t("employees.costHint")}</p>
          </Card>
        )}
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-muted">{t("employees.login")}</div>
          {employee.user ? (
            <div className="mt-2 space-y-1 text-sm">
              <div>
                <Badge tone="success">{roleLabel(t, employee.user.roleDef)}</Badge>
              </div>
              <div className="num">{employee.user.phone ? formatPhone(employee.user.phone) : employee.user.email}</div>
              <div className="text-xs text-muted">
                {t("employees.lastLogin")}: {employee.user.lastLoginAt ? formatDateTime(employee.user.lastLoginAt) : "—"}
                {employee.user.mustChangePassword && ` · ${t("employees.awaitingFirstLogin")}`}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">{t("employees.noLogin")}</p>
          )}
          {can(user, "users.manage") && (
            <div className="-mx-5 -mb-5 mt-3 border-t border-border">
              <CreateUserForm action={grantLogin.bind(null, employee.id)}>
                <Field label={t("employees.phone")} required>
                  <Input name="phone" required inputMode="tel" defaultValue={employee.phone ? formatPhone(employee.phone) : ""} />
                </Field>
                <Field label={t("users.role")} required>
                  <Select name="roleId" defaultValue={employee.user?.roleId ?? roles.find((r) => r.key === "WORKER")?.id}>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {roleLabel(t, r)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </CreateUserForm>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("employees.openTasks")} />
          {tasks.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <Table>
              <tbody>
                {tasks.map((tk) => (
                  <tr key={tk.id}>
                    <Td>
                      <Link href={`/tasks/${tk.id}`} className="hover:text-primary">
                        <span className="num text-muted">T-{tk.number}</span> {tk.title}
                      </Link>
                      <div className="text-xs text-muted">{tk.project.name}</div>
                    </Td>
                    <Td>
                      <TaskStatusBadge status={tk.status} />
                    </Td>
                    <Td className="num text-right">{formatDate(tk.deadline)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title={t("employees.membershipHistory")} />
          {employee.memberships.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <Table>
              <tbody>
                {employee.memberships.map((m) => (
                  <tr key={m.id}>
                    <Td>
                      <Link href={`/employees/groups/${m.group.id}`} className="hover:text-primary">
                        {m.group.name}
                      </Link>
                    </Td>
                    <Td>{t(`groupRole.${m.role}`)}</Td>
                    <Td className="num text-right">
                      {formatDate(m.fromDate)} — {m.toDate ? formatDate(m.toDate) : t("groups.now")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={t("employees.recentSessions")} />
        {sessions.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("common.date")}</Th>
                <Th>{t("sessions.task")}</Th>
                <Th className="text-right">{t("sessions.hours")}</Th>
                <Th className="text-right">{t("sessions.share")}</Th>
                <Th className="text-right">{t("sessions.contribution")}</Th>
                {showSalary && <Th className="text-right">{t("sessions.laborCost")}</Th>}
                <Th>{t("sessions.confirmation")}</Th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((m) => (
                <tr key={m.id}>
                  <Td className="num">{formatDate(m.session.date)}</Td>
                  <Td>
                    <Link href={`/tasks/${m.session.task.id}`} className="hover:text-primary">
                      T-{m.session.task.number} {m.session.task.title}
                    </Link>
                    <div className="text-xs text-muted">{m.session.project.name}</div>
                  </Td>
                  <Td className="num text-right">{formatQty(Number(m.hours))}</Td>
                  <Td className="num text-right">{formatQty(Number(m.sharePercent))}%</Td>
                  <Td className="num text-right">
                    {formatQty(Number(m.contributionQty))} {m.session.task.unit}
                  </Td>
                  {showSalary && <Td className="num text-right">{formatNumber(Number(m.laborCostUzs))}</Td>}
                  <Td>
                    <Badge tone={m.confirmation === "CONFIRMED" ? "success" : m.confirmation === "DISPUTED" ? "danger" : "neutral"}>
                      {t(`confirmation.${m.confirmation}`)}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {can(user, "employees.edit") && (
        <Card className="mt-6">
          <CardHeader title={t("employees.passport")} subtitle={t("employees.passportPrivacy")} />
          <div className="p-5">
            <div className="mb-3 text-sm">
              <span className="text-muted">{t("employees.passportNumber")}: </span>
              <span className="num font-medium">{employee.passportNumber ?? "—"}</span>
            </div>
            <Attachments entityType="employee_passport" entityId={employee.id} canUpload />
          </div>
        </Card>
      )}

      {can(user, "employees.edit") && (
        <Card className="mt-6">
          <CardHeader title={t("common.edit")} />
          <EmployeeForm action={saveEmployee.bind(null, employee.id)} employee={employee} showSalary={showSalary} normDays={company.normWorkDays} />
        </Card>
      )}
    </>
  );
}
