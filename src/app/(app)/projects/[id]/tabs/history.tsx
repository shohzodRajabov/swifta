import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, CardHeader, Empty, Table, Td, Th } from "@/components/ui";
import { AuditDiff } from "@/components/audit-diff";

export async function HistoryTab({ projectId, companyId }: { projectId: string; companyId: string }) {
  const t = await getTranslations();
  const [events, logs] = await Promise.all([
    db.projectStageEvent.findMany({
      where: { projectId },
      orderBy: { enteredAt: "desc" },
      include: { user: { select: { name: true } }, statusDef: true },
    }),
    db.auditLog.findMany({
      where: {
        companyId,
        OR: [
          { entityId: projectId },
          { after: { path: ["projectId"], equals: projectId } },
          { before: { path: ["projectId"], equals: projectId } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader title={t("projects.stageHistory")} />
        {events.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <ol className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="px-5 py-3 text-sm">
                <div className="font-medium">
                  {e.statusDef ? `${e.statusDef.code} · ${e.statusDef.name}` : e.stage ? t(`stages.${e.stage}`) : "—"}
                </div>
                <div className="num text-xs text-muted">
                  {formatDateTime(e.enteredAt)} · {e.user?.name ?? "—"}
                </div>
                {e.note && <div className="mt-1 text-xs">{e.note}</div>}
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card>
        <CardHeader title={t("projects.changes")} />
        {logs.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("common.date")}</Th>
                <Th>{t("audit.user")}</Th>
                <Th>{t("audit.entity")}</Th>
                <Th>{t("audit.changes")}</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <Td className="num whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</Td>
                  <Td className="text-xs">{l.user?.name ?? "—"}</Td>
                  <Td>
                    <div className="text-xs font-medium">{l.entity}</div>
                    <Badge tone={l.action === "delete" ? "danger" : l.action === "create" ? "success" : "primary"}>
                      {t(`audit.${l.action as "create" | "update" | "delete"}`)}
                    </Badge>
                  </Td>
                  <Td>
                    <AuditDiff action={l.action} before={l.before} after={l.after} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
