import type { Prisma } from "@prisma/client";

type MilestoneRow = { id: string; amountUzs: Prisma.Decimal; amountUsd: Prisma.Decimal; dueDate: Date | null };

/** Allocate received money to payment-schedule milestones in order (explicitly linked payments first). */
export function allocatePayments<M extends MilestoneRow>(
  milestones: M[],
  payments: { milestoneId: string | null; amountUzs: Prisma.Decimal }[],
  today: Date,
) {
  let pool = payments.filter((p) => !p.milestoneId).reduce((s, p) => s + Number(p.amountUzs), 0);
  return milestones.map((ms) => {
    const linked = payments.filter((p) => p.milestoneId === ms.id).reduce((s, p) => s + Number(p.amountUzs), 0);
    const planned = Number(ms.amountUzs);
    let paid = Math.min(linked, planned);
    pool += linked - paid;
    const take = Math.min(pool, planned - paid);
    paid += take;
    pool -= take;
    const remaining = planned - paid;
    const ratio = planned > 0 ? Number(ms.amountUsd) / planned : 0;
    return {
      ms,
      planned: { uzs: planned, usd: Number(ms.amountUsd), count: 1 },
      paid: { uzs: paid, usd: paid * ratio, count: 1 },
      remaining: { uzs: remaining, usd: remaining * ratio, count: 1 },
      overdue: remaining > 0.5 && !!ms.dueDate && ms.dueDate < today,
    };
  });
}
