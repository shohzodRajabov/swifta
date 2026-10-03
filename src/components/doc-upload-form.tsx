"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui";
import { UploadButton } from "./upload";

/** "New document" form: choose a category and title, then pick the file. */
export function NewDocumentForm({ projectId, categories }: { projectId: string; categories: string[] }) {
  const t = useTranslations();
  const category = useRef<HTMLSelectElement>(null);
  const title = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-3 p-5 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
      <Field label={t("documents.category")}>
        <Select ref={category} defaultValue="CONTRACT">
          {categories.map((c) => (
            <option key={c} value={c}>
              {t(`docCategory.${c}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("documents.titleOptional")}>
        <Input ref={title} placeholder={t("documents.titlePlaceholder")} />
      </Field>
      <UploadButton
        variant="primary"
        label={t("documents.upload")}
        fields={{ purpose: "document", projectId }}
        getFields={() => ({ category: category.current?.value ?? "OTHER", title: title.current?.value ?? "" })}
      />
    </div>
  );
}
