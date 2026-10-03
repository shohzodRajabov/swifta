import type { Prisma } from "@prisma/client";

type Num = Prisma.Decimal | number | null | undefined;

/** Net amount from a gross amount that includes VAT at `rate` percent. */
export function netOf(gross: Num, rate: Num): number {
  const g = gross === null || gross === undefined ? 0 : Number(gross);
  const r = rate === null || rate === undefined ? 0 : Number(rate);
  return r > 0 ? (g * 100) / (100 + r) : g;
}

export function vatOf(gross: Num, rate: Num): number {
  const g = gross === null || gross === undefined ? 0 : Number(gross);
  return g - netOf(gross, rate);
}

export const VAT_RATES = [0, 12] as const;
