import type { Prisma } from "@prisma/client";

// Labour cost estimation from the monthly salary (management accounting, not official payroll).
//   gross = net / (1 - income tax)        when salaries are entered "qo'lga" (net)
//   employer cost = gross * (1 + social tax)
//   daily = employer cost / norm days;  hourly = daily / norm hours per day

type Num = Prisma.Decimal | number | null | undefined;
const n = (v: Num) => (v === null || v === undefined ? 0 : Number(v));

export type PayrollSettings = {
  normWorkDays: number;
  normHoursPerDay: Num;
  salaryInputMode: "NET" | "GROSS";
  incomeTaxRate: Num;
  socialTaxRate: Num;
};

export function grossSalary(settings: PayrollSettings, salary: Num): number {
  const s = n(salary);
  if (settings.salaryInputMode === "NET") {
    const tax = n(settings.incomeTaxRate) / 100;
    return tax < 1 ? s / (1 - tax) : s;
  }
  return s;
}

export function employerMonthlyCost(settings: PayrollSettings, salary: Num): number {
  return grossSalary(settings, salary) * (1 + n(settings.socialTaxRate) / 100);
}

export function normDaysFor(settings: PayrollSettings, employee: { normDays: number | null }): number {
  return employee.normDays && employee.normDays > 0 ? employee.normDays : settings.normWorkDays || 22;
}

export function dailyCost(settings: PayrollSettings, employee: { salary: Num; normDays: number | null }): number {
  return employerMonthlyCost(settings, employee.salary) / normDaysFor(settings, employee);
}

export function hourlyCost(settings: PayrollSettings, employee: { salary: Num; normDays: number | null }): number {
  const hours = n(settings.normHoursPerDay) || 8;
  return dailyCost(settings, employee) / hours;
}

/** Attendance types that count as worked days (not the worker's fault when there is no work). */
export const WORKED_DAY_TYPES = [
  "OBJECT",
  "WORKSHOP",
  "TRAVEL",
  "OFFICE",
  "IDLE_MATERIAL",
  "IDLE_CLIENT",
  "IDLE_OTHER",
] as const;
