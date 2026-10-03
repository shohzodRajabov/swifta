import "server-only";
import { Prisma, type Currency } from "@prisma/client";
import { db } from "./db";
import { isoDate, toDateOnly } from "./utils";

export type FxQuote = {
  /** UZS per 1 USD */
  rate: Prisma.Decimal;
  /** Date the rate is officially effective (may precede the requested date) */
  date: Date;
  source: string;
};

/**
 * Official USD rate from the Central Bank of Uzbekistan for a given day.
 * Cached in `ExchangeRate`; falls back to the latest cached rate when CBU is unreachable.
 */
export async function getUsdRate(day: Date): Promise<FxQuote> {
  const date = toDateOnly(day);
  const cached = await db.exchangeRate.findUnique({
    where: { currency_date: { currency: "USD", date } },
  });
  if (cached) return { rate: cached.rate, date: cached.date, source: cached.source };

  try {
    const res = await fetch(
      `https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/${isoDate(date)}/`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    const data = (await res.json()) as { Rate: string; Date: string }[];
    const row = data[0];
    if (!row) throw new Error("empty CBU response");
    const [d, m, y] = row.Date.split(".");
    const effective = new Date(Date.UTC(+y, +m - 1, +d));
    const rate = new Prisma.Decimal(row.Rate);
    // Only cache past days; today's rate is final once published, future days are not.
    if (date.getTime() <= toDateOnly(new Date()).getTime()) {
      await db.exchangeRate.upsert({
        where: { currency_date: { currency: "USD", date } },
        create: { currency: "USD", date, rate, source: "CBU" },
        update: {},
      });
    }
    return { rate, date: effective, source: "CBU" };
  } catch {
    const latest = await db.exchangeRate.findFirst({
      where: { currency: "USD", date: { lte: date } },
      orderBy: { date: "desc" },
    });
    if (latest) return { rate: latest.rate, date: latest.date, source: latest.source };
    throw new Error("Valyuta kursini olib bo'lmadi (CBU). Kursni qo'lda kiriting.");
  }
}

export type MoneyFields = {
  amount: Prisma.Decimal;
  currency: Currency;
  fxRate: Prisma.Decimal;
  fxDate: Date;
  fxSource: string;
  amountUzs: Prisma.Decimal;
  amountUsd: Prisma.Decimal;
};

/**
 * Build the normalized money columns for a record.
 * `manualRate` overrides the CBU rate (source becomes MANUAL).
 */
export async function resolveMoney(input: {
  amount: number | string | Prisma.Decimal;
  currency: Currency;
  date: Date;
  manualRate?: number | null;
}): Promise<MoneyFields> {
  const amount = new Prisma.Decimal(input.amount);
  let quote: FxQuote;
  if (input.manualRate && input.manualRate > 0) {
    quote = { rate: new Prisma.Decimal(input.manualRate), date: toDateOnly(input.date), source: "MANUAL" };
  } else {
    quote = await getUsdRate(input.date);
  }
  const amountUzs = input.currency === "UZS" ? amount : amount.mul(quote.rate);
  const amountUsd = input.currency === "USD" ? amount : amount.div(quote.rate);
  return {
    amount,
    currency: input.currency,
    fxRate: quote.rate,
    fxDate: quote.date,
    fxSource: quote.source,
    amountUzs: amountUzs.toDecimalPlaces(2),
    amountUsd: amountUsd.toDecimalPlaces(2),
  };
}
