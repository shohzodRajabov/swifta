"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action";

type Group = { id: string; name: string; members: { employeeId: string; role: string }[] };
type Person = { id: string; fullName: string };
type Material = { value: string; label: string };

/** Work session entry: quantity is entered once for the whole group; shares are computed on the server. */
export function SessionForm({
  action,
  groups,
  people,
  materials,
  defaultGroupId,
  defaultMethod,
  unit,
  remaining,
  today,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  groups: Group[];
  people: Person[];
  materials: Material[];
  defaultGroupId: string | null;
  defaultMethod: string;
  unit: string | null;
  remaining: number | null;
  today: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, null);
  const [groupId, setGroupId] = useState(defaultGroupId ?? "");
  const [method, setMethod] = useState(defaultMethod);
  const groupMembers = useMemo(() => groups.find((g) => g.id === groupId)?.members ?? [], [groups, groupId]);
  const [selected, setSelected] = useState<Set<string>>(new Set(groupMembers.map((m) => m.employeeId)));
  const [matRows, setMatRows] = useState(1);

  const ordered = [...people].sort((a, b) => {
    const ia = groupMembers.findIndex((m) => m.employeeId === a.id);
    const ib = groupMembers.findIndex((m) => m.employeeId === b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.fullName.localeCompare(b.fullName);
  });
  const roleOf = (id: string) => groupMembers.find((m) => m.employeeId === id)?.role;

  return (
    <form action={formAction} key={state?.ok ? state.at : "f"} className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
      {state?.error && (
        <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2 xl:col-span-4">
          {t(`errors.${state.error}`, state.errorParams ?? {})}
        </div>
      )}
      {state?.ok && (
        <div role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success sm:col-span-2 xl:col-span-4">
          {t("sessions.saved")}
        </div>
      )}
      <Field label={t("sessions.group")}>
        <Select
          name="groupId"
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setSelected(new Set((groups.find((g) => g.id === e.target.value)?.members ?? []).map((m) => m.employeeId)));
          }}
        >
          <option value="">{t("sessions.noGroup")}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("common.date")} required>
        <Input type="date" name="date" required defaultValue={today} max={today} />
      </Field>
      <Field label={t("sessions.hours")} required>
        <Input name="hours" inputMode="decimal" required defaultValue="8" />
      </Field>
      <Field
        label={`${t("sessions.quantity")}${unit ? ` (${unit})` : ""}`}
        required
        hint={remaining !== null ? t("sessions.remaining", { qty: String(Math.round(remaining * 100) / 100), unit: unit ?? "" }) : undefined}
      >
        <Input name="quantity" inputMode="decimal" required />
      </Field>

      <fieldset className="sm:col-span-2 xl:col-span-4">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium">{t("sessions.members")}</legend>
          <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)} className="h-8 w-auto text-xs">
            {["EQUAL", "LEADER", "RULE", "EFFICIENCY"].map((m) => (
              <option key={m} value={m}>
                {t(`contribution.${m}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ordered.map((p) => {
            const on = selected.has(p.id);
            return (
              <div key={p.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${on ? "border-primary/40 bg-primary-soft/40" : "border-border"}`}>
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    name="memberIds"
                    value={p.id}
                    checked={on}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setSelected(next);
                    }}
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate">{p.fullName}</span>
                    {roleOf(p.id) && <span className="text-xs text-muted">{t(`groupRole.${roleOf(p.id)}`)}</span>}
                  </span>
                </label>
                {on && (
                  <Input name={`hours_${p.id}`} inputMode="decimal" placeholder={t("sessions.hoursShort")} className="h-7 w-14 px-1.5 text-xs" title={t("sessions.memberHoursHint")} />
                )}
                {on && method === "LEADER" && <Input name={`percent_${p.id}`} inputMode="decimal" placeholder="%" className="h-7 w-14 px-1.5 text-xs" required />}
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">{t(`sessions.methodHint_${method}`)}</p>
      </fieldset>

      {materials.length > 0 && (
        <fieldset className="sm:col-span-2 xl:col-span-4">
          <legend className="mb-1.5 text-sm font-medium">{t("sessions.materials")}</legend>
          <div className="flex flex-col gap-2">
            {Array.from({ length: matRows }, (_, i) => (
              <div key={i} className="flex gap-2">
                <Select name={`mat_${i}`} defaultValue="" className="flex-1">
                  <option value="">—</option>
                  {materials.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
                <Input name={`matQty_${i}`} inputMode="decimal" placeholder={t("common.quantity")} className="w-28" />
              </div>
            ))}
            {matRows < 5 && (
              <Button type="button" variant="ghost" className="self-start text-xs" onClick={() => setMatRows(matRows + 1)}>
                + {t("sessions.addMaterial")}
              </Button>
            )}
          </div>
        </fieldset>
      )}

      <Field label={t("common.note")} className="sm:col-span-2">
        <Textarea name="note" className="min-h-14" />
      </Field>
      <Field label={t("sessions.problems")} className="sm:col-span-2">
        <Textarea name="problems" className="min-h-14" />
      </Field>
      <div className="sm:col-span-2 xl:col-span-4">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("sessions.submit")}
        </Button>
      </div>
    </form>
  );
}
