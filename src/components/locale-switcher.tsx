"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { setLocale } from "@/app/login/actions";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-muted">
      <Languages className="size-4" aria-hidden />
      <select
        aria-label="Language"
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            await setLocale(next);
            router.refresh();
          });
        }}
        className="cursor-pointer rounded-md bg-transparent py-1 text-sm text-text focus:outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
