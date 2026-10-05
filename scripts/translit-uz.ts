/**
 * Generates messages/uz-Cyrl.json from messages/uz.json (Uzbek Latin -> Cyrillic).
 * Run: pnpm i18n:cyrl   — then review the output; manual fixes go into scripts/uz-cyrl-overrides.json.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

import { translit } from "../src/lib/translit-uz";

function walk(value: unknown): unknown {
  if (typeof value === "string") return translit(value);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
  }
  return value;
}

function applyOverrides(target: Record<string, unknown>, overrides: Record<string, unknown>) {
  for (const [k, v] of Object.entries(overrides)) {
    if (v && typeof v === "object") applyOverrides(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    else target[k] = v;
  }
}

const src = JSON.parse(readFileSync("messages/uz.json", "utf8"));
const result = walk(src) as Record<string, unknown>;
if (existsSync("scripts/uz-cyrl-overrides.json")) {
  applyOverrides(result, JSON.parse(readFileSync("scripts/uz-cyrl-overrides.json", "utf8")));
}
writeFileSync("messages/uz-Cyrl.json", JSON.stringify(result, null, 2) + "\n");
console.log("messages/uz-Cyrl.json written");
