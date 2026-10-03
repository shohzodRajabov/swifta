import "server-only";
import { db } from "@/lib/db";

/** Number of money records waiting for approval. */
export async function pendingApprovalsCount(companyId: string): Promise<number> {
  const [e, o, s, c] = await Promise.all([
    db.expense.count({ where: { project: { companyId }, approval: "PENDING" } }),
    db.overheadExpense.count({ where: { companyId, approval: "PENDING" } }),
    db.supplierPayment.count({ where: { supplier: { companyId }, approval: "PENDING" } }),
    db.contractorPayment.count({ where: { contractor: { companyId }, approval: "PENDING" } }),
  ]);
  return e + o + s + c;
}
