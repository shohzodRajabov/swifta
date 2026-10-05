/**
 * Decrypt a backup downloaded directly from the bucket (disaster recovery without the web app).
 * Usage: ENCRYPTION_KEY=... pnpm tsx scripts/decrypt-backup.ts backup.dump.enc > backup.dump
 */
import { readFileSync } from "node:fs";
import { decrypt, encryptionKey } from "../src/lib/crypto-box";

const file = process.argv[2];
const key = encryptionKey();
if (!file || !key) {
  console.error("Usage: ENCRYPTION_KEY=<base64> pnpm tsx scripts/decrypt-backup.ts <file.dump.enc> > backup.dump");
  process.exit(1);
}
process.stdout.write(decrypt(readFileSync(file), key));
