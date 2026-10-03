"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

type State = { ok?: boolean; error?: string; at?: number } | null;
type Action = (state: State, formData: FormData) => Promise<State>;

/** Form bound to a server action; shows translated errors and optionally resets on success. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const t = useTranslations("errors");
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.at]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {state?.error && (
        <div role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {t(state.error)}
        </div>
      )}
      {children}
    </form>
  );
}

export function SubmitButton({ children, variant }: { children: ReactNode; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  const t = useTranslations("common");
  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {pending ? t("saving") : children}
    </Button>
  );
}

/** Small inline delete button posting to a server action after confirmation. */
export function DeleteButton({ action, id, label }: { action: (formData: FormData) => Promise<void>; id: string; label?: string }) {
  const t = useTranslations("common");
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(t("confirmDelete"))) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" className="h-7 px-2 text-xs">
        {label ?? t("delete")}
      </Button>
    </form>
  );
}
