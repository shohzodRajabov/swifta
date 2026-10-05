"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@/components/ui";
import { confirmTotp, disableTotp } from "./actions";

export function CodeForm({ mode }: { mode: "confirm" | "disable" }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(mode === "confirm" ? confirmTotp : disableTotp, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error && (
        <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error === "locked" ? t("locked", { minutes: "15" }) : state.error === "required" ? t("twoFactorRequired") : t("codeWrong")}
        </div>
      )}
      <Field label={t("code")}>
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="text-center text-lg tracking-[0.4em]" />
      </Field>
      <Button type="submit" disabled={pending} variant={mode === "disable" ? "secondary" : undefined} className="h-10">
        {mode === "confirm" ? t("twoFactorConfirm") : t("twoFactorDisable")}
      </Button>
    </form>
  );
}
