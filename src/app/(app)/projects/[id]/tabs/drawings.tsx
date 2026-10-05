import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileImage } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, CardHeader, Empty } from "@/components/ui";
import { NewDrawingForm } from "@/components/drawing-upload";
import { taskSummaries } from "@/server/drawings/drawings";

export async function DrawingsTab({ user, projectId }: { user: CurrentUser; projectId: string }) {
  const t = await getTranslations();
  const drawings = await db.drawing.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        include: { zones: { select: { needsReview: true, tasks: { select: { taskId: true } } } }, _count: { select: { remarks: true } } },
      },
    },
  });
  const summaries = await taskSummaries([...new Set(drawings.flatMap((d) => d.versions[0]?.zones.flatMap((z) => z.tasks.map((x) => x.taskId)) ?? []))]);

  return (
    <div className="flex flex-col gap-6">
      {can(user, "drawings.edit") && (
        <Card>
          <CardHeader title={t("drawings.new")} subtitle={t("drawings.newHint")} />
          <NewDrawingForm projectId={projectId} />
        </Card>
      )}
      {drawings.length === 0 ? (
        <Card>
          <Empty>{t("drawings.empty")}</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {drawings.map((d) => {
            const v = d.versions[0];
            const taskIds = [...new Set(v?.zones.flatMap((z) => z.tasks.map((x) => x.taskId)) ?? [])];
            const ts = taskIds.map((id) => summaries.get(id)).filter(Boolean);
            const pct = ts.length ? Math.round(ts.reduce((s, x) => s + x!.percent, 0) / ts.length) : null;
            const review = v?.zones.filter((z) => z.needsReview).length ?? 0;
            return (
              <Link key={d.id} href={`/projects/${projectId}/drawings/${d.id}`}>
                <Card className="h-full p-4 transition-colors hover:border-primary/50">
                  <div className="flex items-start gap-3">
                    <FileImage className="size-8 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{d.title}</div>
                      <div className="text-xs text-muted">
                        {d.discipline && `${d.discipline} · `}v{v?.version} · {v ? formatDateTime(v.createdAt) : ""}
                      </div>
                    </div>
                    {pct !== null && <span className="num text-lg font-semibold text-primary">{pct}%</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1 text-xs">
                    <Badge>{t("drawings.zonesN", { n: String(v?.zones.length ?? 0) })}</Badge>
                    <Badge>{t("drawings.tasksN", { n: String(taskIds.length) })}</Badge>
                    {(v?._count.remarks ?? 0) > 0 && <Badge tone="danger">{t("drawings.remarksN", { n: String(v!._count.remarks) })}</Badge>}
                    {review > 0 && <Badge tone="warning">{t("drawings.reviewN", { n: String(review) })}</Badge>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
