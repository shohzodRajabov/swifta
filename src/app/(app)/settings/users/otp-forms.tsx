"use client";

import { useActionState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui";

type State = { ok?: boolean; error?: string; at?: number; data?: Record<string, string> } | null;

/** Shows the one-time password returned by the action exactly once. */
function OtpNotice({ state }: { state: State }) {
  const t = useTranslations("users");
  if (!state?.data?.password) return null;
  return (
    <div role="status" className="mt-3 rounded-lg border border-success/30 bg-success-soft px-3 py-2.5 text-sm">
      <div className="font-medium text-success">{t("otpIssued", { name: state.data.name ?? "" })}</div>
      <div className="mt-1 flex items-center gap-2">
        <KeyRound className="size-4 text-success" aria-hidden />
        <code className="rounded bg-surface px-2 py-0.5 text-base font-semibold tracking-wider">{state.data.password}</code>
      </div>
      <div className="mt-1 text-xs text-muted">{t("otpHint")}</div>
    </div>
  );
}

export function CreateUserForm({
  action,
  children,
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const t = useTranslations();
  return (
    <form action={formAction} key={state?.at} className="p-5">
      {state?.error && (
        <div role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(`errors.${state.error}`)}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      <div className="mt-4">
        <Button type="submit" disabled={pending}>
          {t("common.create")}
        </Button>
      </div>
      <OtpNotice state={state} />
    </form>
  );
}

export function ResetPasswordButton({ action }: { action: (state: State) => Promise<State> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const t = useTranslations("users");
  return (
    <form action={formAction}>
      <Button type="submit" variant="ghost" className="h-8 px-2 text-xs" disabled={pending}>
        <KeyRound className="size-3.5" aria-hidden />
        {t("resetPassword")}
      </Button>
      <OtpNotice state={state} />
    </form>
  );
}
