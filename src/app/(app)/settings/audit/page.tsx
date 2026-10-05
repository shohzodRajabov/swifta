import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Badge, Button, Card, Empty, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { AuditDiff } from "@/components/audit-diff";
import { maskForViewer } from "@/lib/audit-mask";

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const user = await requirePermission("audit.view");
  const { entity } = (await searchParams) as { entity?: string };
  const t = await getTranslations();
  const entities = await db.auditLog.findMany({
    where: { companyId: user.companyId },
    distinct: ["entity"],
    select: { entity: true },
  });
  const logs = await db.auditLog.findMany({
    where: { companyId: user.companyId, ...(entity ? { entity } : {}) },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />
      <Card>
        <form className="flex gap-2 border-b border-border p-3">
          <Select name="entity" defaultValue={entity ?? ""} className="max-w-60">
            <option value="">
              {t("audit.entity")}: {t("common.all")}
            </option>
            {entities.map((e) => (
              <option key={e.entity} value={e.entity}>
                {e.entity}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
        </form>
        {logs.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("common.date")}</Th>
                <Th>{t("audit.user")}</Th>
                <Th>{t("audit.entity")}</Th>
                <Th>{t("audit.action")}</Th>
                <Th>{t("audit.changes")}</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <Td className="num whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</Td>
                  <Td className="text-xs">{l.user?.name ?? "—"}</Td>
                  <Td className="text-xs">
                    <div className="font-medium">{l.entity}</div>
                    <div className="num text-muted">{l.entityId.slice(-8)}</div>
                  </Td>
                  <Td>
                    <Badge tone={l.action === "delete" ? "danger" : l.action === "create" ? "success" : "primary"}>
                      {t(`audit.${l.action as "create" | "update" | "delete"}`)}
                    </Badge>
                  </Td>
                  <Td>
                    <AuditDiff action={l.action} before={maskForViewer(l.before, user)} after={maskForViewer(l.after, user)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
