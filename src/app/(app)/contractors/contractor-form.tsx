import { getTranslations } from "next-intl/server";
import type { Contractor } from "@prisma/client";
import { formatPhone } from "@/lib/phone";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import type { ActionState } from "@/lib/action";

export async function ContractorForm({
  action,
  contractor,
  workTypes,
  phoneRequired,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  contractor?: Contractor | null;
  workTypes: string[];
  phoneRequired: boolean;
}) {
  const t = await getTranslations();
  const extra = (contractor?.specializations ?? []).filter((s) => !workTypes.includes(s));
  return (
    <ActionForm action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label={t("contractors.name")} required className="sm:col-span-2">
        <Input name="name" required defaultValue={contractor?.name} />
      </Field>
      <Field label={t("contractors.kind")}>
        <Select name="kind" defaultValue={contractor?.kind ?? "INDIVIDUAL"}>
          {(["INDIVIDUAL", "BRIGADE", "COMPANY"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`contractorKind.${k}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("contractors.phone")} required={phoneRequired}>
        <Input name="phone" inputMode="tel" required={phoneRequired} placeholder="+998 90 123 45 67" defaultValue={contractor?.phone ? formatPhone(contractor.phone) : ""} />
      </Field>
      <Field label={t("contractors.phone2")}>
        <Input name="phone2" inputMode="tel" defaultValue={contractor?.phone2 ? formatPhone(contractor.phone2) : ""} />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" defaultValue={contractor?.email ?? ""} />
      </Field>
      <Field label={t("contractors.address")}>
        <Input name="address" defaultValue={contractor?.address ?? ""} />
      </Field>
      <Field label={t("contractors.regions")} hint={t("contractors.commaHint")}>
        <Input name="regions" defaultValue={contractor?.regions.join(", ") ?? ""} placeholder="Toshkent, Samarqand" />
      </Field>
      <Field label={t("contractors.availabilityLabel")}>
        <Select name="availability" defaultValue={contractor?.availability ?? "AVAILABLE"}>
          {(["AVAILABLE", "BUSY", "UNAVAILABLE", "BLACKLISTED"] as const).map((a) => (
            <option key={a} value={a}>
              {t(`availability.${a}`)}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="sm:col-span-2 lg:col-span-3">
        <legend className="mb-1.5 text-sm font-medium">{t("contractors.specializations")}</legend>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {workTypes.map((w) => (
            <label key={w} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="specializations" value={w} defaultChecked={contractor?.specializations.includes(w)} /> {w}
            </label>
          ))}
        </div>
        <Input name="specializationsExtra" defaultValue={extra.join(", ")} placeholder={t("contractors.otherSpecs")} className="mt-2 max-w-xl" />
      </fieldset>
      <Field label={t("contractors.tin")}>
        <Input name="tin" defaultValue={contractor?.tin ?? ""} />
      </Field>
      <Field label={t("contractors.bankDetails")} className="sm:col-span-2">
        <Input name="bankDetails" defaultValue={contractor?.bankDetails ?? ""} placeholder={t("contractors.bankHint")} />
      </Field>
      <Field label={t("common.note")} className="sm:col-span-2 lg:col-span-3">
        <Textarea name="note" defaultValue={contractor?.note ?? ""} />
      </Field>
      {contractor && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={contractor.active} /> {t("employees.active")}
        </label>
      )}
      <div className="sm:col-span-2 lg:col-span-3">
        <SubmitButton>{t("common.save")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
