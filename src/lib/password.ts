import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Readable one-time password (no 0/O, 1/l/I). */
export function generateOneTimePassword(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** One-time passwords are valid for 72 hours (X7). */
export const OTP_HOURS = 72;
export function otpExpiry(from = new Date()) {
  return new Date(from.getTime() + OTP_HOURS * 3600 * 1000);
}
