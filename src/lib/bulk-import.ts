// Bulk import from Excel: column definitions and row validation for catalog, clients, suppliers and employees.
// Pure (no I/O), unit tested. Reading the workbook and writing to the database live in src/server/import/bulk.ts.
import { normalizePhone } from "./phone";

export const IMPORT_TYPES = ["products", "clients", "suppliers", "employees"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

type Kind = "text" | "number" | "int" | "date" | "phone" | "email" | "currency" | "clientType" | "bool";
export type ColumnDef = { key: string; kind: Kind; required?: boolean; example: string | number };

export const IMPORT_COLUMNS: Record<ImportType, ColumnDef[]> = {
  products: [
    { key: "sku", kind: "text", required: true, example: "SPL-24" },
    { key: "name", kind: "text", required: true, example: "Split konditsioner 24000 BTU" },
    { key: "category", kind: "text", required: true, example: "Split" },
    { key: "unit", kind: "text", required: true, example: "dona" },
    { key: "manufacturer", kind: "text", example: "Gree" },
    { key: "model", kind: "text", example: "GWH24" },
    { key: "purchasePrice", kind: "number", example: 6900000 },
    { key: "purchaseCurrency", kind: "currency", example: "UZS" },
    { key: "salePrice", kind: "number", example: 8200000 },
    { key: "saleCurrency", kind: "currency", example: "UZS" },
    { key: "minStock", kind: "number", example: 0 },
    { key: "supplier", kind: "text", example: "Klimat Servis MCHJ" },
    { key: "description", kind: "text", example: "" },
  ],
  clients: [
    { key: "name", kind: "text", required: true, example: "Hamkorbank ATB" },
    { key: "type", kind: "clientType", example: "COMPANY" },
    { key: "contactPerson", kind: "text", example: "Murod Xo'jayev" },
    { key: "phone", kind: "phone", example: "+998 73 244 11 00" },
    { key: "email", kind: "email", example: "info@example.uz" },
    { key: "address", kind: "text", example: "Farg'ona sh." },
    { key: "tin", kind: "text", example: "200123456" },
    { key: "bankDetails", kind: "text", example: "" },
    { key: "note", kind: "text", example: "" },
  ],
  suppliers: [
    { key: "name", kind: "text", required: true, example: "Klimat Servis MCHJ" },
    { key: "contactPerson", kind: "text", example: "" },
    { key: "phone", kind: "phone", example: "+998 90 123 45 67" },
    { key: "email", kind: "email", example: "" },
    { key: "address", kind: "text", example: "Toshkent" },
    { key: "tin", kind: "text", example: "301234567" },
    { key: "bankDetails", kind: "text", example: "" },
    { key: "paymentTerms", kind: "text", example: "50% avans" },
    { key: "leadTimeDays", kind: "int", example: 14 },
    { key: "note", kind: "text", example: "" },
  ],
  employees: [
    { key: "fullName", kind: "text", required: true, example: "Akmal Tursunov" },
    { key: "phone", kind: "phone", example: "+998 90 111 22 33" },
    { key: "position", kind: "text", example: "Montajchi" },
    { key: "department", kind: "text", example: "Montaj" },
    { key: "salary", kind: "number", example: 7000000 },
    { key: "hireDate", kind: "date", example: "2025-03-01" },
    { key: "normDays", kind: "int", example: "" },
    { key: "note", kind: "text", example: "" },
  ],
};

export type CellValue = string | number | boolean | Date | null;
export type RowIssue = { column: string; code: "required" | "number" | "date" | "phone" | "email" | "currency" | "clientType" | "duplicateInFile" };
export type ParsedRow = { row: number; values: Record<string, string | number | boolean | Date | null>; issues: RowIssue[] };

/** Header cell → column key: "Artikul (sku) *" or just "sku" (case-insensitive). */
export function headerKey(header: string, type: ImportType): string | null {
  const keys = IMPORT_COLUMNS[type].map((c) => c.key);
  const inParens = header.match(/\(([A-Za-z]+)\)/)?.[1];
  const plain = header.replace(/[*\s]/g, "");
  const found = keys.find((k) => k.toLowerCase() === (inParens ?? plain).toLowerCase());
  return found ?? null;
}

const CLIENT_TYPES: Record<string, string> = {
  company: "COMPANY", kompaniya: "COMPANY", tashkilot: "COMPANY", компания: "COMPANY", организация: "COMPANY", yuridik: "COMPANY",
  government: "GOVERNMENT", davlat: "GOVERNMENT", государственный: "GOVERNMENT", государство: "GOVERNMENT", budjet: "GOVERNMENT",
  individual: "INDIVIDUAL", jismoniy: "INDIVIDUAL", "jismoniy shaxs": "INDIVIDUAL", физлицо: "INDIVIDUAL", "физическое лицо": "INDIVIDUAL",
  contractor: "CONTRACTOR", pudratchi: "CONTRACTOR", подрядчик: "CONTRACTOR",
};

function toNumber(v: CellValue): number | null {
  if (v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v).replace(/[\s ']/g, "").replace(",", ".");
  return s === "" ? null : Number(s);
}

function toDate(v: CellValue): Date | null | "bad" {
  if (v === null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "bad" : new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); // Excel serial
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return "bad";
}

/** Validates and converts one sheet row (already mapped to column keys). */
export function parseRow(type: ImportType, row: number, raw: Record<string, CellValue>): ParsedRow {
  const values: ParsedRow["values"] = {};
  const issues: RowIssue[] = [];
  for (const c of IMPORT_COLUMNS[type]) {
    const v = raw[c.key] ?? null;
    const str = v === null ? "" : v instanceof Date ? "" : String(v).trim();
    const empty = v === null || (str === "" && !(v instanceof Date));
    if (empty) {
      if (c.required) issues.push({ column: c.key, code: "required" });
      values[c.key] = null;
      continue;
    }
    switch (c.kind) {
      case "text":
        values[c.key] = str.slice(0, 500);
        break;
      case "number":
      case "int": {
        const n = toNumber(v);
        if (n === null) values[c.key] = null;
        else if (!Number.isFinite(n) || n < 0) issues.push({ column: c.key, code: "number" });
        else values[c.key] = c.kind === "int" ? Math.round(n) : n;
        break;
      }
      case "date": {
        const d = toDate(v);
        if (d === "bad") issues.push({ column: c.key, code: "date" });
        else values[c.key] = d;
        break;
      }
      case "phone": {
        const p = normalizePhone(str);
        if (!p) issues.push({ column: c.key, code: "phone" });
        else values[c.key] = p;
        break;
      }
      case "email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) issues.push({ column: c.key, code: "email" });
        else values[c.key] = str.toLowerCase();
        break;
      case "currency": {
        const cur = str.toUpperCase().replace("$", "USD").replace(/^(SO'M|СУМ|SUM|SOM)$/, "UZS");
        if (cur !== "UZS" && cur !== "USD") issues.push({ column: c.key, code: "currency" });
        else values[c.key] = cur;
        break;
      }
      case "clientType": {
        const ct = CLIENT_TYPES[str.toLowerCase()] ?? (["COMPANY", "GOVERNMENT", "INDIVIDUAL", "CONTRACTOR"].includes(str.toUpperCase()) ? str.toUpperCase() : null);
        if (!ct) issues.push({ column: c.key, code: "clientType" });
        else values[c.key] = ct;
        break;
      }
      case "bool":
        values[c.key] = /^(1|ha|yes|да|true|x|✓)$/i.test(str);
        break;
    }
  }
  return { row, values, issues };
}

/** The value that identifies a record of this type (to find the existing one and to catch duplicates in the file). */
export function matchKeys(type: ImportType, v: ParsedRow["values"]): string[] {
  const s = (x: unknown) => (x === null || x === undefined || x === "" ? null : String(x).toLowerCase().trim());
  const out: (string | null)[] =
    type === "products"
      ? [s(v.sku) && `sku:${s(v.sku)}`]
      : type === "employees"
        ? [s(v.phone) && `phone:${s(v.phone)}`, s(v.fullName) && `name:${s(v.fullName)}`]
        : [s(v.tin) && `tin:${s(v.tin)}`, s(v.name) && `name:${s(v.name)}`];
  return out.filter((x): x is string => !!x);
}

/** Flags rows that repeat an earlier row's identity in the same file. */
export function markFileDuplicates(type: ImportType, rows: ParsedRow[]): ParsedRow[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const keys = matchKeys(type, r.values);
    const primary = keys[0];
    if (primary && seen.has(primary)) r.issues.push({ column: IMPORT_COLUMNS[type][0].key, code: "duplicateInFile" });
    if (primary) seen.add(primary);
  }
  return rows;
}
