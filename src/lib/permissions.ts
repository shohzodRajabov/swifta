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
  "suppliers.view",
  "suppliers.edit",
  "supplierPayments.edit",
  "procurement.view",
  "procurement.edit",
  "warehouse.view",
  "warehouse.edit",
  "materials.consume",
  "notifications.view",
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
    "suppliers.view",
    "procurement.view",
    "procurement.edit",
    "warehouse.view",
    "materials.consume",
    "notifications.view",
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
    "notifications.view",
  ]),
  ENGINEER: new Set([
    "projects.view",
    "clients.view",
    "catalog.view",
    "catalog.edit",
    "bom.edit",
    "suppliers.view",
    "procurement.view",
  ]),
  WAREHOUSE: new Set([
    "projects.view",
    "catalog.view",
    "catalog.edit",
    "suppliers.view",
    "procurement.view",
    "procurement.edit",
    "warehouse.view",
    "warehouse.edit",
    "materials.consume",
    "notifications.view",
  ]),
  ACCOUNTANT: new Set([
    "dashboard.view",
    "finance.view",
    "projects.view",
    "clients.view",
    "catalog.view",
    "payments.edit",
    "expenses.edit",
    "budget.edit",
    "suppliers.view",
    "suppliers.edit",
    "supplierPayments.edit",
    "procurement.view",
    "warehouse.view",
    "notifications.view",
  ]),
  TECHNICIAN: new Set(["projects.view", "catalog.view", "materials.consume"]),
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
