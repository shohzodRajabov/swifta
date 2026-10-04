import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const ATTENDANCE_TYPES = ["OBJECT", "WORKSHOP", "TRAVEL", "OFFICE", "IDLE_MATERIAL", "IDLE_CLIENT", "IDLE_OTHER", "ABSENT", "LEAVE", "SICK"] as const;

export const EMPLOYEE_TABS = ["list", "groups", "attendance", "payroll"] as const;
export type EmployeeTab = (typeof EMPLOYEE_TABS)[number];

export function employeeTabVisible(user: CurrentUser, tab: EmployeeTab) {
  if (tab === "payroll") return can(user, "payroll.manage") || can(user, "salaries.view");
  if (tab === "attendance") return can(user, "attendance.manage") || can(user, "employees.edit");
  return true;
}

export async function EmployeeTabs({ user, active }: { user: CurrentUser; active: EmployeeTab }) {
  const t = await getTranslations("employees");
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {EMPLOYEE_TABS.filter((k) => employeeTabVisible(user, k)).map((k) => (
        <Link
          key={k}
          href={k === "list" ? "/employees" : `/employees?tab=${k}`}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
            active === k ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t(`tab_${k}`)}
        </Link>
      ))}
    </nav>
  );
}
