import { getTranslations } from "next-intl/server";
import type { MovementType } from "@prisma/client";
import { isoDate } from "@/lib/utils";
import { Field, Input, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { recordMovement } from "@/app/(app)/warehouse/actions";

type Option = { id: string; label: string };

/** Form for one movement type. Pass `projectId` to lock the project (project materials tab). */
export async function MovementForm({
  type,
  items,
  warehouses,
  projects,
  projectId,
  responsible,
}: {
  type: Exclude<MovementType, never>;
  items: Option[];
  warehouses: Option[];
  projects?: Option[];
  projectId?: string;
  responsible?: string;
}) {
  const t = await getTranslations();
  const showProject = type === "ISSUE" || type === "RETURN" || type === "CONSUMPTION";
  const showWarehouse = type !== "CONSUMPTION";
  return (
    <ActionForm action={recordMovement.bind(null, type)} resetOnSuccess className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Field label={type === "CONSUMPTION" ? t("materials.pickRow") : t("warehouse.product")} required className="lg:col-span-2">
        <Select name="item" required defaultValue="">
          <option value="" disabled>
            —
          </option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("common.date")} required>
        <Input name="date" type="date" required defaultValue={isoDate(new Date())} />
      </Field>
      {showWarehouse && (
        <Field label={type === "TRANSFER" ? `${t("warehouse.warehouse")} (${t("common.from").toLowerCase()})` : t("warehouse.warehouse")} required>
          <Select name="warehouseId" required defaultValue={warehouses[0]?.id}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {type === "TRANSFER" && (
        <Field label={t("warehouse.toWarehouse")} required>
          <Select name="toWarehouseId" required defaultValue={warehouses[1]?.id ?? ""}>
            <option value="" disabled>
              —
            </option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {showProject &&
        (projectId ? (
          <input type="hidden" name="projectId" value={projectId} />
        ) : (
          <Field label={t("warehouse.project")} required>
            <Select name="projectId" required defaultValue="">
              <option value="" disabled>
                —
              </option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      {type === "ADJUSTMENT" ? (
        <Field label={t("warehouse.counted")} required hint={t("warehouse.adjustHint")}>
          <Input name="counted" inputMode="decimal" required />
        </Field>
      ) : (
        <Field label={t("warehouse.qty")} required>
          <Input name="qty" inputMode="decimal" required />
        </Field>
      )}
      {type === "RECEIPT" && (
        <div className="md:col-span-2">
          <MoneyInput label={t("warehouse.unitCost")} vat defaultVat={12} />
        </div>
      )}
      <Field label={t("warehouse.responsible")}>
        <Input name="responsible" defaultValue={responsible} />
      </Field>
      <Field label={t("warehouse.document")}>
        <Input name="document" />
      </Field>
      <Field label={t("common.note")}>
        <Input name="note" />
      </Field>
      <div className="md:col-span-2 lg:col-span-3">
        <SubmitButton>{t("warehouse.save")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
