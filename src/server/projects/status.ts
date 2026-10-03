import "server-only";
import { cache } from "react";
import type { DocumentCategory } from "@prisma/client";
import { db } from "@/lib/db";

/** Status groups A–H with their sub-statuses, ordered. */
export const getStatusCatalog = cache(async (companyId: string) => {
  return db.statusGroup.findMany({
    where: { companyId },
    orderBy: { sortOrder: "asc" },
    include: { statuses: { orderBy: { sortOrder: "asc" } } },
  });
});

export type StatusCatalog = Awaited<ReturnType<typeof getStatusCatalog>>;

/** Required document categories of a status that the project does not have yet. */
export async function missingDocuments(projectId: string, required: DocumentCategory[]): Promise<DocumentCategory[]> {
  if (required.length === 0) return [];
  const present = await db.document.findMany({
    where: { projectId, category: { in: required }, versions: { some: {} } },
    select: { category: true },
    distinct: ["category"],
  });
  return required.filter((c) => !present.some((p) => p.category === c));
}
