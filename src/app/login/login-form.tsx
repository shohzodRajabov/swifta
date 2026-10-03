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
          {t("invalid")}
        </div>
      )}
      <Field label={t("email")}>
        <Input name="email" type="email" autoComplete="username" required autoFocus />
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
