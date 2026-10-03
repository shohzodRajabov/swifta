import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { projectMaterials } from "@/lib/materials";
import { isoDate } from "@/lib/utils";
import { Card, Field, Input, LinkButton, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { LinesEditor, type EditorLine } from "../lines-editor";
import { createOrder } from "../actions";

export default async function NewOrderPage({ searchParams }: PageProps<"/procurement/new">) {
  const user = await requirePermission("procurement.edit");
  const sp = (await searchParams) as { project?: string; supplier?: string };
  const t = await getTranslations();

  const [suppliers, projects, warehouses, products] = await Promise.all([
    db.supplier.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" } }),
    db.project.findMany({
      where: { companyId: user.companyId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, name: true },
    }),
    db.warehouse.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" } }),
  ]);

  // Prefill with what the project's BOM still needs (planned - ordered).
  let initial: EditorLine[] = [];
  let currency = "UZS";
  if (sp.project && projects.some((p) => p.id === sp.project)) {
    const [rows, bom] = await Promise.all([
      projectMaterials(sp.project),
      db.bomItem.findMany({ where: { projectId: sp.project } }),
    ]);
    initial = rows
      .filter((r) => r.planned - r.ordered > 0)
      .map((r) => {
        const b = bom.find((x) => r.bomItemIds.includes(x.id));
        if (b) currency = b.currency;
        return {
          productId: r.productId,
          bomItemId: r.productId ? null : b?.id ?? null,
          name: r.name,
          unit: r.unit,
          qty: String(+(r.planned - r.ordered).toFixed(3)),
          unitPrice: b ? String(Number(b.unitPrice)) : "",
          fromBom: true,
        };
      });
  }

  if (suppliers.length === 0) {
    return (
      <>
        <PageHeader title={t("procurement.new")} back={{ href: "/procurement", label: t("procurement.title") }} />
        <div className="flex flex-col items-start gap-3">
          <Notice tone="warning">{t("suppliers.empty")}</Notice>
          <LinkButton href="/suppliers/new">{t("suppliers.new")}</LinkButton>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("procurement.new")} back={{ href: "/procurement", label: t("procurement.title") }} />
      <ActionForm action={createOrder} className="flex max-w-5xl flex-col gap-6">
        <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("procurement.supplier")} required>
            <Select name="supplierId" required defaultValue={sp.supplier ?? ""}>
              <option value="" disabled>
                —
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("procurement.project")}>
            <Select name="projectId" defaultValue={sp.project ?? ""}>
              <option value="">{t("procurement.stockOrder")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("procurement.warehouse")} required>
            <Select name="warehouseId" required defaultValue={warehouses[0]?.id}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("procurement.orderDate")} required>
            <Input name="orderDate" type="date" required defaultValue={isoDate(new Date())} />
          </Field>
          <Field label={t("procurement.expectedDate")}>
            <Input name="expectedDate" type="date" />
          </Field>
          <Field label={t("procurement.paymentDueDate")}>
            <Input name="paymentDueDate" type="date" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("common.currency")}>
              <Select name="currency" defaultValue={currency}>
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </Select>
            </Field>
            <Field label={t("common.rateOptional")}>
              <Input name="rate" inputMode="decimal" placeholder="CBU" title={t("common.rateHint")} />
            </Field>
          </div>
          <Field label={t("procurement.invoiceNumber")}>
            <Input name="invoiceNumber" />
          </Field>
          <Field label={t("common.note")}>
            <Textarea name="note" rows={1} />
          </Field>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">{t("procurement.lines")}</h2>
          <LinesEditor
            initial={initial}
            products={products.map((p) => ({
              id: p.id,
              label: `${p.sku} · ${p.name}${p.model ? ` (${p.model})` : ""}`,
              name: p.name,
              unit: p.unit,
            }))}
          />
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton>{t("common.create")}</SubmitButton>
          <span className="text-xs text-muted">{t("procurement.draftHint")}</span>
        </div>
      </ActionForm>
    </>
  );
}
