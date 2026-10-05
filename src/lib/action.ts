import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "./auth";
import { can, type Permission } from "./permissions";

/** Result of a form server action; `error` is a key in the `errors` message namespace. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  /** Interpolation values for the error message. */
  errorParams?: Record<string, string>;
  at?: number;
  data?: Record<string, string>;
} | null;

export class ActionError extends Error {
  constructor(
    key: string,
    public params?: Record<string, string>,
  ) {
    super(key);
  }
}

export function fail(key: string, params?: Record<string, string>): never {
  throw new ActionError(key, params);
}

/**
 * Wraps a server action: authenticates, checks the permission, maps known errors to message keys.
 */
export async function runAction(
  permission: Permission | Permission[],
  fn: (user: CurrentUser) => Promise<void | Record<string, string>>,
): Promise<ActionState> {
  const user = await getCurrentUser();
  const allowed = Array.isArray(permission) ? permission.some((p) => can(user, p)) : can(user, permission);
  if (!user || !allowed) return { error: "forbidden" };
  try {
    const data = await fn(user);
    return { ok: true, at: Date.now(), ...(data ? { data } : {}) };
  } catch (e) {
    if (e instanceof ActionError) return { error: e.message, errorParams: e.params };
    if (e instanceof z.ZodError) return { error: "invalid" };
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { error: "duplicate" };
      if (e.code === "P2003" || e.code === "P2014") return { error: "inUse" };
    }
    if (e instanceof Error && e.message.includes("kurs")) return { error: "fx" };
    // Let Next.js redirects/notFound propagate.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { error: "unknown" };
  }
}

// ---- form parsing helpers --------------------------------------------------

/** Missing fields and empty strings both mean "not given". */
const emptyToNull = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);

export const zText = z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1));
export const zOptText = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null),
  z.string().nullable(),
);
export const zNumber = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : v),
  z.number().finite(),
);
export const zPositive = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.replace(/\s/g, "").replace(",", ".")) : v),
  z.number().finite().positive(),
);
export const zOptNumber = z.preprocess(
  (v) => {
    const x = emptyToNull(v);
    return typeof x === "string" ? Number(x.replace(/\s/g, "").replace(",", ".")) : x;
  },
  z.number().finite().nullable(),
);
export const zDate = z.preprocess((v) => (typeof v === "string" && v ? new Date(v) : v), z.date());
export const zOptDate = z.preprocess(
  (v) => (typeof v === "string" && v ? new Date(v) : null),
  z.date().nullable(),
);
export const zOptId = z.preprocess(emptyToNull, z.string().nullable());
/** VAT percent (0 = no VAT). */
export const zVat = z.preprocess(
  (v) => (v === undefined || v === null || v === "" ? 0 : Number(String(v).replace(",", "."))),
  z.number().min(0).max(100),
);

export function formObject(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}
