"use server";

import { revalidatePath } from "next/cache";
import { fail, runAction, type ActionState } from "@/lib/action";
import { runBackup } from "@/server/backup";

export async function backupNow(_: ActionState): Promise<ActionState> {
  const res = await runAction("backups.manage", async (user) => {
    const r = await runBackup("MANUAL", user.id);
    if (!r.ok) fail("backupFailed", { message: r.error });
  });
  revalidatePath("/settings/backups");
  return res;
}
