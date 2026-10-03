import { getTranslations } from "next-intl/server";
import { Field, Input, Select } from "@/components/ui";

/** Amount + currency + optional manual rate. Field names: {prefix}amount, {prefix}currency, {prefix}rate. */
export async function MoneyInput({
  label,
  prefix = "",
  defaultAmount,
  defaultCurrency = "UZS",
  defaultRate,
  required = true,
}: {
  label: string;
  prefix?: string;
  defaultAmount?: number | string;
  defaultCurrency?: string;
  defaultRate?: number | string | null;
  required?: boolean;
}) {
  const t = await getTranslations("common");
  return (
    <div className="grid grid-cols-[1fr_6rem] gap-2 sm:grid-cols-[1fr_6rem_9rem]">
      <Field label={label} required={required}>
        <Input
          name={`${prefix}amount`}
          inputMode="decimal"
          defaultValue={defaultAmount}
          required={required}
          placeholder="0"
        />
      </Field>
      <Field label={t("currency")}>
        <Select name={`${prefix}currency`} defaultValue={defaultCurrency}>
          <option value="UZS">UZS</option>
          <option value="USD">USD</option>
        </Select>
      </Field>
      <Field label={t("rateOptional")} className="col-span-2 sm:col-span-1">
        <Input name={`${prefix}rate`} inputMode="decimal" defaultValue={defaultRate ?? ""} placeholder="CBU" title={t("rateHint")} />
      </Field>
    </div>
  );
}
