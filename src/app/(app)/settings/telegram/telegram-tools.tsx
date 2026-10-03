"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

type State = { ok?: boolean; error?: string; errorParams?: Record<string, string>; data?: Record<string, string> } | null;

export function TelegramTools({
  findChats,
  sendTest,
}: {
  findChats: (s: State) => Promise<State>;
  sendTest: (s: State) => Promise<State>;
}) {
  const t = useTranslations();
  const [chats, findAction, finding] = useActionState(findChats, null);
  const [test, testAction, testing] = useActionState(sendTest, null);
  const list = chats?.data?.chats && chats.data.chats !== "-" ? chats.data.chats.split("\n").map((l) => l.split("|")) : [];
  return (
    <div className="flex flex-col gap-4">
      <form action={findAction} className="flex flex-col gap-2">
        <Button type="submit" variant="secondary" disabled={finding} className="self-start">
          {t("telegram.findChats")}
        </Button>
        {chats?.error && <div className="text-sm text-danger">{t(`errors.${chats.error}`, chats.errorParams ?? {})}</div>}
        {chats?.ok && list.length === 0 && <div className="text-sm text-muted">{t("telegram.noChats")}</div>}
        {list.length > 0 && (
          <ul className="space-y-1 text-sm">
            {list.map(([title, id]) => (
              <li key={id}>
                {title}: <code className="rounded bg-surface-2 px-1.5">{id}</code>
              </li>
            ))}
          </ul>
        )}
      </form>
      <form action={testAction} className="flex flex-col gap-2">
        <Button type="submit" disabled={testing} className="self-start">
          {t("telegram.sendNow")}
        </Button>
        {test?.error && <div className="text-sm text-danger">{t(`errors.${test.error}`, test.errorParams ?? {})}</div>}
        {test?.ok && <div className="text-sm text-success">{t("telegram.sent")}</div>}
      </form>
    </div>
  );
}
