"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Field, Input } from "@/components/ui";
import { UploadButton } from "./upload";

/** New drawing (PDF): title + discipline, then the file. */
export function NewDrawingForm({ projectId }: { projectId: string }) {
  const t = useTranslations();
  const title = useRef<HTMLInputElement>(null);
  const discipline = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-3 p-5 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
      <Field label={t("drawings.titleField")}>
        <Input ref={title} placeholder={t("drawings.titlePlaceholder")} />
      </Field>
      <Field label={t("drawings.discipline")}>
        <Input ref={discipline} placeholder={t("drawings.disciplinePlaceholder")} />
      </Field>
      <UploadButton
        variant="primary"
        accept=".pdf"
        label={t("drawings.upload")}
        fields={{ purpose: "drawing", projectId }}
        getFields={() => ({ title: title.current?.value ?? "", discipline: discipline.current?.value ?? "" })}
      />
    </div>
  );
}

/** New version of an existing drawing. */
export function NewVersionButton({ projectId, drawingId }: { projectId: string; drawingId: string }) {
  const t = useTranslations();
  const note = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input ref={note} placeholder={t("drawings.versionNote")} className="h-9 w-56" />
      <UploadButton accept=".pdf" label={t("drawings.uploadVersion")} fields={{ purpose: "drawing", projectId, drawingId }} getFields={() => ({ note: note.current?.value ?? "" })} />
    </div>
  );
}
