// Symmetric encryption for data at rest (backups, stored secrets): AES-256-GCM with a key from
// ENCRYPTION_KEY (32 bytes, base64). No "server-only": the background scheduler uses it too.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("SWB1"); // format version marker
const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptionKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64)");
  return key;
}

export function isEncrypted(buf: Buffer) {
  return buf.length > MAGIC.length + IV_LEN + TAG_LEN && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

/** MAGIC | IV | TAG | ciphertext */
export function encrypt(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decrypt(box: Buffer, key: Buffer): Buffer {
  if (!isEncrypted(box)) throw new Error("not an encrypted payload");
  const iv = box.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = box.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(box.subarray(MAGIC.length + IV_LEN + TAG_LEN)), decipher.final()]);
}

/** Short secrets in the database (e.g. a bot token): "enc:<base64>" when a key is configured. */
export function sealSecret(value: string | null): string | null {
  if (!value) return value;
  const key = encryptionKey();
  return key ? `enc:${encrypt(Buffer.from(value, "utf8"), key).toString("base64")}` : value;
}

export function openSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("enc:")) return value; // stored before encryption was enabled
  const key = encryptionKey();
  if (!key) throw new Error("ENCRYPTION_KEY is required to read an encrypted secret");
  return decrypt(Buffer.from(value.slice(4), "base64"), key).toString("utf8");
}
