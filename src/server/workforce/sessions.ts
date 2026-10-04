import "server-only";
import { Prisma, type ContributionMethod, type GroupRole } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fail } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getUsdRate } from "@/lib/fx";
import { hourlyCost } from "@/lib/payroll";
import { toDateOnly } from "@/lib/utils";
import type { CurrentUser } from "@/lib/auth";
import { computeShares } from "./contribution";
import { membersAt } from "./groups";
import { efficiencyIndexes } from "./efficiency";

/** Who may record a session on a task: managers, the task's designated recorders, or the leader of the group. */
export async function canRecordSession(user: CurrentUser, task: { recorderUserIds: string[] }, groupId: string | null) {
  if (can(user, "sessions.approve") || can(user, "tasks.manage")) return true;
  if (!can(user, "sessions.record")) return false;
  if (task.recorderUserIds.includes(user.id)) return true;
  if (groupId && user.employee) {
    const today = new Date();
    const lead = await db.groupMember.findFirst({
      where: { groupId, employeeId: user.employee.id, role: "LEADER", fromDate: { lte: today }, OR: [{ toDate: null }, { toDate: { gte: today } }] },
    });
    return !!lead;
  }
  return false;
}

export type SessionInput = {
  taskId: string;
  groupId: string | null;
  date: Date;
  hours: number;
  quantity: number;
  note?: string | null;
  problems?: string | null;
  method?: ContributionMethod | null;
  /** explicit members (otherwise the group composition on that date) */
  members?: { employeeId: string; hours?: number | null; percent?: number | null }[];
  materials?: { item: string; qty: number }[];
};

export async function recordSession(user: CurrentUser, input: SessionInput) {
  const task = await db.task.findFirst({
    where: { id: input.taskId, companyId: user.companyId },
    include: { project: { select: { id: true, companyId: true } } },
  });
  if (!task) fail("invalid");
  if (task.status === "CANCELLED" || task.status === "APPROVED") fail("taskClosed");
  if (!(await canRecordSession(user, task, input.groupId))) fail("forbidden");
  const company = await db.company.findUniqueOrThrow({ where: { id: user.companyId } });
  const date = toDateOnly(input.date);

  // Members: explicit list or the group's composition on that day.
  let roster: { employeeId: string; role: GroupRole; hours: number; percent?: number | null }[] = [];
  if (input.members?.length) {
    const groupMembers = input.groupId ? await membersAt(input.groupId, date) : [];
    roster = input.members.map((m) => ({
      employeeId: m.employeeId,
      role: groupMembers.find((g) => g.employeeId === m.employeeId)?.role ?? "WORKER",
      hours: m.hours && m.hours > 0 ? m.hours : input.hours,
      percent: m.percent,
    }));
  } else if (input.groupId) {
    roster = (await membersAt(input.groupId, date)).map((m) => ({ employeeId: m.employeeId, role: m.role, hours: input.hours }));
  }
  if (roster.length === 0) fail("noMembers");
  const employees = await db.employee.findMany({
    where: { id: { in: roster.map((r) => r.employeeId) }, companyId: user.companyId },
  });
  if (employees.length !== roster.length) fail("invalid");

  const method = input.method ?? company.defaultContribution;
  const eff = method === "EFFICIENCY" ? await efficiencyIndexes(user.companyId, roster.map((r) => r.employeeId)) : null;
  const shares = computeShares(
    method,
    input.quantity,
    roster.map((r) => ({ ...r, efficiency: eff?.get(r.employeeId)?.index ?? null })),
    (company.contributionWeights ?? undefined) as Record<string, number> | undefined,
  );
  if (method === "LEADER") {
    const total = roster.reduce((s, r) => s + (r.percent ?? 0), 0);
    if (Math.abs(total - 100) > 0.5) fail("sharesMustBe100");
  }
  const quote = await getUsdRate(date).catch(() => null);
  const leader = roster.find((r) => r.role === "LEADER")?.employeeId ?? (user.employee && roster.some((r) => r.employeeId === user.employee!.id) ? user.employee.id : null);

  let laborUzs = 0;
  const memberRows = roster.map((r) => {
    const e = employees.find((x) => x.id === r.employeeId)!;
    const rate = hourlyCost(company, e);
    const cost = rate * r.hours;
    laborUzs += cost;
    const share = shares.find((s) => s.employeeId === r.employeeId)!;
    return {
      employeeId: r.employeeId,
      role: r.role,
      hours: new Prisma.Decimal(r.hours),
      sharePercent: new Prisma.Decimal(share.sharePercent),
      contributionQty: new Prisma.Decimal(share.contributionQty),
      hourlyCostUzs: new Prisma.Decimal(rate.toFixed(2)),
      laborCostUzs: new Prisma.Decimal(cost.toFixed(2)),
      confirmation: user.employee?.id === r.employeeId ? ("CONFIRMED" as const) : ("PENDING" as const),
      confirmedAt: user.employee?.id === r.employeeId ? new Date() : null,
    };
  });

  return db.$transaction(async (tx) => {
    const session = await tx.workSession.create({
      data: {
        companyId: user.companyId,
        projectId: task.projectId,
        taskId: task.id,
        groupId: input.groupId,
        leaderId: leader,
        date,
        hours: new Prisma.Decimal(input.hours),
        quantity: new Prisma.Decimal(input.quantity),
        unit: task.unit,
        note: input.note,
        problems: input.problems,
        method,
        recordedById: user.id,
        laborCostUzs: new Prisma.Decimal(laborUzs.toFixed(2)),
        laborCostUsd: new Prisma.Decimal(quote ? (laborUzs / Number(quote.rate)).toFixed(2) : "0"),
        members: { create: memberRows },
      },
      include: { members: true },
    });
    // Worked day for every member.
    for (const r of roster) {
      await tx.attendanceDay.upsert({
        where: { employeeId_date: { employeeId: r.employeeId, date } },
        create: { companyId: user.companyId, employeeId: r.employeeId, date, type: "OBJECT", projectId: task.projectId, hours: new Prisma.Decimal(r.hours), source: "SESSION", recordedById: user.id },
        update: { type: "OBJECT", projectId: task.projectId, source: "SESSION" },
      });
    }
    // Material used in this session (recorded by the group leader).
    for (const m of input.materials ?? []) {
      if (!(m.qty > 0)) continue;
      let productId: string | null = null;
      let bomItemId: string | null = null;
      let name = "";
      let unit = "";
      if (m.item.startsWith("bom:")) {
        const b = await tx.bomItem.findFirst({ where: { id: m.item.slice(4), projectId: task.projectId } });
        if (!b) continue;
        bomItemId = b.id;
        name = b.name;
        unit = b.unit;
      } else {
        const p = await tx.product.findFirst({ where: { id: m.item, companyId: user.companyId } });
        if (!p) continue;
        productId = p.id;
        name = p.name;
        unit = p.unit;
      }
      await tx.stockMovement.create({
        data: {
          companyId: user.companyId,
          type: "CONSUMPTION",
          date,
          productId,
          bomItemId,
          name,
          unit,
          qty: new Prisma.Decimal(m.qty),
          projectId: task.projectId,
          taskId: task.id,
          sessionId: session.id,
          createdById: user.id,
        },
      });
    }
    if (["NEW", "ASSIGNED", "ACCEPTED", "REWORK"].includes(task.status)) {
      await tx.task.update({ where: { id: task.id }, data: { status: "IN_PROGRESS", actualStart: task.actualStart ?? new Date() } });
      await tx.taskEvent.create({ data: { taskId: task.id, type: "STATUS", userId: user.id, fromStatus: task.status, toStatus: "IN_PROGRESS" } });
    }
    await audit(tx, { companyId: user.companyId, userId: user.id }, "WorkSession", session.id, "create", null, session);
    return session;
  });
}
