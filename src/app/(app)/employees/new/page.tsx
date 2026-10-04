import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { EmployeeForm } from "../employee-form";
import { saveEmployee } from "../actions";

export default async function NewEmployeePage() {
  const user = await requirePermission("employees.edit");
  const t = await getTranslations();
  const company = await db.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { normWorkDays: true } });
  return (
    <>
      <PageHeader title={t("employees.new")} back={{ href: "/employees", label: t("employees.title") }} />
      <Card>
        <EmployeeForm action={saveEmployee.bind(null, null)} showSalary={can(user, "salaries.view")} normDays={company.normWorkDays} />
      </Card>
    </>
  );
}
