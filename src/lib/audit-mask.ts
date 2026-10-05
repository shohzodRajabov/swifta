import { can, type HasPermissions } from "./permissions";

/** Never stored in the audit log at all. */
export const AUDIT_SECRET_KEYS = ["passwordHash", "totpSecret", "telegramBotToken", "aiApiKey"];
const SALARY_KEYS = ["salary", "hourlyCostUzs", "hourlyRate", "laborCostUzs", "laborCostUsd"];
const PASSPORT_KEYS = ["passportNumber"];

function walk(value: unknown, hide: Set<string>, mark: string | undefined): unknown {
  if (Array.isArray(value)) return value.map((v) => walk(v, hide, mark));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (hide.has(k)) {
      if (mark !== undefined && v !== null && v !== undefined) out[k] = mark;
      continue;
    }
    out[k] = walk(v, hide, mark);
  }
  return out;
}

/** Strips secrets before a value is written to the audit log. */
export function stripSecrets(value: unknown) {
  return walk(value, new Set(AUDIT_SECRET_KEYS), undefined);
}

/** Masks salary and passport fields for viewers without the matching permission (X9). */
export function maskForViewer(value: unknown, viewer: HasPermissions) {
  const hide = new Set<string>(AUDIT_SECRET_KEYS);
  if (!can(viewer, "salaries.view")) SALARY_KEYS.forEach((k) => hide.add(k));
  if (!can(viewer, "employees.edit")) PASSPORT_KEYS.forEach((k) => hide.add(k));
  return walk(value, hide, "•••");
}
