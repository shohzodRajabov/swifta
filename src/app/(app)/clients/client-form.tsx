import { getTranslations } from "next-intl/server";
import type { Client } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/action";

const TYPES = ["COMPANY", "GOVERNMENT", "INDIVIDUAL", "CONTRACTOR"] as const;

export async function ClientForm({
  action,
  client,
  cancelHref,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  client?: Client;
  cancelHref: string;
}) {
  const t = await getTranslations();
  return (
    <ActionForm action={action} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label={t("clients.name")} required className="sm:col-span-2">
        <Input name="name" defaultValue={client?.name} required />
      </Field>
      <Field label={t("clients.type")}>
        <Select name="type" defaultValue={client?.type ?? "COMPANY"}>
          {TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(`clientType.${ty}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("clients.tin")}>
        <Input name="tin" defaultValue={client?.tin ?? ""} inputMode="numeric" />
      </Field>
      <Field label={t("clients.contactPerson")}>
        <Input name="contactPerson" defaultValue={client?.contactPerson ?? ""} />
      </Field>
      <Field label={t("clients.phone")}>
        <Input name="phone" type="tel" defaultValue={client?.phone ?? ""} placeholder="+998" />
      </Field>
      <Field label={t("clients.email")}>
        <Input name="email" type="email" defaultValue={client?.email ?? ""} />
      </Field>
      <Field label={t("clients.address")}>
        <Input name="address" defaultValue={client?.address ?? ""} />
      </Field>
      <Field label={t("clients.bankDetails")} className="sm:col-span-2">
        <Textarea name="bankDetails" defaultValue={client?.bankDetails ?? ""} rows={3} />
      </Field>
      <Field label={t("common.note")} className="sm:col-span-2">
        <Textarea name="note" defaultValue={client?.note ?? ""} rows={2} />
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
