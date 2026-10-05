"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@/components/ui";
import { verifySecondFactor } from "../actions";

export function VerifyForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(verifySecondFactor, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && (
        <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error === "locked" ? t("locked", { minutes: String(state.minutes ?? 15) }) : t("codeWrong")}
        </div>
      )}
      <Field label={t("code")}>
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="text-center text-lg tracking-[0.4em]" />
      </Field>
      <Button type="submit" disabled={pending} className="h-10">
        {t("verify")}
      </Button>
    </form>
  );
}
