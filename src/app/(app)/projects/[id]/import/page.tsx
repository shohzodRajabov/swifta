import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileSpreadsheet } from "lucide-react";
import { requireAnyPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { formatDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmForm } from "@/components/forms/confirm-form";
import { UploadButton } from "@/components/upload";
import { projectWhere } from "@/server/projects/access";
import type { SmetaRow } from "@/server/import/smeta";
import { rejectImport, saveImport } from "./actions";

const KIND_TONE = { TASK: "primary", EQUIPMENT: "warning", MATERIAL: "neutral", SKIP: "neutral" } as const;

export default async function ImportPage({ params }: PageProps<"/projects/[id]/import">) {
  const { id } = await params;
  const user = await requireAnyPermission("import.manage", "import.approve");
  const project = await db.project.findFirst({ where: { AND: [{ id }, projectWhere(user)] }, select: { id: true, name: true } });
  if (!project) notFound();
  const t = await getTranslations();
  const imports = await db.smetaImport.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    include: { file: { select: { id: true, fileName: true } } },
    take: 20,
  });
  const draft = imports.find((i) => i.status === "DRAFT");
  const rows = (draft?.rows ?? []) as SmetaRow[];
  const canApprove = can(user, "import.approve");
  const totals = { TASK: 0, EQUIPMENT: 0, MATERIAL: 0, SKIP: 0 };
  for (const r of rows) totals[r.kind] += r.total;

  return (
    <>
      <PageHeader title={t("smeta.title")} back={{ href: `/projects/${id}?tab=tasks`, label: project.name }} subtitle={t("smeta.subtitle")} />
      {!draft && can(user, "import.manage") && (
        <Card className="mb-6 p-5">
          <Notice>{t("smeta.howTo")}</Notice>
          <div className="mt-4">
            <UploadButton fields={{ purpose: "smeta", projectId: id }} accept=".xlsx" label={t("smeta.upload")} variant="primary" icon={<FileSpreadsheet className="size-4" aria-hidden />} />
          </div>
        </Card>
      )}

      {draft && (
        <Card className="mb-6">
          <CardHeader
            title={t("smeta.review", { file: draft.file.fileName })}
            subtitle={t("smeta.reviewHint")}
            action={<ConfirmForm action={rejectImport} id={draft.id} label={t("smeta.discard")} />}
          />
          <div className="flex flex-wrap gap-2 border-b border-border px-5 py-3 text-xs">
            {(["TASK", "EQUIPMENT", "MATERIAL", "SKIP"] as const).map((k) => (
              <Badge key={k} tone={KIND_TONE[k]}>
                {t(`smeta.kind_${k}`)}: {rows.filter((r) => r.kind === k).length} · {formatNumber(Math.round(totals[k]))}
              </Badge>
            ))}
          </div>
          <ActionForm action={saveImport.bind(null, draft.id)}>
            <div className="flex flex-wrap gap-3 px-5 py-3">
              <Field label={t("common.currency")}>
                <Select name="currency" defaultValue={draft.currency} className="w-28">
                  <option value="UZS">UZS</option>
                  <option value="USD">USD</option>
                </Select>
              </Field>
              <Field label={t("smeta.vatIncluded")}>
                <Select name="vatRate" defaultValue={String(Number(draft.vatRate))} className="w-28">
                  {[0, 12, 15, 20].map((v) => (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">{t("smeta.kind")}</th>
                    <th className="px-3 py-2">{t("common.name")}</th>
                    <th className="px-3 py-2">{t("common.unit")}</th>
                    <th className="px-3 py-2 text-right">{t("common.quantity")}</th>
                    <th className="px-3 py-2 text-right">{t("smeta.price")}</th>
                    <th className="px-3 py-2 text-right">{t("common.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const newSection = r.section && (i === 0 || rows[i - 1].section !== r.section);
                    return [
                      newSection && (
                        <tr key={`s${i}`}>
                          <td colSpan={7} className="bg-surface-2/60 px-3 py-1.5 text-xs font-semibold uppercase text-muted">
                            {r.section} <span className="font-normal normal-case">→ {t("smeta.sectionAsLocation")}</span>
                          </td>
                        </tr>
                      ),
                      <tr key={i} className={`border-t border-border ${r.kind === "SKIP" ? "opacity-50" : ""}`}>
                        <td className="num px-3 py-1 text-xs text-muted">{r.row}</td>
                        <td className="px-3 py-1">
                          <Select name={`kind_${i}`} defaultValue={r.kind} className="h-8 w-36 text-xs">
                            {(["TASK", "EQUIPMENT", "MATERIAL", "SKIP"] as const).map((k) => (
                              <option key={k} value={k}>
                                {t(`smeta.kind_${k}`)}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-3 py-1">
                          <Input name={`name_${i}`} defaultValue={r.name} className="h-8 min-w-64 text-xs" />
                        </td>
                        <td className="px-3 py-1">
                          <Input name={`unit_${i}`} defaultValue={r.unit} className="h-8 w-16 text-xs" />
                        </td>
                        <td className="px-3 py-1">
                          <Input name={`qty_${i}`} defaultValue={String(r.qty)} inputMode="decimal" className="h-8 w-24 text-right text-xs" />
                        </td>
                        <td className="px-3 py-1">
                          <Input name={`price_${i}`} defaultValue={String(r.unitPrice)} inputMode="decimal" className="h-8 w-32 text-right text-xs" />
                        </td>
                        <td className="num px-3 py-1 text-right text-xs">{formatNumber(Math.round(r.total))}</td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
              <Button type="submit" name="intent" value="save" variant="secondary">
                {t("smeta.saveDraft")}
              </Button>
              {canApprove ? (
                <Button type="submit" name="intent" value="approve">
                  {t("smeta.approve")}
                </Button>
              ) : (
                <span className="text-xs text-muted">{t("smeta.waitingApproval")}</span>
              )}
              <span className="text-xs text-muted">{t("smeta.approveHint")}</span>
            </div>
          </ActionForm>
        </Card>
      )}

      <Card>
        <CardHeader title={t("smeta.history")} />
        {imports.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {imports.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-2">
                <a href={`/api/files/${i.file.id}?download=1`} className="hover:text-primary">
                  {i.file.fileName}
                </a>
                <span className="text-xs text-muted">{formatDateTime(i.createdAt)}</span>
                <span className="text-xs text-muted">{t("smeta.rows", { n: String((i.rows as SmetaRow[]).length) })}</span>
                <Badge className="ml-auto" tone={i.status === "APPROVED" ? "success" : i.status === "REJECTED" ? "neutral" : "warning"}>
                  {t(`smeta.status_${i.status}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
