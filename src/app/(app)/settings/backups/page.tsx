import { getTranslations } from "next-intl/server";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, CardHeader, Empty, Notice, PageHeader, Table, Td, Th } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { backupNow } from "./actions";

const TONE = { SUCCESS: "success", FAILED: "danger", RUNNING: "warning" } as const;

export default async function BackupsPage() {
  await requirePermission("backups.manage");
  const t = await getTranslations();
  const runs = await db.backupRun.findMany({ orderBy: { startedAt: "desc" }, take: 100 });
  const size = (b: number | null) => (b ? `${(b / 1024 / 1024).toFixed(2)} MB` : "—");
  return (
    <>
      <PageHeader title={t("settings.backups.title")} subtitle={t("backups.subtitle")} back={{ href: "/settings", label: t("settings.title") }} />
      <div className="flex max-w-4xl flex-col gap-6">
        <Notice tone="primary">{t("backups.explain")}</Notice>
        <Card>
          <CardHeader
            title={t("backups.history")}
            action={
              <ActionForm action={backupNow}>
                <SubmitButton>{t("backups.now")}</SubmitButton>
              </ActionForm>
            }
          />
          {runs.length === 0 ? (
            <Empty>{t("backups.empty")}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("common.date")}</Th>
                  <Th>{t("backups.trigger")}</Th>
                  <Th>{t("common.status")}</Th>
                  <Th className="text-right">{t("backups.size")}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <Td className="num">{formatDateTime(r.startedAt)}</Td>
                    <Td>{t(`backups.${r.trigger === "MANUAL" ? "manual" : "schedule"}`)}</Td>
                    <Td>
                      <Badge tone={TONE[r.status]}>{t(`backups.status_${r.status}`)}</Badge>
                      {r.error && <div className="mt-1 max-w-md break-words text-xs text-danger">{r.error}</div>}
                    </Td>
                    <Td className="num text-right">{size(r.sizeBytes)}</Td>
                    <Td className="text-right">
                      {r.status === "SUCCESS" && (
                        <a href={`/api/backups/${r.id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                          <Download className="size-4" aria-hidden />
                          {t("documents.download")}
                        </a>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
