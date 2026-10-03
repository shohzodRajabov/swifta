import "server-only";
import { db } from "@/lib/db";

/** Default VAT rate for documents of a project: the legal entity's VAT under the general regime, else 0. */
export async function projectVatRate(projectId: string): Promise<number> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { legalEntity: { select: { taxRegime: true, vatRate: true } } },
  });
  if (!p?.legalEntity) return 0;
  return p.legalEntity.taxRegime === "GENERAL" ? Number(p.legalEntity.vatRate) : 0;
}
