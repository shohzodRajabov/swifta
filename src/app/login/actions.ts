"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { PENDING_2FA_COOKIE, SESSION_COOKIE, sessionCookieOptions, signPending2fa, signSession, verifyPending2fa, verifySession } from "@/lib/session";
import { openSecret } from "@/lib/crypto-box";
import { verifyTotp } from "@/lib/totp";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { lockedUntil, registerFailure, registerSuccess, throttleKeys } from "@/server/auth/throttle";

const DUMMY_HASH = "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";

/** Login with phone number or email. Demo workspaces are never entered directly. */
export async function login(_: unknown, formData: FormData) {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Brute-force protection: limited failures per identifier and per IP, then a temporary lock.
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const keys = throttleKeys(identifier, ip);
  const locked = await lockedUntil(keys);
  if (locked) return { error: "locked", minutes: Math.max(1, Math.ceil((locked.getTime() - Date.now()) / 60000)) };
  const phone = identifier.includes("@") ? null : normalizePhone(identifier);
  const email = identifier.includes("@") ? identifier.toLowerCase() : null;
  const user =
    phone || email
      ? await db.user.findFirst({
          where: { active: true, company: { isDemo: false }, ...(phone ? { phone } : { email }) },
        })
      : null;
  // Compare even when the user is missing to keep timing uniform.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await registerFailure(keys);
    return { error: "invalid" };
  }
  await registerSuccess(keys);
  if (user.mustChangePassword && user.otpExpiresAt && user.otpExpiresAt < new Date()) return { error: "otpExpired" };

  // Second factor (X9): the session is issued only after the authenticator code.
  if (user.totpEnabled && user.totpSecret) {
    (await cookies()).set(PENDING_2FA_COOKIE, await signPending2fa({ userId: user.id, sv: user.sessionVersion }), { ...sessionCookieOptions, maxAge: 300 });
    redirect("/login/verify");
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = await signSession({ userId: user.id, companyId: user.companyId, sv: user.sessionVersion });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions);
  if (isLocale(user.locale)) jar.set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 31536000 });
  redirect(user.mustChangePassword ? "/set-password" : "/");
}

const passwordSchema = z
  .object({ password: z.string().min(8), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

/**
 * The user chooses their own password: after a one-time password (no current password needed) or as a
 * voluntary change (the current password is required). Other sessions are signed out.
 */
export async function setOwnPassword(_: unknown, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.path[0] === "confirm" ? "mismatch" : "short" };
  if (!user.mustChangePassword) {
    const current = String(formData.get("current") ?? "");
    if (!(await bcrypt.compare(current, user.passwordHash))) return { error: "current" };
  }
  if (await bcrypt.compare(parsed.data.password, user.passwordHash)) return { error: "same" };
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10), mustChangePassword: false, otpExpiresAt: null, sessionVersion: { increment: 1 } },
  });
  // Keep this browser signed in with the new version; every other session is invalidated.
  (await cookies()).set(SESSION_COOKIE, await signSession({ userId: updated.id, companyId: updated.companyId, sv: updated.sessionVersion }), sessionCookieOptions);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/** Sign out on every device (e.g. a lost phone): bump the session version. */
export async function logoutEverywhere() {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session) await db.user.update({ where: { id: session.homeUserId ?? session.userId }, data: { sessionVersion: { increment: 1 } } }).catch(() => undefined);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 31536000 });
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session) await db.user.update({ where: { id: session.userId }, data: { locale } }).catch(() => undefined);
}

/** Second step of sign-in: the 6-digit code from the authenticator app (throttled like passwords). */
export async function verifySecondFactor(_: unknown, formData: FormData) {
  const jar = await cookies();
  const pending = await verifyPending2fa(jar.get(PENDING_2FA_COOKIE)?.value);
  if (!pending) redirect("/login");
  const keys = throttleKeys(`2fa:${pending.userId}`, null);
  const locked = await lockedUntil(keys);
  if (locked) return { error: "locked", minutes: Math.max(1, Math.ceil((locked.getTime() - Date.now()) / 60000)) };
  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.active || user.sessionVersion !== pending.sv || !user.totpSecret) redirect("/login");
  if (!verifyTotp(openSecret(user.totpSecret)!, String(formData.get("code") ?? ""))) {
    await registerFailure(keys);
    return { error: "code" };
  }
  await registerSuccess(keys);
  jar.delete(PENDING_2FA_COOKIE);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  jar.set(SESSION_COOKIE, await signSession({ userId: user.id, companyId: user.companyId, sv: user.sessionVersion }), sessionCookieOptions);
  if (isLocale(user.locale)) jar.set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 31536000 });
  redirect("/");
}
