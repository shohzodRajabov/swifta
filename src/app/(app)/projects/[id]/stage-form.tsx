"use client";

import { useTranslations } from "next-intl";
import type { ProjectStage } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input, Select } from "@/components/ui";
import { STAGES, stageIndex } from "@/lib/stages";
import type { ActionState } from "@/lib/action";

export function StageForm({
  action,
  stage,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  stage: ProjectStage;
}) {
  const t = useTranslations();
  const next = STAGES[Math.min(stageIndex(stage) + 1, STAGES.length - 1)];
  return (
    <ActionForm action={action} resetOnSuccess className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{t("projects.changeStage")}:</span>
      <Select name="stage" defaultValue={next} key={stage} className="w-56">
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {t(`stages.${s}`)}
          </option>
        ))}
      </Select>
      <Input name="note" placeholder={t("projects.stageNote")} className="w-64 flex-1" />
      <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
    </ActionForm>
  );
}
