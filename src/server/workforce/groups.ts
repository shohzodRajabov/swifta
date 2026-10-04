import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Db = typeof db | Prisma.TransactionClient;

/** Members of a group on a given day (membership history: fromDate ≤ day ≤ toDate). */
export async function membersAt(groupId: string, day: Date, tx: Db = db) {
  return tx.groupMember.findMany({
    where: { groupId, fromDate: { lte: day }, OR: [{ toDate: null }, { toDate: { gte: day } }] },
    include: { employee: { select: { id: true, fullName: true, salary: true, normDays: true, userId: true } } },
    orderBy: [{ role: "asc" }, { fromDate: "asc" }],
  });
}

/** Current leader (employee) of a group. */
export async function leaderOf(groupId: string, day = new Date(), tx: Db = db) {
  const members = await membersAt(groupId, day, tx);
  return members.find((m) => m.role === "LEADER")?.employee ?? null;
}

/** Groups led by an employee today. */
export async function groupsLedBy(employeeId: string) {
  const today = new Date();
  return db.groupMember.findMany({
    where: { employeeId, role: "LEADER", fromDate: { lte: today }, OR: [{ toDate: null }, { toDate: { gte: today } }] },
    select: { groupId: true },
  });
}
