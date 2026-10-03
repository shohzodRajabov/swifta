export const LOCALES = ["uz", "uz-Cyrl", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "uz";
export const LOCALE_COOKIE = "swifta_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  uz: "O'zbekcha",
  "uz-Cyrl": "Ўзбекча",
  ru: "Русский",
  en: "English",
};

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
