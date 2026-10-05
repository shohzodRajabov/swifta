import "server-only";
import { db } from "@/lib/db";
import { dailyCost, employerMonthlyCost, grossSalary, hourlyCost, normDaysFor, WORKED_DAY_TYPES } from "@/lib/payroll";

export type PayrollRow = {
  employeeId: string;
  fullName: string;
  salary: number;
  gross: number;
  employerCost: number;
  normDays: number;
  workedDays: number;
  dailyRate: number;
  earned: number;
  overtimeHours: number;
  overtimePay: number;
  allocated: number;
  unallocated: number;
  byType: Record<string, number>;
};

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0)) };
}

/**
 * Estimated labour cost for a month: employer cost per day × worked days; the part already charged to projects
 * (approved work sessions, idle/travel days of a project) is "allocated", the rest goes to overhead on close.
 */
export async function computePayroll(companyId: string, month: string): Promise<{ rows: PayrollRow[]; pendingSessions: number }> {
  const { from, to } = monthRange(month);
  const [company, employees, attendance, members, pendingSessions] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId } }),
    db.employee.findMany({ where: { companyId }, orderBy: { fullName: "asc" } }),
    db.attendanceDay.findMany({ where: { companyId, date: { gte: from, lte: to } } }),
    db.workSessionMember.findMany({
      where: { session: { companyId, status: "APPROVED", date: { gte: from, lte: to } } },
      select: { employeeId: true, laborCostUzs: true, overtimeHours: true },
    }),
    db.workSession.count({ where: { companyId, status: "SUBMITTED", date: { gte: from, lte: to } } }),
  ]);
  const rows: PayrollRow[] = [];
  for (const e of employees) {
    const days = attendance.filter((a) => a.employeeId === e.id);
    if (!e.active && days.length === 0) continue;
    const worked = days.filter((d) => (WORKED_DAY_TYPES as readonly string[]).includes(d.type));
    const byType: Record<string, number> = {};
    for (const d of days) byType[d.type] = (byType[d.type] ?? 0) + 1;
    const daily = dailyCost(company, e);
    const idleCharged = worked.filter((d) => d.type !== "OBJECT" && d.projectId).length * daily;
    const sessionCost = members.filter((m) => m.employeeId === e.id).reduce((s, m) => s + Number(m.laborCostUzs), 0);
    // Overtime (M5): hours above the daily norm are paid on top, with the company multiplier.
    const otHours = members.filter((m) => m.employeeId === e.id).reduce((x, m) => x + Number(m.overtimeHours), 0);
    const otPay = otHours * hourlyCost(company, e) * (Number(company.overtimeMultiplier) || 1);
    const earned = daily * worked.length + otPay;
    const allocated = Math.min(earned, sessionCost + idleCharged);
    rows.push({
      employeeId: e.id,
      fullName: e.fullName,
      salary: Number(e.salary),
      gross: grossSalary(company, e.salary),
      employerCost: employerMonthlyCost(company, e.salary),
      normDays: normDaysFor(company, e),
      workedDays: worked.length,
      dailyRate: daily,
      earned,
      overtimeHours: otHours,
      overtimePay: otPay,
      allocated,
      unallocated: Math.max(0, earned - allocated),
      byType,
    });
  }
  return { rows, pendingSessions };
}
