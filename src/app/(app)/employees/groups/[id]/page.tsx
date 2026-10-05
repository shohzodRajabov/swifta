import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatNumber, formatQty } from "@/lib/format";
import { formatDate, isoDate, toDateOnly } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { EfficiencyBadge, TaskStatusBadge } from "@/components/task-bits";
import { efficiencyIndexes } from "@/server/workforce/efficiency";
import { addMember, endMember, updateGroup } from "../../actions";

export default async function GroupPage({ params }: PageProps<"/employees/groups/[id]">) {
  const { id } = await params;
  const user = await requirePermission("employees.view");
  const group = await db.workGroup.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      members: { include: { employee: { select: { id: true, fullName: true, position: true } } }, orderBy: [{ toDate: { sort: "desc", nulls: "first" } }, { fromDate: "desc" }] },
    },
  });
  if (!group) notFound();
  const t = await getTranslations();
  const canManage = can(user, "groups.manage");
  const today = toDateOnly(new Date());
  const current = group.members.filter((m) => m.fromDate <= today && (!m.toDate || m.toDate >= today));
  const history = group.members.filter((m) => !current.includes(m));
  const [eff, employees, sessions, tasks] = await Promise.all([
    efficiencyIndexes(user.companyId, current.map((m) => m.employeeId)),
    canManage ? db.employee.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }) : [],
    db.workSession.findMany({
      where: { groupId: id },
      include: { task: { select: { id: true, number: true, title: true, unit: true } }, _count: { select: { members: true } } },
      orderBy: { date: "desc" },
      take: 20,
    }),
    db.task.findMany({
      where: { assignments: { some: { groupId: id } }, status: { notIn: ["APPROVED", "CANCELLED"] } },
      select: { id: true, number: true, title: true, status: true, deadline: true, project: { select: { name: true } } },
      orderBy: { deadline: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={group.name}
        subtitle={group.specialization}
        back={{ href: "/employees?tab=groups", label: t("employees.tab_groups") }}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("groups.currentMembers")} subtitle={t("groups.historyHint")} />
          {current.length === 0 ? (
            <Empty>{t("groups.noMembers")}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("employees.fullName")}</Th>
                  <Th>{t("groups.role")}</Th>
                  <Th>{t("groups.since")}</Th>
                  <Th>{t("employees.efficiency")}</Th>
                  {canManage && <Th />}
                </tr>
              </thead>
              <tbody>
                {current.map((m) => {
                  const ef = eff.get(m.employeeId);
                  return (
                    <tr key={m.id}>
                      <Td>
                        <Link href={`/employees/${m.employee.id}`} className="font-medium hover:text-primary">
                          {m.employee.fullName}
                        </Link>
                        {m.employee.position && <div className="text-xs text-muted">{m.employee.position}</div>}
                      </Td>
                      <Td>
                        <Badge tone={m.role === "LEADER" ? "primary" : "neutral"}>{t(`groupRole.${m.role}`)}</Badge>
                      </Td>
                      <Td className="num">{formatDate(m.fromDate)}</Td>
                      <Td>
                        <EfficiencyBadge index={ef?.index} reliable={ef?.reliable} distinct={ef?.distinct} />
                      </Td>
                      {canManage && (
                        <Td>
                          <ActionForm action={endMember} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={m.id} />
                            <Input type="date" name="toDate" defaultValue={isoDate(new Date())} className="h-7 w-36 text-xs" />
                            <Button type="submit" variant="ghost" className="h-7 px-2 text-xs">
                              {t("groups.remove")}
                            </Button>
                          </ActionForm>
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {canManage && (
            <ActionForm action={addMember.bind(null, group.id)} resetOnSuccess className="grid gap-3 border-t border-border p-4 sm:grid-cols-4">
              <Field label={t("groups.addMember")} className="sm:col-span-2">
                <Select name="employeeId" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("groups.role")}>
                <Select name="role" defaultValue="WORKER">
                  {(["LEADER", "SENIOR", "WORKER"] as const).map((r) => (
                    <option key={r} value={r}>
                      {t(`groupRole.${r}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("groups.fromDate")}>
                <Input type="date" name="fromDate" required defaultValue={isoDate(new Date())} />
              </Field>
              <div className="sm:col-span-4">
                <SubmitButton>{t("common.add")}</SubmitButton>
                <p className="mt-2 text-xs text-muted">{t("groups.roleChangeHint")}</p>
              </div>
            </ActionForm>
          )}
        </Card>

        <Card>
          <CardHeader title={t("groups.openTasks")} />
          {tasks.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <Table>
              <tbody>
                {tasks.map((tk) => (
                  <tr key={tk.id}>
                    <Td>
                      <Link href={`/tasks/${tk.id}`} className="hover:text-primary">
                        <span className="num text-muted">T-{tk.number}</span> {tk.title}
                      </Link>
                      <div className="text-xs text-muted">{tk.project.name}</div>
                    </Td>
                    <Td>
                      <TaskStatusBadge status={tk.status} />
                    </Td>
                    <Td className="num text-right">{formatDate(tk.deadline)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("groups.history")} />
          {history.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <Table>
              <tbody>
                {history.map((m) => (
                  <tr key={m.id}>
                    <Td>{m.employee.fullName}</Td>
                    <Td>{t(`groupRole.${m.role}`)}</Td>
                    <Td className="num text-right">
                      {formatDate(m.fromDate)} — {m.toDate ? formatDate(m.toDate) : t("groups.now")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title={t("employees.recentSessions")} />
          {sessions.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <Table>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <Td className="num">{formatDate(s.date)}</Td>
                    <Td>
                      <Link href={`/tasks/${s.task.id}`} className="hover:text-primary">
                        T-{s.task.number} {s.task.title}
                      </Link>
                    </Td>
                    <Td className="num text-right">
                      {formatQty(Number(s.quantity))} {s.task.unit} · {s._count.members} × {formatNumber(Number(s.hours))}
                      {t("employees.hourShort")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {canManage && (
        <Card className="mt-6">
          <CardHeader title={t("common.edit")} />
          <ActionForm action={updateGroup.bind(null, group.id)} className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label={t("groups.name")} required>
              <Input name="name" required defaultValue={group.name} />
            </Field>
            <Field label={t("groups.specialization")}>
              <Input name="specialization" defaultValue={group.specialization ?? ""} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={group.active} /> {t("employees.active")}
            </label>
            <div className="sm:col-span-3">
              <SubmitButton>{t("common.save")}</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
