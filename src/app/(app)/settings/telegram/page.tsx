import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, CardHeader, Field, Input, Notice, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { buildDigest } from "@/server/telegram/digest";
import { findChats, saveTelegram, sendTest } from "./actions";
import { TelegramTools } from "./telegram-tools";

export default async function TelegramPage() {
  const user = await requirePermission("settings.manage");
  const t = await getTranslations();
  const c = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
  const preview = await buildDigest(user.companyId);
  return (
    <>
      <PageHeader title={t("settings.telegram.title")} back={{ href: "/settings", label: t("settings.title") }} />
      <div className="grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-6">
          <Notice tone="primary">
            <ol className="list-decimal space-y-1 pl-4">
              <li>{t("telegram.step1")}</li>
              <li>{t("telegram.step2")}</li>
              <li>{t("telegram.step3")}</li>
              <li>{t("telegram.step4")}</li>
            </ol>
          </Notice>
          <Card>
            <CardHeader
              title={t("telegram.settings")}
              action={c.telegramBotToken ? <Badge tone="success">{t("telegram.connected")}</Badge> : <Badge>{t("telegram.notConnected")}</Badge>}
            />
            <ActionForm action={saveTelegram} className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label={t("telegram.token")} hint={c.telegramBotToken ? t("telegram.tokenSaved") : t("telegram.tokenHint")} className="sm:col-span-2">
                <Input name="token" type="password" autoComplete="off" placeholder={c.telegramBotToken ? "••••••••" : "123456:ABC..."} />
              </Field>
              <Field label={t("telegram.chatId")} hint={t("telegram.chatIdHint")}>
                <Input name="chatId" defaultValue={c.telegramChatId ?? ""} placeholder="-1001234567890" />
              </Field>
              <Field label={t("telegram.hour")} hint={t("telegram.hourHint")}>
                <Input name="hour" inputMode="numeric" defaultValue={c.telegramDigestHour} />
              </Field>
              <div className="flex items-center gap-4 sm:col-span-2">
                <SubmitButton>{t("common.save")}</SubmitButton>
                {c.telegramBotToken && (
                  <label className="flex items-center gap-1.5 text-sm text-muted">
                    <input type="checkbox" name="clear" value="1" className="size-4" />
                    {t("telegram.disconnect")}
                  </label>
                )}
              </div>
              {c.telegramLastDigestAt && (
                <div className="text-xs text-muted sm:col-span-2">
                  {t("telegram.lastSent")}: {formatDateTime(c.telegramLastDigestAt)}
                </div>
              )}
            </ActionForm>
          </Card>
          {c.telegramBotToken && (
            <Card className="p-5">
              <TelegramTools findChats={findChats} sendTest={sendTest} />
            </Card>
          )}
        </div>
        <Card className="self-start">
          <CardHeader title={t("telegram.preview")} />
          <pre className="whitespace-pre-wrap break-words p-5 font-sans text-sm" dangerouslySetInnerHTML={{ __html: preview.replace(/\n/g, "<br/>") }} />
        </Card>
      </div>
    </>
  );
}
