import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hourlyCost } from "@/lib/payroll";
import { toDateOnly } from "@/lib/utils";

type Tx = Prisma.TransactionClient;

export async function nextTicketNumber(tx: Tx, companyId: string) {
  const last = await tx.serviceTicket.findFirst({ where: { companyId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

/** A project is under warranty while today is within [warrantyStart, warrantyEnd]. */
export function underWarranty(p: { warrantyStart: Date | null; warrantyEnd: Date | null } | null | undefined, day = new Date()) {
  if (!p?.warrantyEnd) return false;
  const d = toDateOnly(day);
  return p.warrantyEnd >= d && (!p.warrantyStart || p.warrantyStart <= d);
}

/** Average employer cost of one technician hour (used when labour cost is not entered). */
export async function averageHourlyCost(companyId: string) {
  const [company, employees] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId } }),
    db.employee.findMany({ where: { companyId, active: true, salary: { gt: 0 } }, select: { salary: true, normDays: true } }),
  ]);
  if (employees.length === 0) return 0;
  return employees.reduce((s, e) => s + hourlyCost(company, e), 0) / employees.length;
}

/** Cost of a ticket: labour + other + parts issued from the warehouse. */
export function ticketCost(t: { laborCostUzs: unknown; otherCostUzs: unknown; parts: { qty: unknown; unitCostUzs: unknown }[] }) {
  const parts = t.parts.reduce((s, p) => s + Number(p.qty) * Number(p.unitCostUzs), 0);
  return { parts, total: Number(t.laborCostUzs) + Number(t.otherCostUzs) + parts };
}
