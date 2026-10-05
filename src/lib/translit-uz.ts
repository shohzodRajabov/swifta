// Uzbek Latin → Cyrillic transliteration (UI messages and user texts). Pure.

const KEEP = new Set(["USD", "SKU", "BOM", "AHU", "VRF", "FCU", "CBU", "Email", "Rooftop", "Swifta", "UZS"]);
const VOWELS = "aeiouAEIOU";
const APOS = "'ʻʼ‘’`";

const SINGLE: Record<string, string> = {
  a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к", l: "л",
  m: "м", n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", x: "х",
  y: "й", z: "з", c: "ц", w: "в",
};

function up(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function translitWord(word: string): string {
  if (KEEP.has(word) || /^[A-Z0-9]{2,}$/.test(word)) return word;
  let out = "";
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    const lower = word.slice(i, i + 3).toLowerCase();
    const isUpper = ch !== ch.toLowerCase();
    const apos2 = APOS.includes(word[i + 1] ?? "");
    const emit = (cyr: string, len: number) => {
      out += isUpper ? up(cyr) : cyr;
      i += len;
    };
    if (lower[0] === "y" && lower[1] === "o" && APOS.includes(word[i + 2] ?? "")) { emit("йў", 3); continue; }
    if (lower[0] === "o" && apos2) { emit("ў", 2); continue; }
    if (lower[0] === "g" && apos2) { emit("ғ", 2); continue; }
    const two = lower.slice(0, 2);
    if (two === "sh") { emit("ш", 2); continue; }
    if (two === "ch") { emit("ч", 2); continue; }
    if (two === "yo") { emit("ё", 2); continue; }
    if (two === "yu") { emit("ю", 2); continue; }
    if (two === "ya") { emit("я", 2); continue; }
    if (two === "ye") {
      // Loanwords like "obyekt" -> "объект": a hard sign separates a consonant from the iotated vowel.
      const prev = word[i - 1];
      emit(prev && !VOWELS.includes(prev) && !APOS.includes(prev) ? "ъе" : "е", 2);
      continue;
    }
    if (two === "ts") { emit("ц", 2); continue; }
    if (APOS.includes(ch)) { out += "ъ"; i += 1; continue; }
    const l = ch.toLowerCase();
    if (l === "e") {
      const prev = word[i - 1];
      emit(i === 0 || (prev && VOWELS.includes(prev)) ? "э" : "е", 1);
      continue;
    }
    if (SINGLE[l]) { emit(SINGLE[l], 1); continue; }
    out += ch;
    i += 1;
  }
  return out;
}

export function translit(text: string): string {
  // Keep ICU placeholders like {n} or {rate} untouched.
  return text
    .split(/(\{[^}]*\})/g)
    .map((part) =>
      part.startsWith("{") ? part : part.replace(/[A-Za-z][A-Za-z'ʻʼ‘’`]*/g, (w) => translitWord(w)),
    )
    .join("");
}

