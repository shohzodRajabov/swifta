import "server-only";

export type AiProvider = "NONE" | "GEMINI" | "ANTHROPIC";
export const AI_PROVIDERS: AiProvider[] = ["NONE", "GEMINI", "ANTHROPIC"];
export const DEFAULT_MODELS: Record<Exclude<AiProvider, "NONE">, string> = {
  GEMINI: "gemini-flash-lite-latest",
  ANTHROPIC: "claude-haiku-4-5-20251001",
};

export type AiConfig = { provider: Exclude<AiProvider, "NONE">; apiKey: string; model: string };

const LANG: Record<string, string> = { uz: "Uzbek (Latin script)", ru: "Russian", en: "English" };

function prompt(texts: string[], locale: string) {
  return [
    `Translate each string of the JSON array into ${LANG[locale] ?? locale}.`,
    "Context: an HVAC construction company's ERP (ventilation, air conditioning, VRF, chillers, installation work).",
    "Rules: keep the meaning and tone; keep numbers, units, codes, model numbers, people's and company names as they are;",
    "if a string is already in the target language, return it unchanged; do not add explanations.",
    `Return ONLY a JSON array of exactly ${texts.length} strings in the same order.`,
    "",
    JSON.stringify(texts),
  ].join("\n");
}

export function parseArray(raw: string, n: number): string[] {
  const m = raw.match(/\[[\s\S]*\]/);
  const arr = JSON.parse(m ? m[0] : raw);
  if (!Array.isArray(arr) || arr.length !== n || arr.some((x) => typeof x !== "string")) throw new Error("bad AI response shape");
  return arr;
}

/** One batch request; throws on HTTP / format errors (the caller falls back to the original texts). */
export async function translateBatch(cfg: AiConfig, texts: string[], locale: string, timeoutMs = 15000): Promise<string[]> {
  const signal = AbortSignal.timeout(timeoutMs);
  if (cfg.provider === "GEMINI") {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt(texts, locale) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return parseArray(j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "", texts.length);
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: cfg.model, max_tokens: 8192, temperature: 0.1, messages: [{ role: "user", content: prompt(texts, locale) }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { content?: { type: string; text?: string }[] };
  return parseArray(j.content?.filter((c) => c.type === "text").map((c) => c.text).join("") ?? "", texts.length);
}
