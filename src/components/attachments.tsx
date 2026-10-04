import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { UploadButton } from "@/components/upload";

/** Photos / files attached to a record (task, session, remark ...), with an upload button. */
export async function Attachments({ entityType, entityId, canUpload }: { entityType: string; entityId: string; canUpload: boolean }) {
  const t = await getTranslations("attachments");
  const rows = await db.attachment.findMany({
    where: { entityType, entityId },
    include: { file: { select: { id: true, fileName: true, mime: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && <p className="text-sm text-muted">{t("empty")}</p>}
      {rows.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {rows.map((a) =>
            a.file.mime.startsWith("image/") ? (
              <a key={a.id} href={`/api/files/${a.file.id}`} target="_blank" rel="noreferrer" title={`${a.file.fileName} · ${formatDateTime(a.file.createdAt)}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${a.file.id}`} alt={a.file.fileName} loading="lazy" className="aspect-square w-full rounded-lg border border-border object-cover" />
              </a>
            ) : (
              <a
                key={a.id}
                href={`/api/files/${a.file.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-border p-2 text-center text-xs hover:border-primary/50"
              >
                <FileText className="size-6 text-muted" aria-hidden />
                <span className="line-clamp-2 break-all">{a.file.fileName}</span>
              </a>
            ),
          )}
        </div>
      )}
      {canUpload && (
        <div>
          <UploadButton fields={{ purpose: "attachment", entityType, entityId }} label={t("upload")} />
        </div>
      )}
    </div>
  );
}
