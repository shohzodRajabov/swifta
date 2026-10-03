import { getTranslations } from "next-intl/server";
import type { Product } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, LinkButton, Notice, Select, Textarea } from "@/components/ui";
import { db } from "@/lib/db";
import type { ActionState } from "@/lib/action";

export async function ProductForm({
  action,
  companyId,
  product,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  companyId: string;
  product?: Product;
}) {
  const t = await getTranslations();
  const categories = await db.productCategory.findMany({ where: { companyId }, orderBy: { sortOrder: "asc" } });
  const catName = (c: (typeof categories)[number]) => (c.key ? t(`productCategories.${c.key}`) : c.name);
  return (
    <ActionForm action={action} className="grid max-w-4xl gap-4 sm:grid-cols-2">
      <Field label={t("catalog.sku")} required>
        <Input name="sku" defaultValue={product?.sku} required />
      </Field>
      <Field label={t("catalog.category")} required>
        <Select name="categoryId" defaultValue={product?.categoryId ?? ""} required>
          <option value="" disabled>
            —
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {catName(c)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("catalog.name")} required className="sm:col-span-2">
        <Input name="name" defaultValue={product?.name} required />
      </Field>
      <Field label={t("catalog.manufacturer")}>
        <Input name="manufacturer" defaultValue={product?.manufacturer ?? ""} />
      </Field>
      <Field label={t("catalog.model")}>
        <Input name="model" defaultValue={product?.model ?? ""} />
      </Field>
      <Field label={t("catalog.unit")} required>
        <Input name="unit" defaultValue={product?.unit ?? "dona"} required />
      </Field>
      <Field label={t("catalog.supplier")}>
        <Input name="supplier" defaultValue={product?.supplier ?? ""} />
      </Field>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field label={t("catalog.purchasePrice")}>
          <Input name="purchasePrice" inputMode="decimal" defaultValue={product ? Number(product.purchasePrice) : 0} />
        </Field>
        <Field label={t("common.currency")}>
          <Select name="purchaseCurrency" defaultValue={product?.purchaseCurrency ?? "UZS"}>
            <option value="UZS">UZS</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field label={t("catalog.salePrice")}>
          <Input name="salePrice" inputMode="decimal" defaultValue={product ? Number(product.salePrice) : 0} />
        </Field>
        <Field label={t("common.currency")}>
          <Select name="saleCurrency" defaultValue={product?.saleCurrency ?? "UZS"}>
            <option value="UZS">UZS</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
      </div>
      <Field label={t("catalog.minStock")}>
        <Input name="minStock" inputMode="decimal" defaultValue={product ? Number(product.minStock) : 0} />
      </Field>
      {product && (
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={product.active} className="size-4" />
          {t("users.active")}
        </label>
      )}
      <Field label={t("catalog.description")} className="sm:col-span-2">
        <Textarea name="description" defaultValue={product?.description ?? ""} rows={3} />
      </Field>
      <div className="sm:col-span-2">
        <Notice>{t("catalog.filesSoon")}</Notice>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>{t("common.save")}</SubmitButton>
        <LinkButton href="/catalog" variant="secondary">
          {t("common.cancel")}
        </LinkButton>
      </div>
    </ActionForm>
  );
}
