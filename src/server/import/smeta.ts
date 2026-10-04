import ExcelJS from "exceljs";

export type SmetaKind = "TASK" | "EQUIPMENT" | "MATERIAL" | "SKIP";
export type SmetaRow = {
  row: number;
  section: string | null;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  total: number;
  kind: SmetaKind;
};

const HEADERS: Record<"name" | "unit" | "qty" | "price" | "total", RegExp> = {
  name: /(наимен|название|nomi|nomlan|ish turi|материал|name|description|работ)/i,
  unit: /(ед\.?|изм|birlik|o'lchov|олчов|unit|uom)/i,
  qty: /(кол-?во|колич|miqdor|soni|qty|quantity|объ[её]м|hajm)/i,
  price: /(цена|narx|baho|price|rate|стоим.*ед)/i,
  total: /(сумма|итого|summa|jami|total|amount|стоимость)/i,
};

const TASK_WORDS = /(монтаж|установ|прокладк|подключ|пусконалад|демонтаж|сборк|испытан|изоляц|сварк|montaj|o'rnat|ulash|ishlar|work|install|commission|labou?r|работ)/i;
const EQUIPMENT_WORDS = /(кондиционер|сплит|чиллер|фанкойл|vrf|vrv|ahu|приточн|вытяжн|вентилятор|установк[аи] (приточ|вытяж)|насос|котел|котёл|рекуператор|наружный блок|внутренний блок|блок|chiller|fan ?coil|air handling|unit|pump|boiler|konditsioner)/i;

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object" && v && "result" in v) return num((v as { result: unknown }).result);
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in (v as object)) return ((v as { richText: { text: string }[] }).richText ?? []).map((r) => r.text).join("").trim();
    if ("result" in (v as object)) return text((v as { result: unknown }).result);
    if ("text" in (v as object)) return String((v as { text: unknown }).text).trim();
  }
  return String(v).trim();
}

/** Guess the row type from its name and unit. Work items become tasks, the rest goes to the BOM. */
export function guessKind(name: string, unit: string): SmetaKind {
  if (TASK_WORDS.test(name) && !/^(материал|material)/i.test(name)) return "TASK";
  if (EQUIPMENT_WORDS.test(name) && /^(шт|dona|компл|к-т|set|pcs|ta)\.?$/i.test(unit || "шт")) return "EQUIPMENT";
  return "MATERIAL";
}

/**
 * Parse an estimate (smeta) workbook: find the header row by keywords, then read name/unit/qty/price/total.
 * Rows without quantity but with text are treated as section headings.
 */
export async function parseSmeta(buffer: Buffer | ArrayBuffer): Promise<{ rows: SmetaRow[]; sheet: string } | { error: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as ArrayBuffer);
  } catch {
    return { error: "importParse" };
  }
  for (const ws of wb.worksheets) {
    let header: { row: number; cols: Partial<Record<keyof typeof HEADERS, number>> } | null = null;
    for (let r = 1; r <= Math.min(ws.rowCount, 40) && !header; r++) {
      const cols: Partial<Record<keyof typeof HEADERS, number>> = {};
      ws.getRow(r).eachCell((cell, c) => {
        const v = text(cell.value);
        if (!v) return;
        for (const k of Object.keys(HEADERS) as (keyof typeof HEADERS)[]) {
          if (cols[k] === undefined && HEADERS[k].test(v)) {
            // "Стоимость единицы" is a price, "Стоимость" / "Сумма" is a total
            if (k === "total" && cols.price === c) continue;
            cols[k] = c;
            break;
          }
        }
      });
      if (cols.name !== undefined && cols.qty !== undefined) header = { row: r, cols };
    }
    if (!header) continue;
    const { cols } = header;
    const rows: SmetaRow[] = [];
    let section: string | null = null;
    for (let r = header.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = text(row.getCell(cols.name!).value);
      if (!name) continue;
      if (/^(итого|всего|jami|total|ндс|qqs)/i.test(name)) continue;
      const qty = num(row.getCell(cols.qty!).value);
      const unit = cols.unit ? text(row.getCell(cols.unit).value) : "";
      let unitPrice = cols.price ? num(row.getCell(cols.price).value) : 0;
      let total = cols.total ? num(row.getCell(cols.total).value) : 0;
      if (!qty) {
        if (name.length < 120 && !unit) section = name;
        continue;
      }
      if (!unitPrice && total) unitPrice = total / qty;
      if (!total) total = unitPrice * qty;
      rows.push({ row: r, section, name, unit: unit || "шт", qty, unitPrice: Math.round(unitPrice * 100) / 100, total: Math.round(total * 100) / 100, kind: guessKind(name, unit) });
    }
    if (rows.length) return { rows, sheet: ws.name };
  }
  return { error: "importNoRows" };
}
