import "server-only";
import type { Prisma } from "@prisma/client";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";
import { projectWhere } from "@/server/projects/access";

/** Conditions that make a task "mine" (performer directly / through a group, recorder, responsible, inspector, approver). */
export function myTaskConditions(user: CurrentUser): Prisma.TaskWhereInput[] {
  const empId = user.employee?.id;
  const today = new Date();
  const list: Prisma.TaskWhereInput[] = [
    { responsibleId: user.id },
    { inspectorId: user.id },
    { approverId: user.id },
    { recorderUserIds: { has: user.id } },
  ];
  if (empId)
    list.push({
      assignments: {
        some: {
          OR: [
            { employeeId: empId },
            { group: { members: { some: { employeeId: empId, fromDate: { lte: today }, OR: [{ toDate: null }, { toDate: { gte: today } }] } } } },
          ],
        },
      },
    });
  return list;
}

/**
 * Tasks visible to the user: all with `tasks.viewAll`; tasks of accessible projects for task managers;
 * otherwise only the user's own tasks.
 */
export function taskWhere(user: CurrentUser): Prisma.TaskWhereInput {
  if (can(user, "tasks.viewAll") || can(user, "projects.viewAll")) return { companyId: user.companyId };
  if (can(user, "tasks.manage") || can(user, "inspections.perform")) return { companyId: user.companyId, project: projectWhere(user) };
  return { companyId: user.companyId, OR: myTaskConditions(user) };
}
