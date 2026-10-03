import { useTranslations } from "next-intl";

const HIDDEN = new Set(["id", "companyId", "createdAt", "updatedAt", "passwordHash", "projectId"]);

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const [y, m, d] = v.slice(0, 10).split("-");
    return `${d}.${m}.${y}`;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Compact list of changed fields for an audit entry. */
export function AuditDiff({ action, before, after }: { action: string; before: unknown; after: unknown }) {
  const t = useTranslations("audit");
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !HIDDEN.has(k));
  const changed =
    action === "update" ? keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k])) : keys.slice(0, 6);
  if (changed.length === 0) return <span className="text-muted">—</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {changed.slice(0, 12).map((k) => (
        <li key={k} className="break-words">
          <span className="font-medium text-muted">{k}:</span>{" "}
          {action === "update" ? (
            <>
              <span className="text-danger line-through">{show(b[k])}</span> → <span className="text-success">{show(a[k])}</span>
            </>
          ) : (
            <span>{show(action === "delete" ? b[k] : a[k])}</span>
          )}
        </li>
      ))}
      {changed.length > 12 && <li className="text-muted">… +{changed.length - 12}</li>}
      <li className="sr-only">{t("changes")}</li>
    </ul>
  );
}
