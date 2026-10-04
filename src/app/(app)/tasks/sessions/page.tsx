import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatNumber, formatQty } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import { Badge, Button, Card, Empty, PageHeader, Select } from "@/components/ui";
import { ConfirmForm } from "@/components/forms/confirm-form";
import { taskWhere } from "@/server/workforce/access";
import { decideSession } from "../actions";

export default async function SessionsPage({ searchParams }: PageProps<"/tasks/sessions">) {
  const user = await requirePermission("sessions.approve");
  const { status = "SUBMITTED" } = (await searchParams) as { status?: string };
  const t = await getTranslations();
  const canSeeCost = can(user, "salaries.view") || can(user, "finance.view");
  const sessions = await db.workSession.findMany({
    where: { companyId: user.companyId, task: taskWhere(user), ...(status === "all" ? {} : { status: status as "SUBMITTED" | "APPROVED" | "REJECTED" }) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      task: { select: { id: true, number: true, title: true, unit: true, plannedQty: true } },
      project: { select: { name: true } },
      group: { select: { name: true } },
      recordedBy: { select: { name: true } },
      members: { include: { employee: { select: { fullName: true } } } },
    },
  });
  return (
    <>
      <PageHeader title={t("sessions.approvals")} back={{ href: "/tasks", label: t("tasks.title") }} subtitle={t("sessions.approvalsHint")} />
      <Card className="mb-4">
        <form className="flex gap-2 p-3">
          <Select name="status" defaultValue={status} className="w-48">
            {["SUBMITTED", "APPROVED", "REJECTED", "all"].map((s) => (
              <option key={s} value={s}>
                {s === "all" ? t("common.all") : t(`sessionStatus.${s}`)}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
        </form>
      </Card>
      <Card>
        {sessions.length === 0 ? (
          <Empty>{t("sessions.nothingToApprove")}</Empty>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map((s) => {
              const disputed = s.members.filter((m) => m.confirmation === "DISPUTED").length;
              const pending = s.members.filter((m) => m.confirmation === "PENDING").length;
              return (
                <div key={s.id} className="flex flex-wrap items-start gap-4 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num font-medium">{formatDate(s.date)}</span>
                      <Link href={`/tasks/${s.task.id}`} className="font-medium hover:text-primary">
                        T-{s.task.number} {s.task.title}
                      </Link>
                      {s.group && <Badge>{s.group.name}</Badge>}
                    </div>
                    <div className="text-xs text-muted">
                      {s.project.name} · {t("sessions.recordedBy", { name: s.recordedBy?.name ?? "—" })}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.members.map((m) => (
                        <Badge key={m.id} tone={m.confirmation === "DISPUTED" ? "danger" : m.confirmation === "CONFIRMED" ? "success" : "neutral"}>
                          {m.employee.fullName} {formatQty(Number(m.sharePercent))}%
                        </Badge>
                      ))}
                    </div>
                    {(s.note || s.problems) && <div className="mt-1 text-xs">{[s.note, s.problems && `⚠ ${s.problems}`].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold">
                      {formatQty(Number(s.quantity))} {s.unit ?? s.task.unit}
                    </div>
                    <div className="num text-xs text-muted">
                      {s.members.length} × {formatNumber(Number(s.hours))} {t("employees.hourShort")}
                      {canSeeCost && ` · ${formatNumber(Number(s.laborCostUzs))} UZS`}
                    </div>
                    {(disputed > 0 || pending > 0) && (
                      <div className="mt-1 text-xs">
                        {disputed > 0 && <Badge tone="danger">{t("sessions.disputed", { n: String(disputed) })}</Badge>}{" "}
                        {pending > 0 && <Badge>{t("sessions.unconfirmed", { n: String(pending) })}</Badge>}
                      </div>
                    )}
                  </div>
                  {s.status === "SUBMITTED" ? (
                    <div className="flex gap-1">
                      <form action={decideSession}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="decision" value="APPROVED" />
                        <Button type="submit" className="h-8 text-xs">
                          {t("approval.approve")}
                        </Button>
                      </form>
                      <ConfirmForm action={decideSession} id={s.id} label={t("approval.reject")} extra={{ decision: "REJECTED" }} />
                    </div>
                  ) : (
                    <Badge tone={s.status === "APPROVED" ? "success" : "danger"}>{t(`sessionStatus.${s.status}`)}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
