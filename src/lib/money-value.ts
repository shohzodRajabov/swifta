import type { Prisma } from "@prisma/client";
import type { MoneyValue } from "@/components/money";

/** Serialize a single money record (amount + rate details) for the <Money> component. */
export function recordMoney(r: {
  amount: Prisma.Decimal;
  currency: string;
  fxRate: Prisma.Decimal;
  fxDate: Date;
  fxSource: string;
  amountUzs: Prisma.Decimal;
  amountUsd: Prisma.Decimal;
}): MoneyValue {
  return {
    uzs: Number(r.amountUzs),
    usd: Number(r.amountUsd),
    rate: Number(r.fxRate),
    fxDate: r.fxDate.toISOString(),
    source: r.fxSource,
    currency: r.currency,
    original: Number(r.amount),
  };
}
