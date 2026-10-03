/** Minimal Telegram Bot API client (no SDK). */
export async function tgCall<T = unknown>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(json.description ?? `Telegram ${method} failed`);
  return json.result as T;
}

/** Send a (possibly long) HTML message, split into Telegram-sized chunks on line breaks. */
export async function sendLongMessage(token: string, chatId: string, html: string) {
  const parts: string[] = [];
  let current = "";
  for (const line of html.split("\n")) {
    if ((current + line).length > 3800) {
      parts.push(current);
      current = "";
    }
    current += line + "\n";
  }
  if (current.trim()) parts.push(current);
  for (const text of parts) {
    await tgCall(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
  }
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
