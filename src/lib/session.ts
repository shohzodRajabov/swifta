import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "swifta_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

/**
 * `homeUserId` is set while an admin is viewing the demo workspace (to switch back).
 * `sv` / `hsv` are the users' session versions at sign-in: a password change or "sign out everywhere"
 * bumps the version and every older token stops working.
 */
export type SessionPayload = { userId: string; companyId: string; homeUserId?: string | null; sv?: number; hsv?: number };

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};
