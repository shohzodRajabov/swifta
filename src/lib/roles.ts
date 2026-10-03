import type { RoleDef } from "@prisma/client";

type T = (key: string) => string;

/** Display name of a role: built-in roles are translated, custom roles use their stored name. */
export function roleLabel(t: T, role: Pick<RoleDef, "key" | "name"> | null | undefined): string {
  if (!role) return "—";
  return role.key ? t(`roles.${role.key}`) : role.name;
}
