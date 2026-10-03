import { getTranslations } from "next-intl/server";
import type { Period } from "@/lib/period";
import { PERIOD_KEYS } from "@/lib/period";
import { isoDate } from "@/lib/utils";
import { Input, Select } from "@/components/ui";

/** Period selector fields (use inside a GET <form>). */
export async function PeriodFields({ period }: { period: Period }) {
  const t = await getTranslations("period");
  return (
    <>
      <Select name="period" defaultValue={period.key} className="w-40" aria-label={t("label")}>
        {PERIOD_KEYS.map((k) => (
          <option key={k} value={k}>
            {t(k)}
          </option>
        ))}
      </Select>
      <Input type="date" name="from" defaultValue={isoDate(period.from)} className="w-40" aria-label={t("from")} />
      <Input type="date" name="to" defaultValue={isoDate(period.to)} className="w-40" aria-label={t("to")} />
    </>
  );
}
