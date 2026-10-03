/** Normalize an Uzbek phone number to digits with country code: "90 123-45-67" -> "998901234567". */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 9) return `998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

/** "998901234567" -> "+998 90 123 45 67" */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998")) {
    return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  }
  return `+${d}`;
}
