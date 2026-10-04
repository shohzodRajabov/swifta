import { getTranslations } from "next-intl/server";
import type { Employee } from "@prisma/client";
import { formatPhone } from "@/lib/phone";
import { isoDate } from "@/lib/utils";
import { Field, Input, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import type { ActionState } from "@/lib/action";

export async function EmployeeForm({
  action,
  employee,
  showSalary,
  normDays,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  employee?: Employee | null;
  showSalary: boolean;
  normDays: number;
}) {
  const t = await getTranslations();
  return (
    <ActionForm action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label={t("employees.fullName")} required>
        <Input name="fullName" required defaultValue={employee?.fullName} />
      </Field>
      <Field label={t("employees.phone")}>
        <Input name="phone" inputMode="tel" placeholder="+998 90 123 45 67" defaultValue={employee?.phone ? formatPhone(employee.phone) : ""} />
      </Field>
      <Field label={t("employees.position")}>
        <Input name="position" defaultValue={employee?.position ?? ""} />
      </Field>
      <Field label={t("employees.department")}>
        <Input name="department" defaultValue={employee?.department ?? ""} />
      </Field>
      {showSalary && (
        <Field label={t("employees.salary")} hint={t("employees.salaryHint")}>
          <Input name="salary" inputMode="decimal" defaultValue={employee ? String(Number(employee.salary)) : ""} />
        </Field>
      )}
      <Field label={t("employees.normDays")} hint={t("employees.normDaysHint", { n: String(normDays) })}>
        <Input name="normDays" type="number" min={1} max={31} defaultValue={employee?.normDays ?? ""} />
      </Field>
      <Field label={t("employees.hireDate")}>
        <Input name="hireDate" type="date" defaultValue={isoDate(employee?.hireDate)} />
      </Field>
      {employee && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={employee.active} /> {t("employees.active")}
        </label>
      )}
      <Field label={t("common.note")} className="sm:col-span-2 lg:col-span-3">
        <Textarea name="note" defaultValue={employee?.note ?? ""} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-3">
        <SubmitButton>{t("common.save")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
