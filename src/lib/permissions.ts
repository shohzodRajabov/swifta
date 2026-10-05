// Permission catalog and built-in roles. Roles themselves live in the database (RoleDef) and are
// edited by the admin; the lists below are only the defaults for newly created companies.

export const PERMISSION_GROUPS = {
  general: ["dashboard.view", "reports.view", "notifications.view"],
  projects: [
    "projects.view",
    "projects.viewAll",
    "projects.edit",
    "projects.status",
    "documents.view",
    "documents.edit",
    "drawings.edit",
  ],
  crm: ["clients.view", "clients.edit"],
  estimate: ["catalog.view", "catalog.edit", "bom.edit", "import.manage", "import.approve"],
  finance: [
    "finance.view",
    "budget.edit",
    "acts.edit",
    "payments.edit",
    "expenses.edit",
    "overhead.view",
    "overhead.edit",
    "finance.approve",
    "salaries.view",
    "payroll.manage",
  ],
  supply: [
    "suppliers.view",
    "suppliers.edit",
    "supplierPayments.edit",
    "procurement.view",
    "procurement.edit",
    "warehouse.view",
    "warehouse.edit",
    "materials.consume",
  ],
  workforce: [
    "worker.self",
    "employees.view",
    "employees.edit",
    "groups.manage",
    "tasks.view",
    "tasks.viewAll",
    "tasks.manage",
    "sessions.record",
    "sessions.approve",
    "inspections.perform",
    "remarks.create",
    "remarks.manage",
    "attendance.manage",
  ],
  contractors: ["contractors.view", "contractors.edit", "contractorPayments.edit", "outsource.verify"],
  kpi: ["kpi.self", "kpi.view", "kpi.manage"],
  service: ["service.view", "service.edit"],
  admin: ["users.manage", "roles.manage", "settings.manage", "audit.view", "backups.manage", "demo.access"],
} as const;

export type PermissionGroup = keyof typeof PERMISSION_GROUPS;
export type Permission = (typeof PERMISSION_GROUPS)[PermissionGroup][number];
export const PERMISSIONS: Permission[] = Object.values(PERMISSION_GROUPS).flat() as Permission[];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as string[]).includes(value);
}

/** Anything with a permission list (CurrentUser, client-side props, ...). */
export type HasPermissions = { perms: readonly string[] };

export function can(user: HasPermissions | null | undefined, permission: Permission): boolean {
  return !!user && user.perms.includes(permission);
}

const ALL = PERMISSIONS;
const without = (...exclude: Permission[]) => ALL.filter((p) => !exclude.includes(p));

export type SystemRoleKey =
  | "ADMIN"
  | "DIRECTOR"
  | "PROJECT_MANAGER"
  | "CHIEF_ENGINEER"
  | "FOREMAN"
  | "GROUP_LEADER"
  | "INSPECTOR"
  | "WORKER"
  | "SALES"
  | "ENGINEER"
  | "WAREHOUSE"
  | "ACCOUNTANT";

/** Default permissions of built-in roles. Names are translated via `roles.<KEY>`. */
export const SYSTEM_ROLES: { key: SystemRoleKey; name: string; permissions: Permission[] }[] = [
  { key: "ADMIN", name: "Administrator", permissions: ALL },
  {
    key: "DIRECTOR",
    name: "Direktor",
    permissions: without("users.manage", "roles.manage", "settings.manage", "backups.manage"),
  },
  {
    key: "PROJECT_MANAGER",
    name: "Loyiha rahbari",
    permissions: [
      "dashboard.view",
      "reports.view",
      "notifications.view",
      "projects.view",
      "projects.edit",
      "projects.status",
      "documents.view",
      "documents.edit",
      "drawings.edit",
      "clients.view",
      "catalog.view",
      "bom.edit",
      "import.manage",
      "finance.view",
      "budget.edit",
      "acts.edit",
      "expenses.edit",
      "suppliers.view",
      "procurement.view",
      "procurement.edit",
      "warehouse.view",
      "materials.consume",
      "worker.self",
      "employees.view",
      "groups.manage",
      "tasks.view",
      "tasks.manage",
      "sessions.record",
      "sessions.approve",
      "inspections.perform",
      "remarks.create",
      "remarks.manage",
      "attendance.manage",
      "contractors.view",
      "contractors.edit",
      "outsource.verify",
      "kpi.self",
      "kpi.view",
      "service.view",
      "service.edit",
    ],
  },
  {
    key: "CHIEF_ENGINEER",
    name: "Bosh muhandis",
    permissions: [
      "dashboard.view",
      "reports.view",
      "notifications.view",
      "projects.view",
      "projects.viewAll",
      "projects.status",
      "documents.view",
      "documents.edit",
      "drawings.edit",
      "clients.view",
      "catalog.view",
      "catalog.edit",
      "bom.edit",
      "import.manage",
      "suppliers.view",
      "procurement.view",
      "warehouse.view",
      "worker.self",
      "employees.view",
      "tasks.view",
      "tasks.viewAll",
      "tasks.manage",
      "sessions.approve",
      "inspections.perform",
      "remarks.create",
      "remarks.manage",
      "contractors.view",
      "outsource.verify",
      "kpi.self",
      "kpi.view",
      "service.view",
      "service.edit",
    ],
  },
  {
    key: "FOREMAN",
    name: "Prorab",
    permissions: [
      "dashboard.view",
      "notifications.view",
      "projects.view",
      "documents.view",
      "documents.edit",
      "warehouse.view",
      "materials.consume",
      "worker.self",
      "employees.view",
      "groups.manage",
      "tasks.view",
      "tasks.manage",
      "sessions.record",
      "sessions.approve",
      "inspections.perform",
      "remarks.create",
      "remarks.manage",
      "attendance.manage",
      "contractors.view",
      "outsource.verify",
      "kpi.self",
      "service.view",
      "service.edit",
    ],
  },
  {
    key: "GROUP_LEADER",
    name: "Guruh lideri",
    permissions: [
      "notifications.view",
      "projects.view",
      "documents.view",
      "materials.consume",
      "worker.self",
      "tasks.view",
      "sessions.record",
      "remarks.create",
      "attendance.manage",
      "kpi.self",
    ],
  },
  {
    key: "INSPECTOR",
    name: "Inspektor",
    permissions: [
      "notifications.view",
      "projects.view",
      "documents.view",
      "tasks.view",
      "inspections.perform",
      "remarks.create",
      "remarks.manage",
    ],
  },
  {
    key: "WORKER",
    name: "Ishchi",
    permissions: ["projects.view", "documents.view", "worker.self", "tasks.view", "remarks.create", "kpi.self"],
  },
  {
    key: "SALES",
    name: "Sotuv menejeri",
    permissions: [
      "dashboard.view",
      "notifications.view",
      "projects.view",
      "projects.edit",
      "projects.status",
      "documents.view",
      "documents.edit",
      "clients.view",
      "clients.edit",
      "catalog.view",
      "payments.edit",
      "service.view",
    ],
  },
  {
    key: "ENGINEER",
    name: "Muhandis / Loyihachi",
    permissions: [
      "projects.view",
      "projects.viewAll",
      "documents.view",
      "documents.edit",
      "drawings.edit",
      "clients.view",
      "catalog.view",
      "catalog.edit",
      "bom.edit",
      "import.manage",
      "suppliers.view",
      "procurement.view",
      "tasks.view",
      "tasks.viewAll",
    ],
  },
  {
    key: "WAREHOUSE",
    name: "Ombor mudiri",
    permissions: [
      "notifications.view",
      "projects.view",
      "projects.viewAll",
      "documents.view",
      "catalog.view",
      "catalog.edit",
      "suppliers.view",
      "procurement.view",
      "procurement.edit",
      "warehouse.view",
      "warehouse.edit",
      "materials.consume",
    ],
  },
  {
    key: "ACCOUNTANT",
    name: "Buxgalter",
    permissions: [
      "dashboard.view",
      "reports.view",
      "notifications.view",
      "projects.view",
      "projects.viewAll",
      "documents.view",
      "documents.edit",
      "clients.view",
      "catalog.view",
      "finance.view",
      "budget.edit",
      "acts.edit",
      "payments.edit",
      "expenses.edit",
      "overhead.view",
      "overhead.edit",
      "salaries.view",
      "payroll.manage",
      "suppliers.view",
      "suppliers.edit",
      "supplierPayments.edit",
      "procurement.view",
      "warehouse.view",
      "employees.view",
      "contractors.view",
      "contractorPayments.edit",
      "service.view",
    ],
  },
];

/** Mapping of the legacy fixed enum roles to built-in role keys. */
export const LEGACY_ROLE_MAP: Record<string, SystemRoleKey> = {
  ADMIN: "ADMIN",
  PROJECT_MANAGER: "PROJECT_MANAGER",
  SALES: "SALES",
  ENGINEER: "ENGINEER",
  WAREHOUSE: "WAREHOUSE",
  ACCOUNTANT: "ACCOUNTANT",
  TECHNICIAN: "WORKER",
};
