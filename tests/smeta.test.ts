import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { guessKind, parseSmeta } from "@/server/import/smeta";

async function book(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Smeta");
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("smeta import", () => {
  it("finds the header and classifies rows", async () => {
    const buf = await book([
      ["Смета на ОВиК"],
      [],
      ["№", "Наименование", "Ед. изм.", "Кол-во", "Цена", "Сумма"],
      ["", "1-этаж", "", "", "", ""],
      [1, "Монтаж воздуховодов", "м2", 120, 45000, 5400000],
      [2, "Воздуховод оцинкованный 500x300", "м2", 120, 150000, ""],
      [3, "Наружный блок VRF 28 кВт", "шт", 2, 85000000, 170000000],
      ["", "Итого", "", "", "", 175400000],
    ]);
    const res = await parseSmeta(buf);
    expect("rows" in res).toBe(true);
    if (!("rows" in res)) return;
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]).toMatchObject({ section: "1-этаж", kind: "TASK", qty: 120, unitPrice: 45000 });
    expect(res.rows[1]).toMatchObject({ kind: "MATERIAL", total: 18000000 });
    expect(res.rows[2]).toMatchObject({ kind: "EQUIPMENT", qty: 2 });
  });

  it("guesses kinds", () => {
    expect(guessKind("Montaj ishlari: kanal", "m2")).toBe("TASK");
    expect(guessKind("Chiller 500 kW", "dona")).toBe("EQUIPMENT");
    expect(guessKind("Mis quvur 12.7", "m")).toBe("MATERIAL");
  });

  it("reports a file without a header", async () => {
    const res = await parseSmeta(await book([["foo", "bar"], [1, 2]]));
    expect(res).toEqual({ error: "importNoRows" });
  });
});
