import { getTranslations } from "next-intl/server";
import type { Supplier } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, LinkButton, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action";

export async function SupplierForm({
  action,
  supplier,
  cancelHref,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  supplier?: Supplier;
  cancelHref: string;
}) {
  const t = await getTranslations();
  return (
    <ActionForm action={action} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t("suppliers.name")} required className="sm:col-span-2">
        <Input name="name" defaultValue={supplier?.name} required />
      </Field>
      <Field label={t("suppliers.contactPerson")}>
        <Input name="contactPerson" defaultValue={supplier?.contactPerson ?? ""} />
      </Field>
      <Field label={t("suppliers.phone")}>
        <Input name="phone" type="tel" defaultValue={supplier?.phone ?? ""} placeholder="+998" />
      </Field>
      <Field label={t("suppliers.email")}>
        <Input name="email" type="email" defaultValue={supplier?.email ?? ""} />
      </Field>
      <Field label={t("suppliers.tin")}>
        <Input name="tin" defaultValue={supplier?.tin ?? ""} />
      </Field>
      <Field label={t("suppliers.address")} className="sm:col-span-2">
        <Input name="address" defaultValue={supplier?.address ?? ""} />
      </Field>
      <Field label={t("suppliers.paymentTerms")}>
        <Input name="paymentTerms" defaultValue={supplier?.paymentTerms ?? ""} placeholder="50% avans, 50% yetkazilganda" />
      </Field>
      <Field label={t("suppliers.leadTimeDays")}>
        <Input name="leadTimeDays" inputMode="numeric" defaultValue={supplier?.leadTimeDays ?? ""} />
      </Field>
      <Field label={t("suppliers.bankDetails")} className="sm:col-span-2">
        <Textarea name="bankDetails" defaultValue={supplier?.bankDetails ?? ""} rows={2} />
      </Field>
      <Field label={t("common.note")} className="sm:col-span-2">
        <Textarea name="note" defaultValue={supplier?.note ?? ""} rows={2} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>{t("common.save")}</SubmitButton>
        <LinkButton href={cancelHref} variant="secondary">
          {t("common.cancel")}
        </LinkButton>
      </div>
    </ActionForm>
  );
}
