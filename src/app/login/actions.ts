"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

export async function login(_: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await db.user.findFirst({ where: { email, active: true } });
  // Compare even when the user is missing to keep timing uniform.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  if (!user || !ok) return { error: "invalid" };

  const token = await signSession({ userId: user.id, companyId: user.companyId, role: user.role });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions);
  if (isLocale(user.locale)) jar.set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 31536000 });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 31536000 });
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
}
