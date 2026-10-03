import { getTranslations } from "next-intl/server";
import { CheckCircle2, CircleDashed, Download, Eye, FileText, ImageIcon } from "lucide-react";
import type { DocumentCategory } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import type { StatusCatalog } from "@/server/projects/status";
import { Badge, Card, CardHeader, Empty, Table, Td, Th } from "@/components/ui";
import { UploadButton } from "@/components/upload";
import { NewDocumentForm } from "@/components/doc-upload-form";

export const DOC_CATEGORIES: DocumentCategory[] = [
  "CONTRACT",
  "SIGNED_CONTRACT",
  "ADDITIONAL_AGREEMENT",
  "COMMERCIAL_OFFER",
  "TECH_SPEC",
  "PROJECT_FILES",
  "DRAWING",
  "SPECIFICATION",
  "SMETA",
  "INVOICE",
  "PURCHASE_ORDER",
  "WAYBILL",
  "ACT",
  "COMPLETION_ACT",
  "HIDDEN_WORKS_ACT",
  "TEST_ACT",
  "PAYMENT_PROOF",
  "FINAL_DOCS",
  "WARRANTY",
  "PASSPORT",
  "CERTIFICATE",
  "PHOTO",
  "CORRESPONDENCE",
  "SERVICE_REPORT",
  "CONTRACTOR_DOC",
  "OTHER",
];

function sizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export async function DocumentsTab({
  user,
  projectId,
  catalog,
}: {
  user: CurrentUser;
  projectId: string;
  catalog: StatusCatalog;
}) {
  const t = await getTranslations();
  const canEdit = can(user, "documents.edit");
  const [docs, project] = await Promise.all([
    db.document.findMany({
      where: { projectId },
      orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
      include: {
        versions: {
          orderBy: { version: "desc" },
          include: { file: { include: { uploadedBy: { select: { name: true } } } } },
        },
      },
    }),
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { statusId: true } }),
  ]);

  // Required documents of the current and upcoming statuses.
  const flat = catalog.flatMap((g) => g.statuses.map((s) => ({ ...s, group: g })));
  const currentIdx = flat.findIndex((s) => s.id === project.statusId);
  const upcoming = flat.slice(Math.max(0, currentIdx)).filter((s) => s.requiredDocs.length > 0);
  const requirements = [...new Set(upcoming.flatMap((s) => s.requiredDocs))].map((c) => ({
    category: c,
    present: docs.some((d) => d.category === c && d.versions.length > 0),
    firstStatus: upcoming.find((s) => s.requiredDocs.includes(c))!,
  }));

  return (
    <div className="flex flex-col gap-6">
      {requirements.length > 0 && (
        <Card>
          <CardHeader title={t("documents.required")} subtitle={t("documents.requiredHint")} />
          <ul className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {requirements.map((r) => (
              <li key={r.category} className="flex items-start gap-2 text-sm">
                {r.present ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <CircleDashed className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                )}
                <span>
                  {t(`docCategory.${r.category}`)}
                  <span className="block text-xs text-muted">
                    {t("documents.neededFor", { status: `${r.firstStatus.code} ${r.firstStatus.name}` })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader title={t("documents.new")} subtitle={t("documents.formats")} />
          <NewDocumentForm projectId={projectId} categories={DOC_CATEGORIES} />
        </Card>
      )}

      <Card>
        <CardHeader title={t("documents.title")} />
        {docs.length === 0 ? (
          <Empty>{t("documents.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("documents.document")}</Th>
                <Th>{t("documents.category")}</Th>
                <Th>{t("documents.versions")}</Th>
                <Th>{t("documents.updated")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const latest = d.versions[0];
                const isImage = latest?.file.mime.startsWith("image/");
                return (
                  <tr key={d.id}>
                    <Td>
                      <div className="flex items-start gap-2">
                        {isImage ? (
                          <ImageIcon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                        ) : (
                          <FileText className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium">{d.title}</div>
                          {latest && (
                            <div className="truncate text-xs text-muted">
                              {latest.file.fileName} · {sizeLabel(latest.file.size)}
                            </div>
                          )}
                        </div>
                      </div>
                      {d.versions.length > 1 && (
                        <details className="mt-1 text-xs">
                          <summary className="cursor-pointer text-muted">{t("documents.history")}</summary>
                          <ul className="mt-1 space-y-0.5">
                            {d.versions.map((v) => (
                              <li key={v.id} className="flex items-center gap-2">
                                <Badge>v{v.version}</Badge>
                                <a href={`/api/files/${v.fileId}`} target="_blank" rel="noreferrer" className="hover:text-primary">
                                  {v.file.fileName}
                                </a>
                                <span className="text-muted">
                                  {formatDateTime(v.createdAt)} · {v.file.uploadedBy?.name ?? "—"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </Td>
                    <Td>
                      <Badge>{t(`docCategory.${d.category}`)}</Badge>
                    </Td>
                    <Td>
                      <Badge tone="primary">v{latest?.version ?? 0}</Badge>
                    </Td>
                    <Td className="num text-xs">
                      {latest ? formatDateTime(latest.createdAt) : "—"}
                      <div className="text-muted">{latest?.file.uploadedBy?.name ?? ""}</div>
                    </Td>
                    <Td className="text-right">
                      {latest && (
                        <div className="flex items-center justify-end gap-1">
                          <a href={`/api/files/${latest.fileId}`} target="_blank" rel="noreferrer" className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text" title={t("documents.view")}>
                            <Eye className="size-4" aria-hidden />
                          </a>
                          <a href={`/api/files/${latest.fileId}?download=1`} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text" title={t("documents.download")}>
                            <Download className="size-4" aria-hidden />
                          </a>
                          {canEdit && (
                            <UploadButton
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              label={t("documents.newVersion")}
                              fields={{ purpose: "document", projectId, documentId: d.id, category: d.category }}
                            />
                          )}
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
