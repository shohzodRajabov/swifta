import "server-only";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { headerKey, IMPORT_COLUMNS, markFileDuplicates, matchKeys, parseRow, type CellValue, type ImportType, type ParsedRow } from "@/lib/bulk-import";

import uz from "../../../messages/uz.json";
import uzCyrl from "../../../messages/uz-Cyrl.json";
import ru from "../../../messages/ru.json";
import en from "../../../messages/en.json";

export const MAX_IMPORT_ROWS = 5000;

/** System category key → its names in every UI language (so "Panjara", "Решётка", "Grille" all mean GRILLE). */
function categoryAliases(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of [uz, uzCyrl, ru, en] as { productCategories?: Record<string, string> }[])
    for (const [key, name] of Object.entries(m.productCategories ?? {})) out.set(name.toLowerCase().trim(), key);
  return out;
}

function cell(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cell(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
  }
  return String(v);
}

/** Reads the first sheet: header row (first non-empty row) → column keys, then data rows. */
export async function readSheet(type: ImportType, buffer: ArrayBuffer): Promise<{ rows: ParsedRow[]; unknownHeaders: string[]; tooMany: boolean }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], unknownHeaders: [], tooMany: false };
  let headerRow = 0;
  const map = new Map<number, string>();
  const unknownHeaders: string[] = [];
  ws.eachRow({ includeEmpty: false }, (r, n) => {
    if (headerRow) return;
    headerRow = n;
    r.eachCell((c, col) => {
      const h = String(cell(c.value) ?? "").trim();
      if (!h) return;
      const key = headerKey(h, type);
      if (key) map.set(col, key);
      else unknownHeaders.push(h);
    });
  });
  const rows: ParsedRow[] = [];
  let tooMany = false;
  ws.eachRow({ includeEmpty: false }, (r, n) => {
    if (n <= headerRow) return;
    const raw: Record<string, CellValue> = {};
    let any = false;
    for (const [col, key] of map) {
      const v = cell(r.getCell(col).value);
      raw[key] = typeof v === "string" ? v.trim() || null : v;
      if (raw[key] !== null) any = true;
    }
    if (!any) return;
    if (rows.length >= MAX_IMPORT_ROWS) {
      tooMany = true;
      return;
    }
    rows.push(parseRow(type, n, raw));
  });
  return { rows: markFileDuplicates(type, rows), unknownHeaders, tooMany };
}

/** Existing records by identity key (sku / tin / phone / name), to update instead of duplicating. */
async function existingIndex(type: ImportType, companyId: string): Promise<Map<string, string>> {
  const idx = new Map<string, string>();
  const put = (key: string | null | undefined, id: string) => {
    if (key && !idx.has(key)) idx.set(key, id);
  };
  const lc = (s: string | null | undefined) => (s ? s.toLowerCase().trim() : null);
  if (type === "products") {
    for (const p of await db.product.findMany({ where: { companyId }, select: { id: true, sku: true } })) put(`sku:${lc(p.sku)}`, p.id);
  } else if (type === "employees") {
    for (const e of await db.employee.findMany({ where: { companyId }, select: { id: true, phone: true, fullName: true } })) {
      if (e.phone) put(`phone:${e.phone}`, e.id);
      put(`name:${lc(e.fullName)}`, e.id);
    }
  } else {
    const list =
      type === "clients"
        ? await db.client.findMany({ where: { companyId }, select: { id: true, tin: true, name: true } })
        : await db.supplier.findMany({ where: { companyId }, select: { id: true, tin: true, name: true } });
    for (const x of list) {
      if (x.tin) put(`tin:${lc(x.tin)}`, x.id);
      put(`name:${lc(x.name)}`, x.id);
    }
  }
  return idx;
}

export type PreviewRow = ParsedRow & { action: "create" | "update" | "error"; existingId: string | null };

export async function previewImport(type: ImportType, companyId: string, rows: ParsedRow[]): Promise<PreviewRow[]> {
  const idx = await existingIndex(type, companyId);
  return rows.map((r) => {
    const existingId = matchKeys(type, r.values).map((k) => idx.get(k)).find(Boolean) ?? null;
    return { ...r, existingId, action: r.issues.length ? "error" : existingId ? "update" : "create" };
  });
}

const dec = (v: unknown) => new Prisma.Decimal(Number(v ?? 0));
/** Only columns present in the file overwrite existing values (empty cells keep what is there). */
function present<T extends Record<string, unknown>>(data: T, values: ParsedRow["values"]): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => values[k] !== null && values[k] !== undefined)) as Partial<T>;
}

/** Writes valid rows (errors are skipped). Returns counts. */
export async function applyImport(
  type: ImportType,
  user: { id: string; companyId: string },
  rows: PreviewRow[],
  opts: { salaries: boolean },
): Promise<{ created: number; updated: number; skipped: number }> {
  const ok = rows.filter((r) => r.action !== "error");
  let created = 0;
  let updated = 0;
  const companyId = user.companyId;
  const categories = type === "products" ? await db.productCategory.findMany({ where: { companyId } }) : [];
  const aliases = categoryAliases();
  const categoryId = async (name: string) => {
    const n = name.toLowerCase().trim();
    const key = aliases.get(n);
    const found = categories.find((c) => c.name.toLowerCase() === n || c.key?.toLowerCase() === n || (key && c.key === key));
    if (found) return found.id;
    const c = await db.productCategory.create({ data: { companyId, name: name.trim(), kind: "MATERIAL", sortOrder: 900 } });
    categories.push(c);
    return c.id;
  };

  for (let i = 0; i < ok.length; i += 200) {
    const chunk = ok.slice(i, i + 200);
    // Categories are resolved outside the transaction (they may be created).
    const catIds = type === "products" ? await Promise.all(chunk.map((r) => categoryId(String(r.values.category)))) : [];
    await db.$transaction(async (tx) => {
      for (const [k, r] of chunk.entries()) {
        const v = r.values;
        if (type === "products") {
          const data = {
            sku: String(v.sku),
            name: String(v.name),
            categoryId: catIds[k],
            unit: String(v.unit),
            manufacturer: v.manufacturer as string | null,
            model: v.model as string | null,
            purchasePrice: dec(v.purchasePrice),
            purchaseCurrency: (v.purchaseCurrency as "UZS" | "USD" | null) ?? "UZS",
            salePrice: dec(v.salePrice),
            saleCurrency: (v.saleCurrency as "UZS" | "USD" | null) ?? "UZS",
            minStock: dec(v.minStock),
            supplier: v.supplier as string | null,
            description: v.description as string | null,
          };
          if (r.existingId) await tx.product.update({ where: { id: r.existingId }, data: { ...present(data, { ...v, categoryId: v.category }), sku: data.sku } });
          else await tx.product.create({ data: { companyId, ...data } });
        } else if (type === "clients") {
          const data = {
            name: String(v.name),
            type: (v.type as "COMPANY" | "GOVERNMENT" | "INDIVIDUAL" | "CONTRACTOR" | null) ?? "COMPANY",
            contactPerson: v.contactPerson as string | null,
            phone: v.phone as string | null,
            email: v.email as string | null,
            address: v.address as string | null,
            tin: v.tin as string | null,
            bankDetails: v.bankDetails as string | null,
            note: v.note as string | null,
          };
          if (r.existingId) await tx.client.update({ where: { id: r.existingId }, data: present(data, v) });
          else await tx.client.create({ data: { companyId, ...data } });
        } else if (type === "suppliers") {
          const data = {
            name: String(v.name),
            contactPerson: v.contactPerson as string | null,
            phone: v.phone as string | null,
            email: v.email as string | null,
            address: v.address as string | null,
            tin: v.tin as string | null,
            bankDetails: v.bankDetails as string | null,
            paymentTerms: v.paymentTerms as string | null,
            leadTimeDays: v.leadTimeDays as number | null,
            note: v.note as string | null,
          };
          if (r.existingId) await tx.supplier.update({ where: { id: r.existingId }, data: present(data, v) });
          else await tx.supplier.create({ data: { companyId, ...data } });
        } else {
          const data = {
            fullName: String(v.fullName),
            phone: v.phone as string | null,
            position: v.position as string | null,
            department: v.department as string | null,
            hireDate: v.hireDate as Date | null,
            normDays: v.normDays as number | null,
            note: v.note as string | null,
            // Salaries only by people allowed to see them.
            ...(opts.salaries ? { salary: dec(v.salary) } : {}),
          };
          if (r.existingId) await tx.employee.update({ where: { id: r.existingId }, data: present(data, v) });
          else await tx.employee.create({ data: { companyId, ...data } });
        }
        if (r.existingId) updated++;
        else created++;
      }
    });
  }
  await db.$transaction((tx) =>
    audit(tx, { companyId, userId: user.id }, "Import", type, "create", null, { type, created, updated, skipped: rows.length - ok.length }),
  );
  return { created, updated, skipped: rows.length - ok.length };
}

/** Template workbook: headers "Label (key) *" and one example row. */
export async function templateWorkbook(type: ImportType, label: (key: string) => string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(type);
  const cols = IMPORT_COLUMNS[type];
  ws.addRow(cols.map((c) => `${label(c.key)} (${c.key})${c.required ? " *" : ""}`));
  ws.addRow(cols.map((c) => c.example));
  ws.getRow(1).font = { bold: true };
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(14, label(c.key).length + c.key.length + 6);
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
