"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { generateOneTimePassword, otpExpiry } from "@/lib/password";
import { fail, formObject, runAction, zOptText, zText, type ActionState } from "@/lib/action";
import type { CurrentUser } from "@/lib/auth";

async function ownRole(user: CurrentUser, roleId: string) {
  const role = await db.roleDef.findFirst({ where: { id: roleId, companyId: user.companyId } });
  if (!role) fail("invalid");
  return role;
}

/** Admin creates a login: phone (and/or email), role and a one-time password shown once. */
export async function createUser(_: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("users.manage", async (user) => {
    const data = z
      .object({ name: zText, phone: zOptText, email: zOptText, position: zOptText, roleId: zText, password: zOptText })
      .parse(formObject(formData));
    const phone = data.phone ? normalizePhone(data.phone) : null;
    if (data.phone && !phone) fail("phoneInvalid");
    const email = data.email?.toLowerCase() ?? null;
    if (!phone && !email) fail("required");
    await ownRole(user, data.roleId);
    const password = data.password ?? generateOneTimePassword();
    if (password.length < 8) fail("passwordShort");
    await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          companyId: user.companyId,
          name: data.name,
          phone,
          email,
          position: data.position,
          roleId: data.roleId,
          passwordHash: await bcrypt.hash(password, 10),
          mustChangePassword: true,
          otpExpiresAt: otpExpiry(),
        },
      });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "User", u.id, "create", null, {
        name: u.name,
        phone: u.phone,
        email: u.email,
        roleId: u.roleId,
      });
    });
    return { password, name: data.name };
  });
  if (res?.ok) revalidatePath("/settings/users");
  return res;
}

export async function updateUser(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("users.manage", async (user) => {
    const data = z
      .object({
        roleId: zText,
        phone: zOptText,
        email: zOptText,
        active: z.preprocess((v) => v === "on", z.boolean()),
      })
      .parse({ active: formData.get("active") ?? "", ...formObject(formData) });
    const before = await db.user.findFirst({ where: { id, companyId: user.companyId }, include: { roleDef: true } });
    if (!before) fail("invalid");
    const role = await ownRole(user, data.roleId);
    // An admin cannot lock themselves out.
    if (id === user.id && (!data.active || role.key !== "ADMIN")) fail("forbidden");
    const phone = data.phone ? normalizePhone(data.phone) : null;
    if (data.phone && !phone) fail("phoneInvalid");
    const email = data.email?.toLowerCase() ?? null;
    if (!phone && !email) fail("required");
    await db.$transaction(async (tx) => {
      const after = await tx.user.update({ where: { id }, data: { roleId: role.id, active: data.active, phone, email } });
      await audit(
        tx,
        { companyId: user.companyId, userId: user.id },
        "User",
        id,
        "update",
        { roleId: before.roleId, active: before.active, phone: before.phone, email: before.email },
        { roleId: after.roleId, active: after.active, phone: after.phone, email: after.email },
      );
    });
  });
  if (res?.ok) revalidatePath("/settings/users");
  return res;
}

/** Issue a new one-time password; the user must set their own on next login. */
export async function resetPassword(id: string, _: ActionState): Promise<ActionState> {
  const res = await runAction("users.manage", async (user) => {
    const target = await db.user.findFirst({ where: { id, companyId: user.companyId } });
    if (!target) fail("invalid");
    const password = generateOneTimePassword();
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true, otpExpiresAt: otpExpiry(), sessionVersion: { increment: 1 } },
      });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "User", id, "update", null, { password: "reset" });
    });
    return { password, name: target.name };
  });
  if (res?.ok) revalidatePath("/settings/users");
  return res;
}

/** Turns off a user's second factor (lost phone); they sign in with the password and may enrol again. */
export async function resetTwoFactor(id: string) {
  await runAction("users.manage", async (user) => {
    const target = await db.user.findFirst({ where: { id, companyId: user.companyId } });
    if (!target) fail("invalid");
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { totpEnabled: false, totpSecret: null, sessionVersion: { increment: 1 } } });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "User", id, "update", null, { twoFactor: "reset" });
    });
  });
  revalidatePath("/settings/users");
}
