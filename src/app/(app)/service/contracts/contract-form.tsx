import { getTranslations } from "next-intl/server";
import type { ServiceContract } from "@prisma/client";
import { isoDate, today } from "@/lib/utils";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import type { ActionState } from "@/lib/action";

type Opt = { id: string; name: string };

export async function ContractForm({
  action,
  contract,
  clients,
  projects,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  contract?: ServiceContract | null;
  clients: Opt[];
  projects: Opt[];
}) {
  const t = await getTranslations();
  const d = today();
  return (
    <ActionForm action={action} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label={t("service.contractNumber")} required>
        <Input name="number" required defaultValue={contract?.number ?? ""} placeholder="SX-001/2026" />
      </Field>
      <Field label={t("clients.client")} required>
        <Select name="clientId" required defaultValue={contract?.clientId ?? ""}>
          <option value="" disabled>
            —
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("projects.project")}>
        <Select name="projectId" defaultValue={contract?.projectId ?? ""}>
          <option value="">—</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("service.startDate")} required>
        <Input type="date" name="startDate" required defaultValue={isoDate(contract?.startDate ?? d)} />
      </Field>
      <Field label={t("service.endDate")} required>
        <Input type="date" name="endDate" required defaultValue={isoDate(contract?.endDate ?? new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate() - 1)))} />
      </Field>
      <Field label={t("service.frequency")}>
        <Select name="frequency" defaultValue={contract?.frequency ?? "MONTHLY"}>
          {(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "ON_CALL"] as const).map((f) => (
            <option key={f} value={f}>
              {t(`frequency.${f}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("service.slaResponse")} hint={t("service.hours")}>
        <Input name="slaResponseHours" inputMode="numeric" defaultValue={contract?.slaResponseHours ?? ""} placeholder="4" />
      </Field>
      <Field label={t("service.slaResolve")} hint={t("service.hours")}>
        <Input name="slaResolveHours" inputMode="numeric" defaultValue={contract?.slaResolveHours ?? ""} placeholder="24" />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="slaBusinessHours" defaultChecked={contract?.slaBusinessHours ?? false} className="size-4" />
        {t("service.slaBusinessHours")}
      </label>
      {contract && (
        <Field label={t("common.status")}>
          <Select name="status" defaultValue={contract.status}>
            {(["ACTIVE", "EXPIRED", "CANCELLED"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`contractStatus.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="sm:col-span-2 lg:col-span-3">
        <MoneyInput label={t("service.contractPrice")} defaultAmount={contract ? String(Number(contract.amount)) : ""} defaultCurrency={contract?.currency} vat defaultVat={contract ? Number(contract.vatRate) : 12} />
      </div>
      <Field label={t("service.slaText")} className="sm:col-span-2 lg:col-span-3">
        <Textarea name="slaText" defaultValue={contract?.slaText ?? ""} placeholder={t("service.slaTextPlaceholder")} />
      </Field>
      <Field label={t("common.note")} className="sm:col-span-2 lg:col-span-3">
        <Input name="note" defaultValue={contract?.note ?? ""} />
      </Field>
      <div className="sm:col-span-2 lg:col-span-3">
        <SubmitButton>{t("common.save")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
