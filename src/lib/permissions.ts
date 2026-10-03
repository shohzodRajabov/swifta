import type { Role } from "@prisma/client";

export const PERMISSIONS = [
  "dashboard.view",
  "finance.view", // money: costs, profit, debts
  "projects.view",
  "projects.edit",
  "projects.stage",
  "clients.view",
  "clients.edit",
  "catalog.view",
  "catalog.edit",
  "bom.edit",
  "budget.edit",
  "payments.edit",
  "expenses.edit",
  "users.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  ADMIN: ALL,
  PROJECT_MANAGER: new Set([
    "dashboard.view",
    "finance.view",
    "projects.view",
    "projects.edit",
    "projects.stage",
    "clients.view",
    "catalog.view",
    "bom.edit",
    "budget.edit",
    "expenses.edit",
  ]),
  SALES: new Set([
    "dashboard.view",
    "projects.view",
    "projects.edit",
    "projects.stage",
    "clients.view",
    "clients.edit",
    "catalog.view",
    "payments.edit",
  ]),
  ENGINEER: new Set(["projects.view", "clients.view", "catalog.view", "catalog.edit", "bom.edit"]),
  WAREHOUSE: new Set(["projects.view", "catalog.view", "catalog.edit"]),
  ACCOUNTANT: new Set([
    "dashboard.view",
    "finance.view",
    "projects.view",
    "clients.view",
    "catalog.view",
    "payments.edit",
    "expenses.edit",
    "budget.edit",
  ]),
  TECHNICIAN: new Set(["projects.view", "catalog.view"]),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export const ROLES: Role[] = [
  "ADMIN",
  "PROJECT_MANAGER",
  "SALES",
  "ENGINEER",
  "WAREHOUSE",
  "ACCOUNTANT",
  "TECHNICIAN",
];
