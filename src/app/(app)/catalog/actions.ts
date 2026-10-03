"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fail, formObject, runAction, zNumber, zOptText, zText, type ActionState } from "@/lib/action";

const zMoney = zNumber.pipe(z.number().min(0));

const schema = z.object({
  sku: zText,
  name: zText,
  manufacturer: zOptText,
  model: zOptText,
  categoryId: zText,
  unit: zText,
  purchasePrice: zMoney,
  purchaseCurrency: z.enum(["UZS", "USD"]),
  salePrice: zMoney,
  saleCurrency: z.enum(["UZS", "USD"]),
  supplier: zOptText,
  minStock: zMoney,
  description: zOptText,
  active: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function saveProduct(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("catalog.edit", async (user) => {
    const data = schema.parse({ active: "on", ...formObject(formData), ...(id ? { active: formData.get("active") ?? "" } : {}) });
    const cat = await db.productCategory.findFirst({ where: { id: data.categoryId, companyId: user.companyId } });
    if (!cat) fail("required");
    const ctx = { companyId: user.companyId, userId: user.id };
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.product.findFirst({ where: { id, companyId: user.companyId } });
        if (!before) fail("invalid");
        const after = await tx.product.update({ where: { id }, data });
        await audit(tx, ctx, "Product", id, "update", before, after);
      } else {
        const p = await tx.product.create({ data: { ...data, companyId: user.companyId } });
        await audit(tx, ctx, "Product", p.id, "create", null, p);
      }
    });
  });
  if (res?.ok) {
    revalidatePath("/catalog");
    redirect("/catalog");
  }
  return res;
}
