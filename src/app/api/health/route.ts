import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await db.$queryRaw`SELECT 1`;
  return Response.json({ ok: true });
}
