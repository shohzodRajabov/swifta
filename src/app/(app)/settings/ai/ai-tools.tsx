"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

type State = { ok?: boolean; error?: string; errorParams?: Record<string, string>; data?: Record<string, string> } | null;

export function AiTools({ test, clear }: { test: (s: State) => Promise<State>; clear: (s: State) => Promise<State> }) {
  const t = useTranslations();
  const [res, testAction, testing] = useActionState(test, null);
  const [cl, clearAction, clearing] = useActionState(clear, null);
  return (
    <div className="flex flex-col gap-4">
      <form action={testAction} className="flex flex-col gap-2">
        <Button type="submit" variant="secondary" disabled={testing} className="self-start">
          {testing ? t("ai.testing") : t("ai.test")}
        </Button>
        {res?.error && <div className="text-sm text-danger">{t(`errors.${res.error}`, res.errorParams ?? {})}</div>}
        {res?.data && (
          <dl className="grid gap-1 text-sm">
            <dt className="text-xs text-muted">uz</dt>
            <dd>{res.data.sample}</dd>
            <dt className="text-xs text-muted">ru</dt>
            <dd>{res.data.ru}</dd>
            <dt className="text-xs text-muted">en</dt>
            <dd>{res.data.en}</dd>
          </dl>
        )}
      </form>
      <form action={clearAction} className="flex items-center gap-3">
        <Button type="submit" variant="ghost" disabled={clearing} className="self-start">
          {t("ai.clearCache")}
        </Button>
        {cl?.data && <span className="text-sm text-muted">{t("ai.cleared", { n: cl.data.deleted })}</span>}
      </form>
    </div>
  );
}
