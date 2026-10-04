import "server-only";
import { db } from "@/lib/db";

/** Select options used by task forms. */
export async function taskFormOptions(companyId: string, projectId: string | null) {
  const [workTypes, locations, parents, users, employees, groups] = await Promise.all([
    db.workType.findMany({ where: { companyId, active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, unit: true } }),
    projectId ? db.projectLocation.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }) : [],
    projectId
      ? db.task.findMany({ where: { projectId, parentId: null, status: { not: "CANCELLED" } }, orderBy: { number: "asc" }, select: { id: true, title: true, number: true } })
      : [],
    db.user.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.employee.findMany({ where: { companyId, active: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    db.workGroup.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    workTypes,
    locations,
    parents: parents.map((p) => ({ id: p.id, name: p.title, number: p.number })),
    users,
    employees: employees.map((e) => ({ id: e.id, name: e.fullName })),
    groups,
  };
}
