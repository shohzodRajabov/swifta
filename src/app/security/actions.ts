"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { openSecret, sealSecret } from "@/lib/crypto-box";
import { newTotpSecret, verifyTotp } from "@/lib/totp";
import { lockedUntil, registerFailure, registerSuccess, throttleKeys } from "@/server/auth/throttle";

async function me() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.homeUserId) redirect("/"); // not inside the demo workspace
  return user;
}

/** Starts enrolment: a fresh secret is stored (encrypted) but not active until a code confirms it. */
export async function startTotp() {
  const user = await me();
  if (user.totpEnabled) return;
  await db.user.update({ where: { id: user.id }, data: { totpSecret: sealSecret(newTotpSecret()), totpEnabled: false } });
  revalidatePath("/security");
}

async function checkCode(userId: string, secret: string | null, code: string) {
  const keys = throttleKeys(`2fa:${userId}`, null);
  if (await lockedUntil(keys)) return "locked" as const;
  if (!secret || !verifyTotp(openSecret(secret)!, code)) {
    await registerFailure(keys);
    return "code" as const;
  }
  await registerSuccess(keys);
  return null;
}

export async function confirmTotp(_: unknown, formData: FormData) {
  const user = await me();
  const err = await checkCode(user.id, user.totpSecret, String(formData.get("code") ?? ""));
  if (err) return { error: err };
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    await audit(tx, { companyId: user.companyId, userId: user.id }, "User", user.id, "update", null, { twoFactor: "on" });
  });
  redirect("/security?ok=1");
}

export async function disableTotp(_: unknown, formData: FormData) {
  const user = await me();
  if (user.company.require2faForAdmins && user.perms.includes("settings.manage")) return { error: "required" };
  const err = await checkCode(user.id, user.totpSecret, String(formData.get("code") ?? ""));
  if (err) return { error: err };
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
    await audit(tx, { companyId: user.companyId, userId: user.id }, "User", user.id, "update", null, { twoFactor: "off" });
  });
  redirect("/security");
}
