import "server-only";
import { db } from "@/lib/db";
import { zero, type Amount } from "@/lib/metrics";

export type ContractorBalance = {
  /** Agreed value of all non-cancelled outsource tasks. */
  agreed: Amount;
  /** Verified (accepted) work value — what we owe for. */
  completed: Amount;
  paid: Amount;
  /** completed − paid (negative = advance paid) */
  payable: Amount;
};

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function contractorBalances(companyId: string, contractorIds?: string[]): Promise<Map<string, ContractorBalance>> {
  const filter = contractorIds ? { in: contractorIds } : undefined;
  const [assignments, payments] = await Promise.all([
    db.taskAssignment.findMany({
      where: { kind: "CONTRACTOR", contractorId: filter, contractor: { companyId }, outsourceStatus: { notIn: ["CANCELLED", "REJECTED"] } },
      select: { contractorId: true, agreedUzs: true, agreedUsd: true, actualUzs: true, actualUsd: true, outsourceStatus: true },
    }),
    db.contractorPayment.groupBy({
      by: ["contractorId"],
      where: { contractor: { companyId }, contractorId: filter, approval: "APPROVED" },
      _sum: { amountUzs: true, amountUsd: true },
      _count: true,
    }),
  ]);
  const out = new Map<string, ContractorBalance>();
  const get = (id: string) => {
    let b = out.get(id);
    if (!b) {
      b = { agreed: zero(), completed: zero(), paid: zero(), payable: zero() };
      out.set(id, b);
    }
    return b;
  };
  for (const a of assignments) {
    const b = get(a.contractorId!);
    b.agreed = { uzs: b.agreed.uzs + n(a.agreedUzs), usd: b.agreed.usd + n(a.agreedUsd), count: b.agreed.count + 1 };
    if (a.outsourceStatus === "VERIFIED") {
      b.completed = {
        uzs: b.completed.uzs + n(a.actualUzs ?? a.agreedUzs),
        usd: b.completed.usd + n(a.actualUsd ?? a.agreedUsd),
        count: b.completed.count + 1,
      };
    }
  }
  for (const p of payments) {
    get(p.contractorId).paid = { uzs: n(p._sum.amountUzs), usd: n(p._sum.amountUsd), count: p._count };
  }
  for (const b of out.values()) {
    b.payable = { uzs: b.completed.uzs - b.paid.uzs, usd: b.completed.usd - b.paid.usd, count: b.completed.count + b.paid.count };
  }
  return out;
}
