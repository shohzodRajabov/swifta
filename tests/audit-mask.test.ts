import { describe, expect, it } from "vitest";
import { maskForViewer, stripSecrets } from "@/lib/audit-mask";

describe("audit masking", () => {
  it("never keeps password hashes or 2FA secrets", () => {
    expect(stripSecrets({ name: "A", passwordHash: "x", nested: [{ totpSecret: "y", ok: 1 }] })).toEqual({ name: "A", nested: [{ ok: 1 }] });
  });
  it("masks salary and passport for viewers without permission", () => {
    const v = { fullName: "B", salary: "5000000", passportNumber: "AA1234567" };
    expect(maskForViewer(v, { perms: [] })).toEqual({ fullName: "B", salary: "•••", passportNumber: "•••" });
    expect(maskForViewer(v, { perms: ["salaries.view", "employees.edit"] })).toEqual(v);
  });
});
