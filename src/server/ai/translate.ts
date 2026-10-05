import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { db } from "@/lib/db";
import { openSecret } from "@/lib/crypto-box";
import { translit } from "@/lib/translit-uz";
import { DEFAULT_MODELS, translateBatch, type AiConfig } from "./providers";

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);
/** Texts that need no translation: empty, numbers, codes. */
const trivial = (s: string) => !/\p{L}{2,}/u.test(s);
const MAX_LEN = 4000;
const BATCH = 40;
/** After an AI failure (quota, bad key, network) pages show originals for a while instead of waiting again. */
const BACKOFF_MS = 5 * 60_000;
const failedAt = new Map<string, number>();

export async function aiConfig(companyId: string): Promise<AiConfig | null> {
  const sel = { aiProvider: true, aiApiKey: true, aiModel: true, aiAutoTranslate: true, isDemo: true } as const;
  let c = await db.company.findUnique({ where: { id: companyId }, select: sel });
  // The demo workspace uses the real company's AI settings (single-company deployment).
  if (c?.isDemo) c = await db.company.findFirst({ where: { isDemo: false, aiAutoTranslate: true }, select: sel });
  if (!c || !c.aiAutoTranslate || (c.aiProvider !== "GEMINI" && c.aiProvider !== "ANTHROPIC") || !c.aiApiKey) return null;
  const apiKey = openSecret(c.aiApiKey);
  if (!apiKey) return null;
  return { provider: c.aiProvider, apiKey, model: c.aiModel?.trim() || DEFAULT_MODELS[c.aiProvider] };
}

/**
 * Translates user texts into the locale: cached per company; misses go to the AI in batches. Uzbek Cyrillic is
 * the Uzbek (Latin) translation transliterated, so it costs no extra AI call. Any failure returns the original.
 */
export async function translateTexts(companyId: string, texts: string[], locale: string, cfgArg?: AiConfig | null): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const base = locale === "uz-Cyrl" ? "uz" : locale;
  const todo = [...new Set(texts)].filter((t) => t && !trivial(t) && t.length <= MAX_LEN);
  for (const t of texts) out.set(t, t);
  if (todo.length === 0) return out;
  const cfg = cfgArg === undefined ? await aiConfig(companyId) : cfgArg;
  if (!cfg) return out;

  const finish = (src: string, uz: string) => out.set(src, locale === "uz-Cyrl" ? translit(uz) : uz);
  const hashes = new Map(todo.map((t) => [t, hash(t)]));
  const cached = await db.textTranslation.findMany({ where: { companyId, locale: base, hash: { in: [...hashes.values()] } }, select: { hash: true, text: true } });
  const byHash = new Map(cached.map((c) => [c.hash, c.text]));
  const missing: string[] = [];
  for (const t of todo) {
    const hit = byHash.get(hashes.get(t)!);
    if (hit !== undefined) finish(t, hit);
    else missing.push(t);
  }
  if (missing.length && Date.now() - (failedAt.get(companyId) ?? 0) < BACKOFF_MS) return out;
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    try {
      const res = await translateBatch(cfg, chunk, base);
      await db.textTranslation.createMany({
        data: chunk.map((t, k) => ({ companyId, hash: hashes.get(t)!, locale: base, text: res[k], provider: cfg.provider })),
        skipDuplicates: true,
      });
      chunk.forEach((t, k) => finish(t, res[k]));
    } catch (e) {
      console.warn("[ai-translate]", (e as Error).message);
      failedAt.set(companyId, Date.now());
      break; // quota / network: show originals, try again on a later view
    }
  }
  return out;
}

/**
 * Request-scoped batcher for <UT>: every text rendered in one request is collected for a tick and translated
 * together (one DB query and few AI calls per page instead of one per text).
 */
export const requestTranslator = cache((companyId: string, locale: string) => {
  let pending: { text: string; resolve: (v: string) => void }[] = [];
  let scheduled = false;
  const cfgPromise = aiConfig(companyId).catch(() => null);
  const flush = async () => {
    const batch = pending;
    pending = [];
    scheduled = false;
    const map = await translateTexts(companyId, batch.map((b) => b.text), locale, await cfgPromise).catch(() => new Map<string, string>());
    for (const b of batch) b.resolve(map.get(b.text) ?? b.text);
  };
  return {
    cfg: cfgPromise,
    translate(text: string): Promise<string> {
      return new Promise((resolve) => {
        pending.push({ text, resolve });
        if (!scheduled) {
          scheduled = true;
          setTimeout(flush, 0);
        }
      });
    },
  };
});
