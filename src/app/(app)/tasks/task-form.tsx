import { getTranslations } from "next-intl/server";
import type { Task } from "@prisma/client";
import { isoDate } from "@/lib/utils";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import type { ActionState } from "@/lib/action";

type Opt = { id: string; name: string };

export async function TaskForm({
  action,
  task,
  projectId,
  workTypes,
  locations,
  parents,
  users,
  employees,
  groups,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  task?: Task | null;
  projectId?: string;
  workTypes: (Opt & { unit: string })[];
  locations: Opt[];
  parents: (Opt & { number: number })[];
  users: Opt[];
  employees?: Opt[];
  groups?: Opt[];
}) {
  const t = await getTranslations();
  const num = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
  const userSelect = (name: string, value: string | null | undefined) => (
    <Select name={name} defaultValue={value ?? ""}>
      <option value="">—</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </Select>
  );
  return (
    <ActionForm action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      <Field label={t("tasks.titleField")} required className="sm:col-span-2">
        <Input name="title" required defaultValue={task?.title} />
      </Field>
      <Field label={t("tasks.workType")}>
        <Select name="workTypeId" defaultValue={task?.workTypeId ?? ""}>
          <option value="">—</option>
          {workTypes.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.unit})
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("tasks.location")} hint={locations.length === 0 ? t("tasks.locationHint") : undefined}>
        <Select name="locationId" defaultValue={task?.locationId ?? ""}>
          <option value="">—</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("tasks.plannedQty")}>
        <Input name="plannedQty" inputMode="decimal" defaultValue={num(task?.plannedQty)} />
      </Field>
      <Field label={t("common.unit")} hint={t("tasks.unitHint")}>
        <Input name="unit" defaultValue={task?.unit ?? ""} />
      </Field>
      <Field label={t("tasks.plannedValue")} hint={t("tasks.plannedValueHint")}>
        <Input name="plannedValueUzs" inputMode="decimal" defaultValue={num(task?.plannedValueUzs)} />
      </Field>
      <Field label={t("tasks.weight")} hint={t("tasks.weightHint")}>
        <Input name="weight" inputMode="decimal" defaultValue={num(task?.weight)} />
      </Field>
      <Field label={t("tasks.startDate")}>
        <Input type="date" name="startDate" defaultValue={isoDate(task?.startDate)} />
      </Field>
      <Field label={t("tasks.deadline")}>
        <Input type="date" name="deadline" defaultValue={isoDate(task?.deadline)} />
      </Field>
      <Field label={t("projects.priority")}>
        <Select name="priority" defaultValue={task?.priority ?? "MEDIUM"}>
          {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((p) => (
            <option key={p} value={p}>
              {t(`priority.${p}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("tasks.parent")}>
        <Select name="parentId" defaultValue={task?.parentId ?? ""}>
          <option value="">—</option>
          {parents
            .filter((p) => p.id !== task?.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                T-{p.number} {p.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label={t("tasks.responsible")}>{userSelect("responsibleId", task?.responsibleId)}</Field>
      <Field label={t("tasks.inspector")}>{userSelect("inspectorId", task?.inspectorId)}</Field>
      <Field label={t("tasks.approver")}>{userSelect("approverId", task?.approverId)}</Field>
      <Field label={t("tasks.description")} className="sm:col-span-2 lg:col-span-4">
        <Textarea name="description" defaultValue={task?.description ?? ""} />
      </Field>

      {groups && employees && (
        <>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">{t("tasks.assignGroups")}</legend>
            <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="groupIds" value={g.id} /> {g.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-sm font-medium">{t("tasks.assignEmployees")}</legend>
            <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
              {employees.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="employeeIds" value={e.id} /> {e.name}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className="text-sm font-medium">{t("tasks.recorders")}</legend>
        <p className="mb-1.5 text-xs text-muted">{t("tasks.recordersHint")}</p>
        <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="recorderUserIds" value={u.id} defaultChecked={task?.recorderUserIds.includes(u.id)} /> {u.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2 lg:col-span-4">
        <SubmitButton>{task ? t("common.save") : t("common.create")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
