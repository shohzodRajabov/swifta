"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@/components/ui";
import { setOwnPassword } from "@/app/login/actions";

export function SetPasswordForm({ needCurrent }: { needCurrent: boolean }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(setOwnPassword, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && (
        <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(state.error === "mismatch" ? "passwordMismatch" : state.error === "current" ? "currentWrong" : state.error === "same" ? "passwordSame" : "passwordShort")}
        </div>
      )}
      {needCurrent && (
        <Field label={t("currentPassword")}>
          <Input name="current" type="password" autoComplete="current-password" required autoFocus />
        </Field>
      )}
      <Field label={t("newPassword")} hint={t("passwordHint")}>
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus={!needCurrent} />
      </Field>
      <Field label={t("confirmPassword")}>
        <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Button type="submit" disabled={pending} className="h-10">
        {t("savePassword")}
      </Button>
    </form>
  );
}
