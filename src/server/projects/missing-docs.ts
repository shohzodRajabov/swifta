import "server-only";
import type { DocumentCategory } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Documents a project should already have: everything required by statuses up to (and including) its current
 * status. Catches projects that reached a status before the requirement existed.
 */
export async function missingDocsByProject(companyId: string, projectIds: string[]): Promise<Map<string, DocumentCategory[]>> {
  const out = new Map<string, DocumentCategory[]>();
  if (projectIds.length === 0) return out;
  const [groups, projects, docs] = await Promise.all([
    db.statusGroup.findMany({ where: { companyId }, orderBy: { sortOrder: "asc" }, include: { statuses: { orderBy: { sortOrder: "asc" } } } }),
    db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, statusId: true } }),
    db.document.findMany({
      where: { projectId: { in: projectIds }, versions: { some: {} } },
      select: { projectId: true, category: true },
    }),
  ]);
  const flat = groups.flatMap((g) => g.statuses);
  for (const p of projects) {
    const idx = flat.findIndex((s) => s.id === p.statusId);
    if (idx < 0) continue;
    const required = new Set(flat.slice(0, idx + 1).flatMap((s) => s.requiredDocs));
    const have = new Set(docs.filter((d) => d.projectId === p.id).map((d) => d.category));
    const missing = [...required].filter((c) => !have.has(c));
    if (missing.length) out.set(p.id, missing);
  }
  return out;
}
