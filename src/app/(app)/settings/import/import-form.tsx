"use client";

import { startTransition, useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import type { ImportType } from "@/lib/bulk-import";
import { Badge, Button, Card, CardHeader, Field, Select } from "@/components/ui";
import { runImport, type ImportState } from "./actions";

export function ImportForm({ types, initial, columns }: { types: ImportType[]; initial: ImportType; columns: Record<string, { key: string; required: boolean }[]> }) {
  const t = useTranslations();
  const [type, setType] = useState<ImportType>(initial);
  const [state, action, pending] = useActionState(runImport, null);
  // The chosen file is kept in state: React resets form fields after an action, but "Import" must resend it.
  const [file, setFile] = useState<File | null>(null);
  const submit = (mode: "preview" | "apply") => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const form = e.currentTarget.form!;
    const fd = new FormData(form);
    if (file) fd.set("file", file);
    fd.set("mode", mode);
    startTransition(() => action(fd));
  };
  const cols = columns[type] ?? [];
  const p = state?.preview;
  const shown = cols.slice(0, 5);
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
      <Card className="grid gap-4 p-5 sm:grid-cols-[220px_1fr_auto] sm:items-end">
        <Field label={t("bulkImport.type")}>
          <Select name="type" value={type} onChange={(e) => setType(e.target.value as ImportType)}>
            {types.map((x) => (
              <option key={x} value={x}>
                {t(`bulkImport.types.${x}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("bulkImport.file")} hint={t("bulkImport.fileHint")}>
          <input name="file" type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm" />
        </Field>
        <div className="flex gap-2">
          <a href={`/api/import-template/${type}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-2">
            <Download className="size-4" aria-hidden />
            {t("bulkImport.template")}
          </a>
          <Button type="submit" variant="secondary" disabled={pending || !file} onClick={submit("preview")}>
            {t("bulkImport.check")}
          </Button>
        </div>
        {file && <div className="text-xs text-muted sm:col-span-3">📄 {file.name}</div>}
        <div className="text-xs text-muted sm:col-span-3">
          {t("bulkImport.columns")}:{" "}
          {cols.map((c, i) => (
            <span key={c.key}>
              {i > 0 && ", "}
              <code className={c.required ? "font-semibold text-text" : ""}>{c.key}</code>
              {c.required && "*"}
            </span>
          ))}
        </div>
      </Card>

      {state?.error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{t(`errors.${state.error}`)}</div>}
      {state?.done && (
        <div className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          {t("bulkImport.done", { created: String(state.done.created), updated: String(state.done.updated), skipped: String(state.done.skipped) })}
        </div>
      )}

      {p && (
        <Card>
          <CardHeader
            title={t("bulkImport.preview")}
            subtitle={t("bulkImport.summary", { total: String(p.total), create: String(p.create), update: String(p.update), errors: String(p.errors) })}
            action={
              p.create + p.update > 0 ? (
                <Button type="submit" disabled={pending || !file} onClick={submit("apply")}>
                  {t("bulkImport.apply", { n: String(p.create + p.update) })}
                </Button>
              ) : undefined
            }
          />
          {(p.unknownHeaders.length > 0 || p.tooMany) && (
            <div className="border-b border-border px-5 py-2 text-xs text-warning">
              {p.unknownHeaders.length > 0 && t("bulkImport.unknownHeaders", { list: p.unknownHeaders.join(", ") })} {p.tooMany && t("bulkImport.tooMany")}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2" />
                  {shown.map((c) => (
                    <th key={c.key} className="px-3 py-2">
                      {c.key}
                    </th>
                  ))}
                  <th className="px-3 py-2">{t("bulkImport.problems")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {p.rows.map((r) => (
                  <tr key={r.row} className={r.action === "error" ? "bg-danger-soft/40" : ""}>
                    <td className="num px-3 py-1.5 text-muted">{r.row}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={r.action === "error" ? "danger" : r.action === "update" ? "warning" : "success"}>{t(`bulkImport.action.${r.action}`)}</Badge>
                    </td>
                    {shown.map((c) => (
                      <td key={c.key} className="max-w-56 truncate px-3 py-1.5">
                        {r.values[c.key] === null || r.values[c.key] === undefined ? "" : r.values[c.key] instanceof Date ? (r.values[c.key] as Date).toISOString().slice(0, 10) : String(r.values[c.key])}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-xs text-danger">{r.issues.map((i) => `${i.column}: ${t(`bulkImport.issue.${i.code}`)}`).join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.total > p.rows.length && <div className="px-5 py-2 text-xs text-muted">{t("bulkImport.more", { n: String(p.total - p.rows.length) })}</div>}
        </Card>
      )}
    </form>
  );
}
