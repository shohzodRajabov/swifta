"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { PERMISSIONS, isPermission } from "@/lib/permissions";
import { fail, formObject, runAction, zOptId, zOptText, zText, type ActionState } from "@/lib/action";

export async function createRole(_: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction("roles.manage", async (user) => {
    const data = z.object({ name: zText, copyFrom: zOptId }).parse(formObject(formData));
    const source = data.copyFrom
      ? await db.roleDef.findFirst({ where: { id: data.copyFrom, companyId: user.companyId } })
      : null;
    const count = await db.roleDef.count({ where: { companyId: user.companyId } });
    const role = await db.$transaction(async (tx) => {
      const r = await tx.roleDef.create({
        data: {
          companyId: user.companyId,
          name: data.name,
          permissions: source?.permissions ?? [],
          sortOrder: count,
        },
      });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "Role", r.id, "create", null, r);
      return r;
    });
    id = role.id;
  });
  if (res?.ok) redirect(`/settings/roles/${id}`);
  return res;
}

export async function updateRole(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("roles.manage", async (user) => {
    const before = await db.roleDef.findFirst({ where: { id, companyId: user.companyId } });
    if (!before) fail("invalid");
    const data = z.object({ name: zText, description: zOptText }).parse(formObject(formData));
    // The administrator role always has every permission.
    const permissions =
      before.key === "ADMIN"
        ? PERMISSIONS
        : formData.getAll("perm").map(String).filter(isPermission);
    await db.$transaction(async (tx) => {
      const after = await tx.roleDef.update({
        where: { id },
        data: { name: before.isSystem ? before.name : data.name, description: data.description, permissions },
      });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "Role", id, "update", before, after);
    });
  });
  if (res?.ok) revalidatePath("/settings/roles");
  return res;
}

export async function deleteRole(formData: FormData) {
  const id = String(formData.get("id"));
  let ok = false;
  await runAction("roles.manage", async (user) => {
    const role = await db.roleDef.findFirst({
      where: { id, companyId: user.companyId },
      include: { _count: { select: { users: true } } },
    });
    if (!role || role.isSystem || role._count.users > 0) fail("inUse");
    await db.$transaction(async (tx) => {
      await tx.roleDef.delete({ where: { id } });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "Role", id, "delete", role, null);
    });
    ok = true;
  });
  if (ok) {
    revalidatePath("/settings/roles");
    redirect("/settings/roles");
  }
}
