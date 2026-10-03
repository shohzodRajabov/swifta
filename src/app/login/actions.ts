"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { SESSION_COOKIE, sessionCookieOptions, signSession, verifySession } from "@/lib/session";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

const DUMMY_HASH = "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";

/** Login with phone number or email. Demo workspaces are never entered directly. */
export async function login(_: unknown, formData: FormData) {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
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
  if (!user || !ok) return { error: "invalid" };

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = await signSession({ userId: user.id, companyId: user.companyId });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions);
  if (isLocale(user.locale)) jar.set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 31536000 });
  redirect(user.mustChangePassword ? "/set-password" : "/");
}

const passwordSchema = z
  .object({ password: z.string().min(8), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

/** First login after a one-time password (or a voluntary change): the user chooses their own password. */
export async function setOwnPassword(_: unknown, formData: FormData) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.path[0] === "confirm" ? "mismatch" : "short" };
  await db.user.update({
    where: { id: session.userId },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10), mustChangePassword: false },
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 31536000 });
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (session) await db.user.update({ where: { id: session.userId }, data: { locale } }).catch(() => undefined);
}
