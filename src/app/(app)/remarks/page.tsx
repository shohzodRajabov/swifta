import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Prisma, RemarkStatus } from "@prisma/client";
import { requireAnyPermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatDate, toDateOnly } from "@/lib/utils";
import { Badge, Button, Card, Empty, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { PriorityBadge } from "@/components/project-bits";
import { RemarkStatusBadge } from "@/components/task-bits";
import { projectWhere } from "@/server/projects/access";

const STATUSES: RemarkStatus[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "FIXED", "REINSPECTION", "ACCEPTED"];

export default async function RemarksPage({ searchParams }: PageProps<"/remarks">) {
  const user = await requireAnyPermission("tasks.view", "remarks.create", "remarks.manage");
  const sp = (await searchParams) as { status?: string; project?: string; mine?: string };
  const t = await getTranslations();
  const today = toDateOnly(new Date());
  const where: Prisma.RemarkWhereInput = {
    companyId: user.companyId,
    project: projectWhere(user),
    ...(sp.project ? { projectId: sp.project } : {}),
    ...(sp.status === "all" ? {} : sp.status ? { status: sp.status as RemarkStatus } : { status: { not: "ACCEPTED" } }),
    ...(sp.mine === "1" || !can(user, "remarks.manage") && !can(user, "tasks.manage") ? { OR: [{ responsibleUserId: user.id }, { createdById: user.id }] } : {}),
  };
  const [remarks, projects] = await Promise.all([
    db.remark.findMany({
      where,
      orderBy: [{ status: "asc" }, { number: "desc" }],
      take: 300,
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, number: true, title: true } },
        location: { select: { name: true } },
        responsible: { select: { name: true } },
      },
    }),
    db.project.findMany({ where: { AND: [projectWhere(user), { remarks: { some: {} } }] }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title={t("remarks.title")} subtitle={t("remarks.subtitle")} />
      <Card className="mb-4">
        <form className="flex flex-wrap gap-2 p-3">
          <Select name="project" defaultValue={sp.project ?? ""} className="w-56">
            <option value="">{t("tasks.allProjects")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={sp.status ?? ""} className="w-48">
            <option value="">{t("remarks.open")}</option>
            <option value="all">{t("common.all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`remarkStatus.${s}`)}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} /> {t("tasks.onlyMine")}
          </label>
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
        </form>
      </Card>
      <Card>
        {remarks.length === 0 ? (
          <Empty>{t("remarks.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("remarks.description")}</Th>
                <Th>{t("remarks.responsible")}</Th>
                <Th>{t("common.status")}</Th>
                <Th className="text-right">{t("tasks.deadline")}</Th>
              </tr>
            </thead>
            <tbody>
              {remarks.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/remarks/${r.id}`} className="font-medium hover:text-primary">
                      <span className="num text-muted">#{r.number}</span> {r.description}
                    </Link>
                    <div className="text-xs text-muted">
                      {r.project.name}
                      {r.location && ` · ${r.location.name}`}
                      {r.task && ` · T-${r.task.number} ${r.task.title}`}
                    </div>
                    {r.priority !== "MEDIUM" && (
                      <div className="mt-1">
                        <PriorityBadge priority={r.priority} />
                      </div>
                    )}
                  </Td>
                  <Td>{r.responsible?.name ?? "—"}</Td>
                  <Td>
                    <RemarkStatusBadge status={r.status} />
                  </Td>
                  <Td className="text-right">
                    <span className="num">{formatDate(r.deadline)}</span>
                    {r.deadline && r.deadline < today && r.status !== "ACCEPTED" && (
                      <div>
                        <Badge tone="danger">{t("deadline.OVERDUE")}</Badge>
                      </div>
                    )}
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
