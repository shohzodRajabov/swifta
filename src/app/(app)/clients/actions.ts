"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, formObject, runAction, zOptText, zText, type ActionState } from "@/lib/action";

const schema = z.object({
  name: zText,
  type: z.enum(["COMPANY", "GOVERNMENT", "INDIVIDUAL", "CONTRACTOR"]),
  contactPerson: zOptText,
  phone: zOptText,
  email: zOptText,
  address: zOptText,
  tin: zOptText,
  bankDetails: zOptText,
  note: zOptText,
});

export async function createClient(_: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction("clients.edit", async (user) => {
    const data = schema.parse(formObject(formData));
    const ctx = { companyId: user.companyId, userId: user.id };
    const client = await db.$transaction(async (tx) => {
      const c = await tx.client.create({ data: { ...data, companyId: user.companyId } });
      await audit(tx, ctx, "Client", c.id, "create", null, c);
      return c;
    });
    id = client.id;
  });
  if (res?.ok) redirect(`/clients/${id}`);
  return res;
}

export async function updateClient(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("clients.edit", async (user) => {
    const data = schema.parse(formObject(formData));
    const ctx = { companyId: user.companyId, userId: user.id };
    await db.$transaction(async (tx) => {
      const before = await tx.client.findFirst({ where: { id, companyId: user.companyId } });
      if (!before) fail("invalid");
      const after = await tx.client.update({ where: { id }, data });
      await audit(tx, ctx, "Client", id, "update", before, after);
    });
  });
  if (res?.ok) {
    revalidatePath(`/clients/${id}`);
    redirect(`/clients/${id}`);
  }
  return res;
}
