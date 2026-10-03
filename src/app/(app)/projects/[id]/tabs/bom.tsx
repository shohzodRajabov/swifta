import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatQty } from "@/lib/format";
import { recordMoney } from "@/lib/money-value";
import { sumAmounts } from "@/lib/metrics";
import { projectMaterials } from "@/lib/materials";
import { Badge, Card, CardHeader, Empty, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Money } from "@/components/money";
import { addBomItem, deleteBomItem } from "@/app/(app)/projects/actions";
import { projectVatRate } from "@/server/projects/defaults";

export async function BomTab({ user, projectId }: { user: CurrentUser; projectId: string }) {
  const t = await getTranslations();
  const canEdit = can(user, "bom.edit");
  const showPrice = canEdit || can(user, "finance.view");
  const [items, products] = await Promise.all([
    db.bomItem.findMany({ where: { projectId }, orderBy: [{ kind: "asc" }, { createdAt: "asc" }] }),
    canEdit
      ? db.product.findMany({
          where: { companyId: user.companyId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, sku: true, name: true, model: true, unit: true },
        })
      : Promise.resolve([]),
  ]);

  const materials = await projectMaterials(projectId);
  const defaultVat = await projectVatRate(projectId);
  // Flow numbers are aggregated per catalog product; show them on the first BOM line of each product.
  const flowFor = (bomId: string) => {
    const row = materials.find((r) => r.bomItemIds.includes(bomId));
    return row && row.bomItemIds[0] === bomId ? row : null;
  };

  const total = (kind: "EQUIPMENT" | "MATERIAL") =>
    sumAmounts(
      items
        .filter((i) => i.kind === kind)
        .map((i) => ({ uzs: Number(i.plannedCostUzs), usd: Number(i.plannedCostUsd), count: 1 })),
    );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={t("bom.title")} />
        {items.length === 0 ? (
          <Empty>{t("bom.empty")}</Empty>
        ) : (
          <Table className="mt-2">
            <thead>
              <tr>
                <Th>{t("common.name")}</Th>
                <Th>{t("bom.kind")}</Th>
                <Th className="text-right">{t("common.plan")}</Th>
                <Th className="text-right">{t("bom.ordered")}</Th>
                <Th className="text-right">{t("bom.received")}</Th>
                <Th className="text-right">{t("bom.issued")}</Th>
                <Th className="text-right">{t("bom.used")}</Th>
                {showPrice && <Th className="text-right">{t("bom.unitPrice")}</Th>}
                {showPrice && <Th className="text-right">{t("bom.plannedCost")}</Th>}
                {canEdit && <Th />}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const f = flowFor(i.id);
                const cell = (v: number | undefined) => (f ? formatQty(v ?? 0) : "↑");
                return (
                <tr key={i.id}>
                  <Td className="font-medium">{i.name}</Td>
                  <Td>
                    <Badge tone={i.kind === "EQUIPMENT" ? "primary" : "neutral"}>{t(`bomKind.${i.kind}`)}</Badge>
                  </Td>
                  <Td className="num text-right">
                    {formatQty(Number(i.plannedQty))} <span className="text-muted">{i.unit}</span>
                  </Td>
                  <Td className="num text-right">{cell(f?.ordered)}</Td>
                  <Td className="num text-right">{cell(f?.received)}</Td>
                  <Td className="num text-right">{cell(f?.issued)}</Td>
                  <Td className={f?.overuse ? "num text-right font-semibold text-danger" : "num text-right"}>{cell(f?.used)}</Td>
                  {showPrice && (
                    <Td className="text-right">
                      <Money
                        size="sm"
                        value={recordMoney({
                          amount: i.unitPrice,
                          currency: i.currency,
                          fxRate: i.fxRate,
                          fxDate: i.fxDate,
                          fxSource: i.fxSource,
                          amountUzs: i.unitPriceUzs,
                          amountUsd: i.unitPriceUzs.div(i.fxRate),
                        })}
                      />
                    </Td>
                  )}
                  {showPrice && (
                    <Td className="text-right">
                      <Money size="sm" value={{ uzs: Number(i.plannedCostUzs), usd: Number(i.plannedCostUsd), count: 1, rate: Number(i.fxRate), fxDate: i.fxDate.toISOString(), source: i.fxSource }} />
                    </Td>
                  )}
                  {canEdit && (
                    <Td className="text-right">
                      <DeleteButton action={deleteBomItem} id={i.id} />
                    </Td>
                  )}
                </tr>
                );
              })}
            </tbody>
            {showPrice && (
              <tfoot>
                {(["EQUIPMENT", "MATERIAL"] as const).map((k) => (
                  <tr key={k}>
                    <Td colSpan={8} className="text-right text-muted">
                      {t(k === "EQUIPMENT" ? "bom.totalEquipment" : "bom.totalMaterial")}
                    </Td>
                    <Td className="text-right">
                      <Money size="sm" value={total(k)} />
                    </Td>
                    {canEdit && <Td />}
                  </tr>
                ))}
              </tfoot>
            )}
          </Table>
        )}
      </Card>

      {canEdit && (
        <Card>
          <CardHeader title={t("bom.addLine")} />
          <ActionForm action={addBomItem.bind(null, projectId)} resetOnSuccess className="grid gap-4 p-5 md:grid-cols-2">
            <Field label={t("bom.product")}>
              <Select name="productId" defaultValue="">
                <option value="">—</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                    {p.model ? ` (${p.model})` : ""} · {p.unit}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("bom.freeText")}>
              <Input name="name" placeholder="Havo kanali 500×300" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label={t("bom.kind")}>
                <Select name="kind" defaultValue="MATERIAL">
                  <option value="MATERIAL">{t("bomKind.MATERIAL")}</option>
                  <option value="EQUIPMENT">{t("bomKind.EQUIPMENT")}</option>
                </Select>
              </Field>
              <Field label={t("bom.plannedQty")} required>
                <Input name="plannedQty" inputMode="decimal" required />
              </Field>
              <Field label={t("common.unit")}>
                <Input name="unit" placeholder="m, dona, kg" />
              </Field>
            </div>
            <MoneyInput label={t("bom.unitPrice")} vat defaultVat={defaultVat} />
            <div className="md:col-span-2">
              <SubmitButton>{t("common.add")}</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
