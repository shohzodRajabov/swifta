import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";

/** Expenses/payments above the company threshold wait for approval unless the author may approve. */
export async function approvalFor(user: CurrentUser, amountUzs: Prisma.Decimal): Promise<"APPROVED" | "PENDING"> {
  if (can(user, "finance.approve")) return "APPROVED";
  const company = await db.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { approvalThresholdUzs: true } });
  return amountUzs.greaterThanOrEqualTo(company.approvalThresholdUzs) ? "PENDING" : "APPROVED";
}
