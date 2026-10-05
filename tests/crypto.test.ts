import { describe, expect, it, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, isEncrypted, openSecret, sealSecret } from "@/lib/crypto-box";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("encryption at rest (X4, X8)", () => {
  it("round-trips and detects tampering", () => {
    const key = randomBytes(32);
    const box = encrypt(Buffer.from("pg_dump bytes"), key);
    expect(isEncrypted(box)).toBe(true);
    expect(decrypt(box, key).toString()).toBe("pg_dump bytes");
    box[box.length - 1] ^= 1;
    expect(() => decrypt(box, key)).toThrow();
    expect(() => decrypt(encrypt(Buffer.from("x"), key), randomBytes(32))).toThrow();
  });
  it("seals secrets and still reads legacy plain values", () => {
    const sealed = sealSecret("123:ABC")!;
    expect(sealed.startsWith("enc:")).toBe(true);
    expect(openSecret(sealed)).toBe("123:ABC");
    expect(openSecret("legacy-plain")).toBe("legacy-plain");
  });
});
