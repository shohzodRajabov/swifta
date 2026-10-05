import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { DEFAULT_MODELS } from "@/server/ai/providers";
import { clearTranslations, saveAi, testAi } from "./actions";
import { AiTools } from "./ai-tools";

export default async function AiSettingsPage() {
  const user = await requirePermission("settings.manage");
  const t = await getTranslations();
  const c = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
  const cached = await db.textTranslation.count({ where: { companyId: user.companyId } });
  const on = c.aiAutoTranslate && !!c.aiApiKey && c.aiProvider !== "NONE";
  return (
    <>
      <PageHeader title={t("settings.ai.title")} back={{ href: "/settings", label: t("settings.title") }} />
      <div className="grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <Notice tone="primary">
            <p className="mb-2">{t("ai.intro")}</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>{t("ai.stepGemini")}</li>
              <li>{t("ai.stepAnthropic")}</li>
              <li>{t("ai.stepSave")}</li>
            </ol>
          </Notice>
          <Card>
            <CardHeader title={t("ai.settings")} action={on ? <Badge tone="success">{t("ai.on")}</Badge> : <Badge>{t("ai.off")}</Badge>} />
            <ActionForm action={saveAi} className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label={t("ai.provider")}>
                <Select name="provider" defaultValue={c.aiProvider}>
                  <option value="NONE">{t("ai.providerNone")}</option>
                  <option value="GEMINI">Google Gemini ({t("ai.free")})</option>
                  <option value="ANTHROPIC">Anthropic Claude</option>
                </Select>
              </Field>
              <Field label={t("ai.model")} hint={t("ai.modelHint", { gemini: DEFAULT_MODELS.GEMINI, claude: DEFAULT_MODELS.ANTHROPIC })}>
                <Input name="model" defaultValue={c.aiModel ?? ""} placeholder={c.aiProvider === "ANTHROPIC" ? DEFAULT_MODELS.ANTHROPIC : DEFAULT_MODELS.GEMINI} />
              </Field>
              <Field label={t("ai.apiKey")} hint={c.aiApiKey ? t("ai.keySaved") : t("ai.keyHint")} className="sm:col-span-2">
                <Input name="apiKey" type="password" autoComplete="off" placeholder={c.aiApiKey ? "••••••••" : ""} />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="auto" defaultChecked={c.aiAutoTranslate} className="size-4" />
                {t("ai.auto")}
              </label>
              <div className="flex items-center gap-4 sm:col-span-2">
                <SubmitButton>{t("common.save")}</SubmitButton>
                {c.aiApiKey && (
                  <label className="flex items-center gap-1.5 text-sm text-muted">
                    <input type="checkbox" name="clear" value="1" className="size-4" />
                    {t("ai.removeKey")}
                  </label>
                )}
              </div>
            </ActionForm>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <AiTools test={testAi} clear={clearTranslations} />
            <div className="mt-3 text-xs text-muted">{t("ai.cachedCount", { n: String(cached) })}</div>
          </Card>
          <Notice>{t("ai.privacy")}</Notice>
        </div>
      </div>
    </>
  );
}
