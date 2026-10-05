import type { ImportType } from "@/lib/bulk-import";
import type { Permission } from "@/lib/permissions";

export const IMPORT_PERMS: Record<ImportType, Permission> = {
  products: "catalog.edit",
  clients: "clients.edit",
  suppliers: "suppliers.edit",
  employees: "employees.edit",
};
