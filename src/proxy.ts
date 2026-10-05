import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Optimistic check only; pages re-validate the user against the database.
export async function proxy(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Upload/download routes authenticate themselves (and must not be buffered by the proxy).
  matcher: ["/((?!login|api/health|api/upload|api/files|api/backups|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|mjs)$).*)"],
};
