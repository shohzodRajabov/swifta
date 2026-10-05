"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@/components/ui";
import { login } from "./actions";

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error && (
        <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error === "locked" ? t("locked", { minutes: String(state.minutes ?? 15) }) : state.error === "otpExpired" ? t("otpExpired") : t("invalid")}
        </div>
      )}
      <Field label={t("identifier")} hint={t("identifierHint")}>
        <Input name="identifier" autoComplete="username" required autoFocus placeholder="+998 90 123 45 67" />
      </Field>
      <Field label={t("password")}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending} className="mt-1 h-10">
        {t("submit")}
      </Button>
    </form>
  );
}
