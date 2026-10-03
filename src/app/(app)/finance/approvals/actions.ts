"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, formObject, runAction, zOptText } from "@/lib/action";

const schema = z.object({
  kind: z.enum(["expense", "overhead", "supplierPayment", "contractorPayment"]),
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: zOptText,
});

/** Approve or reject a pending expense / payment. */
export async function decide(formData: FormData) {
  await runAction("finance.approve", async (user) => {
    const d = schema.parse(formObject(formData));
    const data = {
      approval: d.decision,
      approvedById: user.id,
      approvedAt: new Date(),
      rejectReason: d.decision === "REJECTED" ? d.reason : null,
    };
    const ctx = { companyId: user.companyId, userId: user.id };
    await db.$transaction(async (tx) => {
      let entity = "";
      switch (d.kind) {
        case "expense": {
          const r = await tx.expense.findFirst({ where: { id: d.id, project: { companyId: user.companyId }, approval: "PENDING" } });
          if (!r) fail("invalid");
          await tx.expense.update({ where: { id: d.id }, data });
          entity = "Expense";
          break;
        }
        case "overhead": {
          const r = await tx.overheadExpense.findFirst({ where: { id: d.id, companyId: user.companyId, approval: "PENDING" } });
          if (!r) fail("invalid");
          await tx.overheadExpense.update({ where: { id: d.id }, data });
          entity = "OverheadExpense";
          break;
        }
        case "supplierPayment": {
          const r = await tx.supplierPayment.findFirst({ where: { id: d.id, supplier: { companyId: user.companyId }, approval: "PENDING" } });
          if (!r) fail("invalid");
          await tx.supplierPayment.update({ where: { id: d.id }, data });
          entity = "SupplierPayment";
          break;
        }
        case "contractorPayment": {
          const r = await tx.contractorPayment.findFirst({ where: { id: d.id, contractor: { companyId: user.companyId }, approval: "PENDING" } });
          if (!r) fail("invalid");
          await tx.contractorPayment.update({ where: { id: d.id }, data });
          entity = "ContractorPayment";
          break;
        }
      }
      await audit(tx, ctx, entity, d.id, "update", { approval: "PENDING" }, { approval: d.decision, reason: d.reason });
    });
  });
  revalidatePath("/finance/approvals");
  revalidatePath("/finance");
  revalidatePath("/");
}
