import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, newTotpSecret, totp, verifyTotp } from "@/lib/totp";

// RFC 4226 / 6238 test secret "12345678901234567890"
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (X9)", () => {
  it("matches RFC 4226 HOTP vectors", () => {
    const key = Buffer.from("12345678901234567890");
    expect([0, 1, 2, 9].map((c) => hotp(key, c))).toEqual(["755224", "287082", "359152", "520489"]);
  });
  it("matches RFC 6238 TOTP vectors (SHA1, last 6 digits)", () => {
    expect(totp(SECRET, 59_000)).toBe("287082");
    expect(totp(SECRET, 1_111_111_109_000)).toBe("081804");
    expect(totp(SECRET, 1_234_567_890_000)).toBe("005924");
  });
  it("verifies with ±1 step drift and rejects others", () => {
    const now = 1_700_000_000_000;
    const code = totp(SECRET, now);
    expect(verifyTotp(SECRET, code, now)).toBe(true);
    expect(verifyTotp(SECRET, code, now + 30_000)).toBe(true);
    expect(verifyTotp(SECRET, code, now + 90_000)).toBe(false);
    expect(verifyTotp(SECRET, "12345", now)).toBe(false);
  });
  it("base32 round trip", () => {
    const s = newTotpSecret();
    expect(base32Encode(base32Decode(s))).toBe(s);
    expect(s).toHaveLength(32);
  });
});
