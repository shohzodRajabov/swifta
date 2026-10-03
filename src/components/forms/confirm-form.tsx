"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

/** A one-button form that asks for confirmation before posting to a server action. */
export function ConfirmForm({
  action,
  id,
  label,
  extra,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  extra?: Record<string, string>;
}) {
  const t = useTranslations("common");
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(t("confirmDelete"))) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" variant="secondary" className="text-danger">
        {label}
      </Button>
    </form>
  );
}
