"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { runAction, type ActionState } from "@/lib/action";
import { generateDemo, findDemoCompany } from "@/server/demo/generate";
import { wipeCompany } from "@/server/demo/wipe";

/** Toggle between the real workspace and the demo workspace (same person, separate data). */
export async function switchWorkspace() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  if (user.company.isDemo) {
    const home = user.homeUserId ? await db.user.findFirst({ where: { id: user.homeUserId, active: true } }) : null;
    if (!home) redirect("/login");
    jar.set(SESSION_COOKIE, await signSession({ userId: home.id, companyId: home.companyId, sv: home.sessionVersion }), sessionCookieOptions);
    redirect("/");
  }
  if (!can(user, "demo.access")) redirect("/forbidden");
  const demo = await findDemoCompany(db);
  if (!demo) redirect("/settings/demo");
  // The visitor gets an administrator account inside the demo workspace.
  let demoUser = await db.user.findFirst({
    where: { companyId: demo.id, OR: [...(user.email ? [{ email: user.email }] : []), ...(user.phone ? [{ phone: user.phone }] : [])] },
  });
  if (!demoUser) {
    const admin = await db.roleDef.findFirstOrThrow({ where: { companyId: demo.id, key: "ADMIN" } });
    demoUser = await db.user.create({
      data: {
        companyId: demo.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        roleId: admin.id,
        locale: user.locale,
        passwordHash: await bcrypt.hash(randomBytes(16).toString("hex"), 10),
      },
    });
  }
  jar.set(SESSION_COOKIE, await signSession({ userId: demoUser.id, companyId: demo.id, homeUserId: user.id, sv: demoUser.sessionVersion, hsv: user.sessionVersion }), sessionCookieOptions);
  redirect("/");
}

export async function rebuildDemo(_: ActionState): Promise<ActionState> {
  const res = await runAction("demo.access", async (user) => {
    if (user.company.isDemo) throw new Error("not from demo");
    await generateDemo(db);
  });
  if (res?.ok) revalidatePath("/settings/demo");
  return res;
}

export async function deleteDemo() {
  await runAction("demo.access", async (user) => {
    if (user.company.isDemo) return;
    const demo = await findDemoCompany(db);
    if (demo) await wipeCompany(db, demo.id, { deleteCompany: true });
  });
  revalidatePath("/settings/demo");
}
