import "server-only";
import type { Prisma } from "@prisma/client";
import { stripSecrets } from "./audit-mask";

type Tx = Prisma.TransactionClient;

function plain(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return stripSecrets(JSON.parse(JSON.stringify(value))) as Prisma.InputJsonValue;
}

/** Record a change to an important entity. Call inside the same transaction as the change. */
export async function audit(
  tx: Tx,
  ctx: { companyId: string; userId: string },
  entity: string,
  entityId: string,
  action: "create" | "update" | "delete",
  before?: unknown,
  after?: unknown,
) {
  await tx.auditLog.create({
    data: {
      companyId: ctx.companyId,
      userId: ctx.userId,
      entity,
      entityId,
      action,
      before: plain(before),
      after: plain(after),
    },
  });
}
