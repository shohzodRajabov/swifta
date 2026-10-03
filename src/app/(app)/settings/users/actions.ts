"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ROLES } from "@/lib/permissions";
import { fail, formObject, runAction, zOptText, zText, type ActionState } from "@/lib/action";

const zRole = z.enum(ROLES as [string, ...string[]]);

export async function createUser(_: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("users.manage", async (user) => {
    const data = z
      .object({
        name: zText,
        email: zText.pipe(z.string().email()),
        role: zRole,
        position: zOptText,
        phone: zOptText,
        password: z.string().min(8),
      })
      .parse(formObject(formData));
    const created = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          companyId: user.companyId,
          name: data.name,
          email: data.email.toLowerCase(),
          role: data.role as (typeof ROLES)[number],
          position: data.position,
          phone: data.phone,
          passwordHash: await bcrypt.hash(data.password, 10),
        },
      });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "User", u.id, "create", null, u);
      return u;
    });
    void created;
  });
  if (res?.ok) revalidatePath("/settings/users");
  return res;
}

export async function updateUser(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("users.manage", async (user) => {
    const data = z
      .object({
        role: zRole,
        active: z.preprocess((v) => v === "on", z.boolean()),
        password: z.preprocess((v) => (v === "" ? null : v), z.string().min(8).nullable()),
      })
      .parse({ active: formData.get("active") ?? "", ...formObject(formData) });
    const before = await db.user.findFirst({ where: { id, companyId: user.companyId } });
    if (!before) fail("invalid");
    // An admin cannot lock themselves out.
    if (id === user.id && (!data.active || data.role !== "ADMIN")) fail("forbidden");
    await db.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id },
        data: {
          role: data.role as (typeof ROLES)[number],
          active: data.active,
          ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 10) } : {}),
        },
      });
      await audit(
        tx,
        { companyId: user.companyId, userId: user.id },
        "User",
        id,
        "update",
        { role: before.role, active: before.active },
        { role: after.role, active: after.active, ...(data.password ? { password: "changed" } : {}) },
      );
    });
  });
  if (res?.ok) revalidatePath("/settings/users");
  return res;
}
