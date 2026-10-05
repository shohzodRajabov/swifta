import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { can, type Permission } from "./permissions";
import { SESSION_COOKIE, verifySession } from "./session";

/** Current user with resolved permissions (re-read from DB so role/permission changes apply immediately). */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  const load = (id: string) =>
    db.user.findUnique({
      where: { id },
      include: { roleDef: true, company: { select: { id: true, name: true, isDemo: true, require2faForAdmins: true } }, employee: { select: { id: true } } },
    });
  const user = await load(session.userId);
  if (!user && session.homeUserId) {
    // The demo workspace was rebuilt while being viewed: fall back to the user's own account.
    const home = await load(session.homeUserId);
    if (!home || !home.active || home.company.isDemo || home.sessionVersion !== (session.hsv ?? 0)) return null;
    return { ...home, perms: home.roleDef?.permissions ?? [], homeUserId: null };
  }
  if (!user || !user.active || user.companyId !== session.companyId) return null;
  if (user.sessionVersion !== (session.sv ?? 0)) return null; // signed out everywhere / password changed
  return { ...user, perms: user.roleDef?.permissions ?? [], homeUserId: session.homeUserId ?? null };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/set-password");
  // X9: the company may require administrators to sign in with a second factor.
  if (user.company.require2faForAdmins && !user.totpEnabled && can(user, "settings.manage") && !user.homeUserId) redirect("/security");
  return user;
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/forbidden");
  return user;
}

export async function requireAnyPermission(...permissions: Permission[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!permissions.some((p) => can(user, p))) redirect("/forbidden");
  return user;
}
