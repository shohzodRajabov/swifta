"use client";

import { useTranslations } from "next-intl";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input, Select } from "@/components/ui";
import type { ActionState } from "@/lib/action";

type Group = { id: string; letter: string; name: string; statuses: { id: string; code: string; name: string; active: boolean }[] };

export function StatusForm({
  action,
  catalog,
  currentStatusId,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  catalog: Group[];
  currentStatusId: string | null;
}) {
  const t = useTranslations();
  // Suggest the next status in order.
  const flat = catalog.flatMap((g) => g.statuses.filter((s) => s.active));
  const idx = flat.findIndex((s) => s.id === currentStatusId);
  const next = flat[Math.min(idx + 1, flat.length - 1)]?.id ?? flat[0]?.id;
  return (
    <ActionForm action={action} resetOnSuccess className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{t("projects.changeStatus")}:</span>
      <Select name="statusId" defaultValue={next} key={currentStatusId} className="w-72">
        {catalog.map((g) => (
          <optgroup key={g.id} label={`${g.letter}. ${g.name}`}>
            {g.statuses
              .filter((s) => s.active || s.id === currentStatusId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
          </optgroup>
        ))}
      </Select>
      <Input name="note" placeholder={t("projects.stageNote")} className="w-64 flex-1" />
      <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
    </ActionForm>
  );
}
