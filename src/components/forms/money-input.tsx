import { getTranslations } from "next-intl/server";
import { Field, Input, Select } from "@/components/ui";

/**
 * Amount + currency + optional manual rate (+ optional VAT rate).
 * Field names: {prefix}amount, {prefix}currency, {prefix}rate, {prefix}vatRate.
 */
export async function MoneyInput({
  label,
  prefix = "",
  defaultAmount,
  defaultCurrency = "UZS",
  defaultRate,
  required = true,
  vat = false,
  defaultVat = 0,
}: {
  label: string;
  prefix?: string;
  defaultAmount?: number | string;
  defaultCurrency?: string;
  defaultRate?: number | string | null;
  required?: boolean;
  vat?: boolean;
  defaultVat?: number;
}) {
  const t = await getTranslations("common");
  const vatOptions = [...new Set([0, 12, defaultVat])].sort((a, b) => a - b);
  return (
    <div className={vat ? "grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_8rem_7rem]" : "grid grid-cols-[1fr_6rem] gap-2 sm:grid-cols-[1fr_6rem_9rem]"}>
      <Field label={label} required={required} className={vat ? "col-span-2 sm:col-span-1" : undefined}>
        <Input name={`${prefix}amount`} inputMode="decimal" defaultValue={defaultAmount} required={required} placeholder="0" />
      </Field>
      <Field label={t("currency")}>
        <Select name={`${prefix}currency`} defaultValue={defaultCurrency}>
          <option value="UZS">UZS</option>
          <option value="USD">USD</option>
        </Select>
      </Field>
      <Field label={t("rateOptional")} className={vat ? undefined : "col-span-2 sm:col-span-1"}>
        <Input name={`${prefix}rate`} inputMode="decimal" defaultValue={defaultRate ?? ""} placeholder="CBU" title={t("rateHint")} />
      </Field>
      {vat && (
        <Field label={t("vat")}>
          <Select name={`${prefix}vatRate`} defaultValue={String(defaultVat)}>
            {vatOptions.map((v) => (
              <option key={v} value={v}>
                {v === 0 ? t("noVat") : `${t("vat")} ${v}%`}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}
