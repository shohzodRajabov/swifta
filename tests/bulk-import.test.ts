import { describe, expect, it } from "vitest";
import { headerKey, markFileDuplicates, matchKeys, parseRow } from "@/lib/bulk-import";

describe("bulk import", () => {
  it("maps headers by key in parentheses or plain key", () => {
    expect(headerKey("Artikul (sku) *", "products")).toBe("sku");
    expect(headerKey("purchasePrice", "products")).toBe("purchasePrice");
    expect(headerKey("Nimadir", "products")).toBeNull();
  });
  it("validates and converts values", () => {
    const r = parseRow("products", 2, { sku: " SPL-24 ", name: "Split", category: "Split", unit: "dona", purchasePrice: "6 900 000", purchaseCurrency: "$", minStock: "-1" });
    expect(r.values.sku).toBe("SPL-24");
    expect(r.values.purchasePrice).toBe(6900000);
    expect(r.values.purchaseCurrency).toBe("USD");
    expect(r.issues).toEqual([{ column: "minStock", code: "number" }]);
    expect(parseRow("products", 3, { name: "x" }).issues.map((i) => i.column)).toEqual(["sku", "category", "unit"]);
  });
  it("parses phones, dates, client types", () => {
    const e = parseRow("employees", 2, { fullName: "A", phone: "90 111 22 33", hireDate: "01.03.2025" });
    expect(e.values.phone).toBe("998901112233");
    expect((e.values.hireDate as Date).toISOString().slice(0, 10)).toBe("2025-03-01");
    expect(parseRow("employees", 2, { fullName: "A", hireDate: 45717 }).values.hireDate).toEqual(new Date(Date.UTC(2025, 2, 1)));
    expect(parseRow("clients", 2, { name: "B", type: "Davlat" }).values.type).toBe("GOVERNMENT");
    expect(parseRow("clients", 2, { name: "B", type: "xyz", email: "bad" }).issues.map((i) => i.code)).toEqual(["clientType", "email"]);
  });
  it("matches by identity and flags duplicates in the file", () => {
    expect(matchKeys("clients", { tin: "200", name: "Bank" })).toEqual(["tin:200", "name:bank"]);
    const rows = markFileDuplicates("products", [parseRow("products", 2, { sku: "A", name: "a", category: "c", unit: "u" }), parseRow("products", 3, { sku: "a", name: "b", category: "c", unit: "u" })]);
    expect(rows[1].issues).toEqual([{ column: "sku", code: "duplicateInFile" }]);
  });
});
