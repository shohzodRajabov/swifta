"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { openSecret, sealSecret } from "@/lib/crypto-box";
import { audit } from "@/lib/audit";
import { fail, formObject, runAction, zNumber, zOptText, type ActionState } from "@/lib/action";
import { tgCall } from "@/server/telegram/api";
import { sendDigest } from "@/server/telegram/digest";

export async function saveTelegram(_: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("settings.manage", async (user) => {
    const d = z
      .object({ token: zOptText, chatId: zOptText, hour: zNumber.pipe(z.number().int().min(0).max(23)), clear: zOptText })
      .parse(formObject(formData));
    const data: { telegramBotToken?: string | null; telegramChatId: string | null; telegramDigestHour: number } = {
      telegramChatId: d.chatId,
      telegramDigestHour: d.hour,
    };
    if (d.clear === "1") data.telegramBotToken = null;
    else if (d.token) {
      if (!/^\d+:[\w-]{30,}$/.test(d.token)) fail("telegramToken");
      await tgCall(d.token, "getMe").catch(() => fail("telegramToken"));
      data.telegramBotToken = sealSecret(d.token); // stored encrypted (X8)
    }
    await db.$transaction(async (tx) => {
      await tx.company.update({ where: { id: user.companyId }, data });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "Company", user.companyId, "update", null, {
        telegram: d.clear === "1" ? "cleared" : d.token ? "token updated" : "settings updated",
        chatId: d.chatId,
        hour: d.hour,
      });
    });
  });
  if (res?.ok) revalidatePath("/settings/telegram");
  return res;
}

/** Lists group chats the bot has seen recently (add the bot to the group and send any message first). */
export async function findChats(_: ActionState): Promise<ActionState> {
  return runAction("settings.manage", async (user) => {
    const c = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
    if (!c.telegramBotToken) fail("telegramToken");
    const updates = await tgCall<{ message?: { chat: { id: number; title?: string; type: string } }; my_chat_member?: { chat: { id: number; title?: string; type: string } } }[]>(
      openSecret(c.telegramBotToken)!,
      "getUpdates",
      { allowed_updates: ["message", "my_chat_member"] },
    );
    const chats = new Map<string, string>();
    for (const u of updates) {
      const chat = u.message?.chat ?? u.my_chat_member?.chat;
      if (chat && chat.type !== "private") chats.set(String(chat.id), chat.title ?? String(chat.id));
    }
    return { chats: [...chats.entries()].map(([id, title]) => `${title}|${id}`).join("\n") || "-" };
  });
}

export async function sendTest(_: ActionState): Promise<ActionState> {
  return runAction("settings.manage", async (user) => {
    const c = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
    if (!c.telegramBotToken || !c.telegramChatId) fail("telegramNotConfigured");
    await sendDigest(user.companyId).catch((e) => fail("telegramSend", { message: String(e?.message ?? e) }));
  });
}
