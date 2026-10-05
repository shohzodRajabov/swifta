"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { normalizePhone } from "@/lib/phone";
import { generateOneTimePassword, otpExpiry } from "@/lib/password";
import { toDateOnly } from "@/lib/utils";
import { fail, formObject, runAction, zDate, zOptDate, zOptId, zOptNumber, zOptText, zText, type ActionState } from "@/lib/action";
import type { CurrentUser } from "@/lib/auth";
import { computePayroll, monthRange } from "@/server/workforce/payroll";

const ctx = (u: CurrentUser) => ({ companyId: u.companyId, userId: u.id });

const employeeSchema = z.object({
  fullName: zText,
  phone: zOptText,
  position: zOptText,
  department: zOptText,
  salary: zOptNumber,
  normDays: zOptNumber,
  hireDate: zOptDate,
  passportNumber: zOptText,
  note: zOptText,
  active: z.preprocess((v) => v === "on", z.boolean()),
});

export async function saveEmployee(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  let target = id ?? "";
  const res = await runAction("employees.edit", async (user) => {
    const d = employeeSchema.parse({ active: id ? (formData.get("active") ?? "") : "on", ...formObject(formData) });
    const phone = d.phone ? normalizePhone(d.phone) : null;
    if (d.phone && !phone) fail("phoneInvalid");
    const before = id ? await db.employee.findFirst({ where: { id, companyId: user.companyId } }) : null;
    if (id && !before) fail("invalid");
    // Salary is visible/editable only with the salaries permission.
    const salary = can(user, "salaries.view") ? new Prisma.Decimal(d.salary ?? 0) : (before?.salary ?? new Prisma.Decimal(0));
    const data = {
      fullName: d.fullName,
      phone,
      position: d.position,
      department: d.department,
      salary,
      normDays: d.normDays ? Math.round(d.normDays) : null,
      hireDate: d.hireDate,
      passportNumber: d.passportNumber ? d.passportNumber.toUpperCase().replace(/\s+/g, " ") : null,
      note: d.note,
      active: d.active,
    };
    await db.$transaction(async (tx) => {
      if (id) {
        const after = await tx.employee.update({ where: { id }, data });
        await audit(tx, ctx(user), "Employee", id, "update", before, after);
      } else {
        const e = await tx.employee.create({ data: { ...data, companyId: user.companyId } });
        await audit(tx, ctx(user), "Employee", e.id, "create", null, e);
        target = e.id;
      }
    });
  });
  if (res?.ok) {
    revalidatePath("/employees");
    if (!id) redirect(`/employees/${target}`);
  }
  return res;
}

/** Give an employee a login: phone + one-time password + role (or update the existing login's role). */
export async function grantLogin(employeeId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("users.manage", async (user) => {
    const d = z.object({ phone: zText, roleId: zText }).parse(formObject(formData));
    const phone = normalizePhone(d.phone);
    if (!phone) fail("phoneInvalid");
    const [employee, role] = await Promise.all([
      db.employee.findFirst({ where: { id: employeeId, companyId: user.companyId } }),
      db.roleDef.findFirst({ where: { id: d.roleId, companyId: user.companyId } }),
    ]);
    if (!employee || !role) fail("invalid");
    if (employee.userId) {
      await db.user.update({ where: { id: employee.userId }, data: { roleId: role.id, phone } });
      return;
    }
    const password = generateOneTimePassword();
    await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          companyId: user.companyId,
          name: employee.fullName,
          phone,
          position: employee.position,
          roleId: role.id,
          passwordHash: await bcrypt.hash(password, 10),
          mustChangePassword: true,
          otpExpiresAt: otpExpiry(),
        },
      });
      await tx.employee.update({ where: { id: employeeId }, data: { userId: u.id, phone } });
      await audit(tx, ctx(user), "User", u.id, "create", null, { name: u.name, phone, roleId: role.id, employeeId });
    });
    return { password, name: employee.fullName };
  });
  if (res?.ok) revalidatePath(`/employees/${employeeId}`);
  return res;
}

// ---- groups (composition history is never overwritten) ---------------------

export async function createGroup(_: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction("groups.manage", async (user) => {
    const d = z.object({ name: zText, specialization: zOptText, leaderId: zOptId, fromDate: zDate }).parse(formObject(formData));
    const g = await db.$transaction(async (tx) => {
      const g = await tx.workGroup.create({ data: { companyId: user.companyId, name: d.name, specialization: d.specialization } });
      if (d.leaderId) {
        if (!(await tx.employee.findFirst({ where: { id: d.leaderId, companyId: user.companyId } }))) fail("invalid");
        await tx.groupMember.create({ data: { groupId: g.id, employeeId: d.leaderId, role: "LEADER", fromDate: toDateOnly(d.fromDate) } });
      }
      await audit(tx, ctx(user), "WorkGroup", g.id, "create", null, g);
      return g;
    });
    id = g.id;
  });
  if (res?.ok) redirect(`/employees/groups/${id}`);
  return res;
}

export async function updateGroup(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("groups.manage", async (user) => {
    const d = z
      .object({ name: zText, specialization: zOptText, active: z.preprocess((v) => v === "on", z.boolean()) })
      .parse({ active: formData.get("active") ?? "", ...formObject(formData) });
    const before = await db.workGroup.findFirst({ where: { id, companyId: user.companyId } });
    if (!before) fail("invalid");
    await db.$transaction(async (tx) => {
      const after = await tx.workGroup.update({ where: { id }, data: d });
      await audit(tx, ctx(user), "WorkGroup", id, "update", before, after);
    });
  });
  if (res?.ok) revalidatePath(`/employees/groups/${id}`);
  return res;
}

/** Add a member from a date (a role change = close the old membership and open a new one). */
export async function addMember(groupId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("groups.manage", async (user) => {
    const d = z
      .object({ employeeId: zText, role: z.enum(["LEADER", "SENIOR", "WORKER"]), fromDate: zDate })
      .parse(formObject(formData));
    const [group, employee] = await Promise.all([
      db.workGroup.findFirst({ where: { id: groupId, companyId: user.companyId } }),
      db.employee.findFirst({ where: { id: d.employeeId, companyId: user.companyId } }),
    ]);
    if (!group || !employee) fail("invalid");
    const from = toDateOnly(d.fromDate);
    const dayBefore = new Date(from.getTime() - 86400000);
    await db.$transaction(async (tx) => {
      // Close an open membership of the same person in this group.
      const open = await tx.groupMember.findFirst({ where: { groupId, employeeId: d.employeeId, toDate: null } });
      if (open) {
        if (open.fromDate >= from) fail("dateOrder");
        await tx.groupMember.update({ where: { id: open.id }, data: { toDate: dayBefore } });
      }
      // Only one leader at a time: close the previous leader's leadership.
      if (d.role === "LEADER") {
        const leaders = await tx.groupMember.findMany({ where: { groupId, role: "LEADER", toDate: null, NOT: { employeeId: d.employeeId } } });
        for (const l of leaders) {
          if (l.fromDate >= from) fail("dateOrder");
          await tx.groupMember.update({ where: { id: l.id }, data: { toDate: dayBefore } });
          await tx.groupMember.create({ data: { groupId, employeeId: l.employeeId, role: "SENIOR", fromDate: from } });
        }
      }
      const m = await tx.groupMember.create({ data: { groupId, employeeId: d.employeeId, role: d.role, fromDate: from } });
      await audit(tx, ctx(user), "GroupMember", m.id, "create", null, m);
    });
  });
  if (res?.ok) revalidatePath(`/employees/groups/${groupId}`);
  return res;
}

export async function endMember(_: ActionState, formData: FormData): Promise<ActionState> {
  let groupId = "";
  const res = await runAction("groups.manage", async (user) => {
    const d = z.object({ id: zText, toDate: zDate }).parse(formObject(formData));
    const m = await db.groupMember.findFirst({ where: { id: d.id, group: { companyId: user.companyId } } });
    if (!m || m.toDate) fail("invalid");
    groupId = m.groupId;
    const to = toDateOnly(d.toDate);
    if (to < m.fromDate) fail("dateOrder");
    await db.$transaction(async (tx) => {
      const after = await tx.groupMember.update({ where: { id: m.id }, data: { toDate: to } });
      await audit(tx, ctx(user), "GroupMember", m.id, "update", m, after);
    });
  });
  if (res?.ok) revalidatePath(`/employees/groups/${groupId}`);
  return res;
}

// ---- attendance --------------------------------------------------------------

export async function markAttendance(_: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("attendance.manage", async (user) => {
    const d = z
      .object({
        date: zDate,
        type: z.enum(["OBJECT", "WORKSHOP", "TRAVEL", "OFFICE", "IDLE_MATERIAL", "IDLE_CLIENT", "IDLE_OTHER", "ABSENT", "LEAVE", "SICK"]),
        projectId: zOptId,
        hours: zOptNumber,
        note: zOptText,
      })
      .parse(formObject(formData));
    const ids = formData.getAll("employeeIds").map(String);
    if (ids.length === 0) fail("required");
    // Group leaders (without full workforce rights) may only mark their own group members.
    if (!can(user, "employees.edit") && !can(user, "tasks.manage")) {
      if (!user.employee) fail("forbidden");
      const today = new Date();
      const led = await db.groupMember.findMany({
        where: { employeeId: user.employee.id, role: "LEADER", fromDate: { lte: today }, OR: [{ toDate: null }, { toDate: { gte: today } }] },
        select: { groupId: true },
      });
      const allowed = await db.groupMember.findMany({
        where: { groupId: { in: led.map((l) => l.groupId) }, OR: [{ toDate: null }, { toDate: { gte: today } }] },
        select: { employeeId: true },
      });
      const set = new Set([...allowed.map((a) => a.employeeId), user.employee.id]);
      if (ids.some((i) => !set.has(i))) fail("forbidden");
    }
    if (d.projectId && !(await db.project.findFirst({ where: { id: d.projectId, companyId: user.companyId } }))) fail("invalid");
    const date = toDateOnly(d.date);
    await db.$transaction(async (tx) => {
      for (const employeeId of ids) {
        const e = await tx.employee.findFirst({ where: { id: employeeId, companyId: user.companyId } });
        if (!e) continue;
        const existing = await tx.attendanceDay.findUnique({ where: { employeeId_date: { employeeId, date } } });
        if (existing?.source === "SESSION" && d.type !== "OBJECT") continue; // a session already proves object work
        const row = await tx.attendanceDay.upsert({
          where: { employeeId_date: { employeeId, date } },
          create: { companyId: user.companyId, employeeId, date, type: d.type, projectId: d.projectId, hours: d.hours ? new Prisma.Decimal(d.hours) : null, note: d.note, source: "MANUAL", recordedById: user.id },
          update: { type: d.type, projectId: d.projectId, hours: d.hours ? new Prisma.Decimal(d.hours) : null, note: d.note, source: "MANUAL", recordedById: user.id },
        });
        await audit(tx, ctx(user), "AttendanceDay", row.id, existing ? "update" : "create", existing, row);
      }
    });
  });
  if (res?.ok) revalidatePath("/employees");
  return res;
}

// ---- payroll month close -------------------------------------------------------

export async function closePayrollMonth(_: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("payroll.manage", async (user) => {
    const month = z.string().regex(/^\d{4}-\d{2}$/).parse(formData.get("month"));
    const existing = await db.payrollMonth.findUnique({ where: { companyId_month: { companyId: user.companyId, month } } });
    if (existing?.status === "CLOSED") fail("monthClosed");
    const { rows, pendingSessions } = await computePayroll(user.companyId, month);
    if (pendingSessions > 0) fail("pendingSessions", { n: String(pendingSessions) });
    const totalUnallocated = rows.reduce((s, r) => s + r.unallocated, 0);
    const { to } = monthRange(month);
    const entity = await db.legalEntity.findFirst({ where: { companyId: user.companyId, isDefault: true } });
    await db.$transaction(async (tx) => {
      const pm = await tx.payrollMonth.upsert({
        where: { companyId_month: { companyId: user.companyId, month } },
        create: { companyId: user.companyId, month, status: "CLOSED", closedAt: new Date(), closedById: user.id },
        update: { status: "CLOSED", closedAt: new Date(), closedById: user.id },
      });
      await tx.payrollLine.deleteMany({ where: { monthId: pm.id } });
      for (const r of rows) {
        await tx.payrollLine.create({
          data: {
            monthId: pm.id,
            employeeId: r.employeeId,
            salary: new Prisma.Decimal(r.salary),
            normDays: r.normDays,
            workedDays: r.workedDays,
            dailyRateUzs: new Prisma.Decimal(r.dailyRate.toFixed(2)),
            earnedUzs: new Prisma.Decimal(r.earned.toFixed(2)),
            employerCostUzs: new Prisma.Decimal(r.employerCost.toFixed(2)),
            allocatedUzs: new Prisma.Decimal(r.allocated.toFixed(2)),
            unallocatedUzs: new Prisma.Decimal(r.unallocated.toFixed(2)),
          },
        });
      }
      await tx.overheadExpense.deleteMany({ where: { companyId: user.companyId, payrollMonthId: pm.id } });
      if (totalUnallocated > 0.5) {
        const amount = new Prisma.Decimal(totalUnallocated.toFixed(2));
        await tx.overheadExpense.create({
          data: {
            companyId: user.companyId,
            legalEntityId: entity?.id,
            category: "PAYROLL_UNALLOCATED",
            date: to,
            description: `Ish haqi: obyektlarga taqsimlanmagan qism (${month})`,
            source: "PAYROLL",
            payrollMonthId: pm.id,
            amount,
            currency: "UZS",
            fxRate: new Prisma.Decimal(1),
            fxDate: to,
            fxSource: "PAYROLL",
            amountUzs: amount,
            amountUsd: new Prisma.Decimal(0),
            approval: "APPROVED",
            createdById: user.id,
          },
        });
      }
      await audit(tx, ctx(user), "PayrollMonth", pm.id, "update", existing, { month, status: "CLOSED", unallocated: totalUnallocated });
    });
  });
  if (res?.ok) revalidatePath("/employees");
  return res;
}

export async function reopenPayrollMonth(formData: FormData) {
  await runAction("payroll.manage", async (user) => {
    const month = String(formData.get("month"));
    const pm = await db.payrollMonth.findUnique({ where: { companyId_month: { companyId: user.companyId, month } } });
    if (!pm) return;
    await db.$transaction(async (tx) => {
      await tx.overheadExpense.deleteMany({ where: { companyId: user.companyId, payrollMonthId: pm.id } });
      await tx.payrollMonth.update({ where: { id: pm.id }, data: { status: "OPEN" } });
      await audit(tx, ctx(user), "PayrollMonth", pm.id, "update", { status: "CLOSED" }, { status: "OPEN" });
    });
  });
  revalidatePath("/employees");
}

