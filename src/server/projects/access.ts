import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";
import { fail } from "@/lib/action";

/**
 * Projects visible to the user: everything with `projects.viewAll`, otherwise only projects where the user
 * is a responsible person or takes part in a task (directly or through a group).
 */
export function projectWhere(user: CurrentUser): Prisma.ProjectWhereInput {
  if (can(user, "projects.viewAll")) return { companyId: user.companyId };
  const empId = user.employee?.id;
  const taskConditions: Prisma.TaskWhereInput[] = [
    { responsibleId: user.id },
    { inspectorId: user.id },
    { approverId: user.id },
    { recorderUserIds: { has: user.id } },
  ];
  if (empId) {
    taskConditions.push({
      assignments: {
        some: {
          OR: [{ employeeId: empId }, { group: { members: { some: { employeeId: empId, toDate: null } } } }],
        },
      },
    });
  }
  return {
    companyId: user.companyId,
    OR: [
      { managerId: user.id },
      { engineerId: user.id },
      { chiefEngineerId: user.id },
      { foremanId: user.id },
      { tasks: { some: { OR: taskConditions } } },
    ],
  };
}

/** Loads a project the user may access, or fails with `forbidden`. */
export async function accessibleProject(user: CurrentUser, id: string) {
  const project = await db.project.findFirst({ where: { AND: [{ id }, projectWhere(user)] } });
  if (!project) fail("forbidden");
  return project;
}
