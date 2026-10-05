"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { openSecret, sealSecret } from "@/lib/crypto-box";
import { audit } from "@/lib/audit";
import { fail, formObject, runAction, zOptText, type ActionState } from "@/lib/action";
import { DEFAULT_MODELS, translateBatch } from "@/server/ai/providers";

export async function saveAi(_: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("settings.manage", async (user) => {
    const d = z
      .object({
        provider: z.enum(["NONE", "GEMINI", "ANTHROPIC"]),
        apiKey: zOptText,
        model: zOptText,
        auto: z.preprocess((v) => v === "on", z.boolean()),
        clear: zOptText,
      })
      .parse({ auto: formData.get("auto") ?? "", ...formObject(formData) });
    const c = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
    const data: { aiProvider: string; aiModel: string | null; aiAutoTranslate: boolean; aiApiKey?: string | null } = {
      aiProvider: d.provider,
      aiModel: d.model,
      aiAutoTranslate: d.auto && d.provider !== "NONE",
    };
    if (d.clear === "1") data.aiApiKey = null;
    else if (d.apiKey) {
      if (d.provider === "NONE") fail("aiProvider");
      // Verify the key with a tiny request before saving it.
      await translateBatch({ provider: d.provider, apiKey: d.apiKey, model: d.model ?? DEFAULT_MODELS[d.provider] }, ["Salom"], "en", 20000).catch((e) =>
        fail("aiKey", { reason: String((e as Error).message).slice(0, 160) }),
      );
      data.aiApiKey = sealSecret(d.apiKey); // stored encrypted
    } else if (data.aiAutoTranslate && !c.aiApiKey) fail("aiKey", { reason: "—" });
    if (d.provider !== c.aiProvider && d.provider !== "NONE" && !d.apiKey && c.aiApiKey) fail("aiKeyForProvider");
    await db.$transaction(async (tx) => {
      await tx.company.update({ where: { id: user.companyId }, data });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "Company", user.companyId, "update", null, {
        ai: d.clear === "1" ? "key removed" : d.apiKey ? "key updated" : "settings updated",
        provider: d.provider,
        model: d.model,
        auto: data.aiAutoTranslate,
      });
    });
  });
  if (res?.ok) revalidatePath("/settings/ai");
  return res;
}

/** Translates a sample sentence with the saved settings. */
export async function testAi(_: ActionState): Promise<ActionState> {
  return runAction("settings.manage", async (user) => {
    const c = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
    if ((c.aiProvider !== "GEMINI" && c.aiProvider !== "ANTHROPIC") || !c.aiApiKey) fail("aiKey", { reason: "—" });
    const cfg = { provider: c.aiProvider as "GEMINI" | "ANTHROPIC", apiKey: openSecret(c.aiApiKey)!, model: c.aiModel ?? DEFAULT_MODELS[c.aiProvider as "GEMINI"] };
    const sample = "3-qavatdagi VRF ichki bloklarini o'rnatish, drenaj quvurlarini ulash";
    const [ru, en] = await Promise.all([translateBatch(cfg, [sample], "ru", 20000), translateBatch(cfg, [sample], "en", 20000)]).catch((e) =>
      fail("aiKey", { reason: String((e as Error).message).slice(0, 160) }),
    );
    return { sample, ru: ru[0], en: en[0] };
  });
}

export async function clearTranslations(_: ActionState): Promise<ActionState> {
  const res = await runAction("settings.manage", async (user) => {
    const r = await db.textTranslation.deleteMany({ where: { companyId: user.companyId } });
    return { deleted: String(r.count) };
  });
  if (res?.ok) revalidatePath("/settings/ai");
  return res;
}
