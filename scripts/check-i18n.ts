/** Verifies that every locale has exactly the same message keys as uz.json. */
import { readFileSync } from "node:fs";

const flat = (o: Record<string, unknown>, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));

const base = new Set(flat(JSON.parse(readFileSync("messages/uz.json", "utf8"))));
let ok = true;
for (const loc of ["uz-Cyrl", "ru", "en"]) {
  const keys = new Set(flat(JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"))));
  const missing = [...base].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !base.has(k));
  if (missing.length || extra.length) {
    ok = false;
    console.log(loc, { missing, extra });
  }
}
console.log(ok ? "i18n OK" : "i18n mismatch");
process.exit(ok ? 0 : 1);
