"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { formatNumber } from "@/lib/format";

export type EditorProduct = { id: string; label: string; name: string; unit: string };
export type EditorLine = {
  productId: string | null;
  bomItemId: string | null;
  name: string;
  unit: string;
  qty: string;
  unitPrice: string;
  fromBom?: boolean;
};

const empty = (): EditorLine => ({ productId: null, bomItemId: null, name: "", unit: "", qty: "", unitPrice: "" });
const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", ".")) || 0;

/** Editable purchase order lines; serialized into the hidden `lines` field. */
export function LinesEditor({ products, initial }: { products: EditorProduct[]; initial: EditorLine[] }) {
  const t = useTranslations("procurement");
  const [lines, setLines] = useState<EditorLine[]>(initial.length ? initial : [empty()]);
  const update = (i: number, patch: Partial<EditorLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0);

  const payload = lines
    .filter((l) => num(l.qty) > 0)
    .map((l) => ({
      productId: l.productId,
      bomItemId: l.bomItemId,
      name: l.name,
      unit: l.unit,
      qty: num(l.qty),
      unitPrice: num(l.unitPrice),
    }));

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_5rem_6rem_8rem_2rem] gap-2 px-1 text-xs font-medium text-muted md:grid">
        <span>{t("product")}</span>
        <span>{t("freeName")}</span>
        <span>{t("qty")}</span>
        <span>{t("unitPrice")}</span>
        <span className="text-right">{t("amount")}</span>
        <span />
      </div>
      {lines.map((l, i) => (
        <div
          key={i}
          className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_5rem_6rem_8rem_2rem] md:items-center md:border-0 md:p-0"
        >
          <Select
            className="col-span-2 md:col-span-1"
            value={l.productId ?? ""}
            aria-label={t("product")}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              update(i, { productId: p?.id ?? null, name: p ? p.name : l.name, unit: p ? p.unit : l.unit });
            }}
          >
            <option value="">—</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
          <div className="col-span-2 flex gap-1 md:col-span-1">
            <Input value={l.name} onChange={(e) => update(i, { name: e.target.value })} placeholder={t("freeName")} />
            <Input value={l.unit} onChange={(e) => update(i, { unit: e.target.value })} placeholder="m" className="w-16" aria-label="unit" />
          </div>
          <Input inputMode="decimal" value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} placeholder={t("qty")} />
          <Input inputMode="decimal" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} placeholder={t("unitPrice")} />
          <div className="num text-right text-sm">
            {formatNumber(num(l.qty) * num(l.unitPrice), 2)}
            {l.fromBom && <div className="text-[10px] text-muted">{t("fromBom")}</div>}
          </div>
          <button
            type="button"
            onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [empty()]))}
            className="justify-self-end rounded p-1 text-muted hover:bg-danger-soft hover:text-danger"
            aria-label="remove"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, empty()])}>
          <Plus className="size-4" aria-hidden />
          {t("addLine")}
        </Button>
        <div className="num text-sm font-semibold">
          {t("total")}: {formatNumber(total, 2)}
        </div>
      </div>
    </div>
  );
}
