import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { OutsourceStatus } from "@prisma/client";
import { Pencil } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { recordMoney } from "@/lib/money-value";
import { formatNumber, formatQty } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { cn, formatDate, formatDateTime, isoDate } from "@/lib/utils";
import { Badge, Card, CardHeader, Empty, Field, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Money } from "@/components/money";
import { Attachments } from "@/components/attachments";
import { AvailabilityBadge, OutsourceStatusBadge, RatingValue, ReliabilityValue } from "@/components/contractor-bits";
import { contractorScores, contractorWorkload } from "@/server/contractors/score";
import { contractorBalances } from "@/server/contractors/balances";
import { RATING_COMPONENTS, RELIABILITY_COMPONENTS } from "@/lib/contractor-score";
import { addContact, addContractorPayment, deleteContact, deleteContractorPayment } from "../actions";

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export default async function ContractorPage({ params, searchParams }: PageProps<"/contractors/[id]">) {
  const { id } = await params;
  const sp = (await searchParams) as { project?: string; status?: string };
  const user = await requirePermission("contractors.view");
  const contractor = await db.contractor.findFirst({ where: { id, companyId: user.companyId }, include: { contacts: true } });
  if (!contractor) notFound();
  const t = await getTranslations();
  const showMoney = can(user, "finance.view") || can(user, "contractorPayments.edit");
  const [score, workload, balance, assignments, payments, history] = await Promise.all([
    contractorScores(user.companyId, [id]).then((m) => m.get(id)),
    contractorWorkload(user.companyId).then((m) => m.get(id)),
    showMoney ? contractorBalances(user.companyId, [id]).then((m) => m.get(id)) : Promise.resolve(undefined),
    db.taskAssignment.findMany({
      where: { contractorId: id, kind: "CONTRACTOR" },
      include: { task: { select: { id: true, number: true, title: true, unit: true, project: { select: { id: true, name: true } } } }, payments: { where: { approval: "APPROVED" }, select: { amountUzs: true } } },
      orderBy: { createdAt: "desc" },
    }),
    showMoney
      ? db.contractorPayment.findMany({ where: { contractorId: id }, orderBy: { date: "desc" }, include: { project: { select: { name: true } }, assignment: { select: { task: { select: { number: true, title: true } } } } } })
      : [],
    db.contractorScore.findMany({ where: { contractorId: id }, orderBy: { at: "desc" }, take: 12 }),
  ]);
  const projects = [...new Map(assignments.filter((a) => a.outsourceStatus !== "CANCELLED").map((a) => [a.task.project.id, a.task.project.name])).entries()];
  const shown = assignments.filter(
    (a) =>
      (!sp.project || a.task.project.id === sp.project) &&
      (!sp.status || (sp.status === "rework" ? a.reworkCount > 0 : sp.status === "active" ? ["ASSIGNED", "IN_PROGRESS"].includes(a.outsourceStatus ?? "") : a.outsourceStatus === sp.status)),
  );
  const st = score?.stats;
  const link = (q: Record<string, string>) => `/contractors/${id}?${new URLSearchParams(q).toString()}#history`;
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <>
      <PageHeader
        title={contractor.name}
        back={{ href: "/contractors", label: t("contractors.title") }}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <span className="num">C-{contractor.number}</span>
            <span>· {t(`contractorKind.${contractor.kind}`)}</span>
            {contractor.phone && <a href={`tel:+${contractor.phone}`} className="num hover:text-primary">{formatPhone(contractor.phone)}</a>}
            <AvailabilityBadge availability={contractor.availability} busy={workload?.tasks} />
            {!contractor.active && <Badge>{t("employees.inactive")}</Badge>}
          </div>
        }
        actions={
          can(user, "contractors.edit") && (
            <LinkButton href={`/contractors/${id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden />
              {t("common.edit")}
            </LinkButton>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-muted">{t("contractors.rating")}</div>
          <div className="mt-1 text-3xl">
            <RatingValue rating={score?.rating} />
          </div>
          <ul className="mt-3 space-y-1 text-xs">
            {RATING_COMPONENTS.filter((k) => score?.ratingParts[k] !== undefined).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="w-28 text-muted">{t(`contractorScore.${k}`)}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(score!.ratingParts[k]! * 100)}%` }} />
                </span>
                <span className="num w-9 text-right">{Math.round(score!.ratingParts[k]! * 100)}%</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-muted">{t("contractors.reliability")}</div>
          <div className="mt-1 text-3xl">
            <ReliabilityValue value={score?.reliability} />
          </div>
          <ul className="mt-3 space-y-1 text-xs">
            {RELIABILITY_COMPONENTS.filter((k) => score?.reliabilityParts[k] !== undefined).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="w-28 text-muted">{t(`contractorScore.rel_${k}`)}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(score!.reliabilityParts[k]! * 100)}%` }} />
                </span>
                <span className="num w-9 text-right">{Math.round(score!.reliabilityParts[k]! * 100)}%</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-muted">{t("contractors.history")}</div>
          <dl className="mt-2 space-y-1 text-sm">
            {(
              [
                [t("contractors.objects"), String(projects.length), null],
                [t("contractors.tasksTotal"), String(st?.total ?? 0), {}],
                [t("contractors.active"), String(st?.active ?? 0), { status: "active" }],
                [t("contractors.verified"), String(st?.verified ?? 0), { status: "VERIFIED" }],
                [t("contractors.reworked"), String(st?.reworked ?? 0), { status: "rework" }],
                [t("contractors.cancelled"), String(st?.cancelled ?? 0), { status: "CANCELLED" }],
                [t("contractors.onTime"), st ? pct(st.onTime, st.withDeadline) : "—", null],
                [t("contractors.avgDelay"), st?.avgDelayDays !== null && st?.avgDelayDays !== undefined ? t("contractors.days", { n: formatQty(st.avgDelayDays) }) : "—", null],
                [t("contractors.avgQuality"), st?.avgQuality ? `${st.avgQuality.toFixed(1)} / 5` : "—", null],
                [t("contractors.priceOverrun"), st?.priceOverrunPct !== null && st?.priceOverrunPct !== undefined ? `${st.priceOverrunPct > 0 ? "+" : ""}${st.priceOverrunPct.toFixed(1)}%` : "—", null],
              ] as [string, string, Record<string, string> | null][]
            ).map(([k, v, q]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted">{k}</dt>
                <dd className="num">{q ? <Link href={link(q)} className="text-primary hover:underline">{v}</Link> : v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {balance ? (
          <Card className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted">{t("contractors.money")}</div>
            <dl className="mt-2 space-y-2 text-sm">
              {(
                [
                  [t("contractors.agreed"), balance.agreed],
                  [t("contractors.completedValue"), balance.completed],
                  [t("contractors.paid"), balance.paid],
                  [t("contractors.payable"), balance.payable],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd>
                    <Money size="sm" value={v} />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : (
          <Card className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted">{t("contractors.workload")}</div>
            <p className="mt-2 text-sm">{workload ? workload.projects.join(", ") : t("contractors.free")}</p>
          </Card>
        )}
      </div>

      {workload && (
        <div className="mt-4 rounded-lg bg-warning-soft px-4 py-2.5 text-sm text-warning">
          {t("contractors.busyNow", { n: String(workload.tasks), projects: workload.projects.join(", "), until: formatDate(workload.until) })}
        </div>
      )}

      <Card className="mt-6" id="history">
        <CardHeader
          title={t("contractors.workHistory")}
          subtitle={t("contractors.workHistoryHint")}
          action={
            <form className="flex gap-2">
              <Select name="project" defaultValue={sp.project ?? ""} className="h-8 w-48 text-xs">
                <option value="">{t("tasks.allProjects")}</option>
                {projects.map(([pid, name]) => (
                  <option key={pid} value={pid}>
                    {name}
                  </option>
                ))}
              </Select>
              <Select name="status" defaultValue={sp.status ?? ""} className="h-8 w-40 text-xs">
                <option value="">{t("common.all")}</option>
                <option value="active">{t("contractors.active")}</option>
                <option value="rework">{t("contractors.reworked")}</option>
                {(["ASSIGNED", "IN_PROGRESS", "COMPLETED", "VERIFIED", "REJECTED", "CANCELLED"] as OutsourceStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {t(`outsourceStatus.${s}`)}
                  </option>
                ))}
              </Select>
              <button className="text-xs text-primary">{t("common.filter")}</button>
            </form>
          }
        />
        {shown.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("tasks.task")}</Th>
                <Th className="text-right">{t("common.quantity")}</Th>
                {showMoney && <Th className="text-right">{t("contractors.agreed")}</Th>}
                {showMoney && <Th className="text-right">{t("contractors.actual")}</Th>}
                {showMoney && <Th className="text-right">{t("contractors.paid")}</Th>}
                <Th>{t("common.status")}</Th>
                <Th className="text-right">{t("tasks.deadline")}</Th>
                <Th className="text-right">{t("contractors.quality")}</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => {
                const late = a.deadline && a.completedAt && a.completedAt.getTime() > a.deadline.getTime() + 86400000 - 1;
                const paid = a.payments.reduce((s, p) => s + n(p.amountUzs), 0);
                return (
                  <tr key={a.id}>
                    <Td>
                      <Link href={`/tasks/${a.task.id}`} className="hover:text-primary">
                        <span className="num text-muted">T-{a.task.number}</span> {a.task.title}
                      </Link>
                      <div className="text-xs text-muted">{a.task.project.name}</div>
                      {a.reworkCount > 0 && <Badge tone="danger">{t("contractors.reworkTimes", { n: String(a.reworkCount) })}</Badge>}
                    </Td>
                    <Td className="num text-right">
                      {a.completedQty ? formatQty(n(a.completedQty)) : "—"} / {a.plannedQty ? formatQty(n(a.plannedQty)) : "—"} {a.task.unit}
                    </Td>
                    {showMoney && <Td className="num text-right">{a.agreedUzs ? formatNumber(n(a.agreedUzs)) : "—"}</Td>}
                    {showMoney && (
                      <Td className={cn("num text-right", n(a.actualUzs) > n(a.agreedUzs) && a.agreedUzs && "text-danger")}>{a.actualUzs ? formatNumber(n(a.actualUzs)) : "—"}</Td>
                    )}
                    {showMoney && <Td className="num text-right">{paid ? formatNumber(paid) : "—"}</Td>}
                    <Td>
                      <OutsourceStatusBadge status={a.outsourceStatus} />
                    </Td>
                    <Td className="text-right">
                      <div className="num">{formatDate(a.deadline)}</div>
                      {a.completedAt && <div className={cn("num text-xs", late ? "text-danger" : "text-muted")}>✓ {formatDate(a.completedAt)}</div>}
                    </Td>
                    <Td className="num text-right">{a.qualityScore ? `★ ${a.qualityScore}` : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {showMoney && (
        <Card className="mt-6">
          <CardHeader title={t("contractors.payments")} />
          {payments.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <Table>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <Td className="num">{formatDate(p.date)}</Td>
                    <Td>
                      {p.assignment ? `T-${p.assignment.task.number} ${p.assignment.task.title}` : t("contractors.advance")}
                      <div className="text-xs text-muted">
                        {p.project?.name}
                        {p.reference && ` · ${p.reference}`}
                        {p.note && ` · ${p.note}`}
                      </div>
                    </Td>
                    <Td>{t(`paymentMethod.${p.method}`)}</Td>
                    <Td>{p.approval !== "APPROVED" && <Badge tone={p.approval === "PENDING" ? "warning" : "danger"}>{t(`approval.${p.approval}`)}</Badge>}</Td>
                    <Td className="text-right">
                      <Money size="sm" value={recordMoney(p)} />
                    </Td>
                    <Td className="w-10">{can(user, "contractorPayments.edit") && <DeleteButton action={deleteContractorPayment} id={p.id} label="×" />}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {can(user, "contractorPayments.edit") && (
            <ActionForm action={addContractorPayment.bind(null, id)} resetOnSuccess className="grid gap-3 border-t border-border p-4 md:grid-cols-2">
              <Field label={t("contractors.forTask")}>
                <Select name="assignmentId" defaultValue="">
                  <option value="">{t("contractors.advance")}</option>
                  {assignments
                    .filter((a) => a.outsourceStatus !== "CANCELLED")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        T-{a.task.number} {a.task.title} — {a.task.project.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("common.date")} required>
                  <Input type="date" name="date" required defaultValue={isoDate(new Date())} />
                </Field>
                <Field label={t("payments.method")}>
                  <Select name="method" defaultValue="CASH">
                    {(["CASH", "BANK", "CARD", "OTHER"] as const).map((m) => (
                      <option key={m} value={m}>
                        {t(`paymentMethod.${m}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <MoneyInput label={t("common.amount")} />
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("contractors.reference")}>
                  <Input name="reference" />
                </Field>
                <Field label={t("common.note")}>
                  <Input name="note" />
                </Field>
              </div>
              <div className="md:col-span-2">
                <SubmitButton>{t("common.add")}</SubmitButton>
              </div>
            </ActionForm>
          )}
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("contractors.details")} />
          <dl className="space-y-1.5 p-5 text-sm">
            {(
              [
                [t("contractors.specializations"), contractor.specializations.join(", ")],
                [t("contractors.regions"), contractor.regions.join(", ")],
                [t("contractors.phone2"), contractor.phone2 ? formatPhone(contractor.phone2) : null],
                ["Email", contractor.email],
                [t("contractors.address"), contractor.address],
                [t("contractors.tin"), contractor.tin],
                [t("contractors.bankDetails"), contractor.bankDetails],
                [t("common.note"), contractor.note],
              ] as [string, string | null][]
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="whitespace-pre-line">{v}</dd>
                </div>
              ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title={t("contractors.contacts")} />
          <ul className="divide-y divide-border text-sm">
            {contractor.contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-5 py-2">
                <div>
                  <div>{c.name}</div>
                  <div className="text-xs text-muted">
                    {c.role}
                    {c.phone && <span className="num"> · {formatPhone(c.phone)}</span>}
                  </div>
                </div>
                {can(user, "contractors.edit") && <DeleteButton action={deleteContact} id={c.id} label="×" />}
              </li>
            ))}
            {contractor.contacts.length === 0 && <li className="px-5 py-3 text-muted">{t("common.noData")}</li>}
          </ul>
          {can(user, "contractors.edit") && (
            <ActionForm action={addContact.bind(null, id)} resetOnSuccess className="grid gap-2 border-t border-border p-4">
              <Input name="name" required placeholder={t("contractors.contactName")} />
              <div className="grid grid-cols-2 gap-2">
                <Input name="phone" inputMode="tel" placeholder={t("contractors.phone")} />
                <Input name="role" placeholder={t("contractors.contactRole")} />
              </div>
              <SubmitButton variant="secondary">{t("common.add")}</SubmitButton>
            </ActionForm>
          )}
        </Card>
        <Card>
          <CardHeader title={t("contractors.scoreHistory")} subtitle={t("contractors.scoreHistoryHint")} />
          {history.length === 0 ? (
            <Empty>{t("common.noData")}</Empty>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between px-5 py-2">
                  <span className="text-xs text-muted">{formatDateTime(h.at)}</span>
                  <span className="flex gap-3">
                    <RatingValue rating={Number(h.rating)} />
                    <ReliabilityValue value={Number(h.reliability)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={t("contractors.documents")} subtitle={t("contractors.documentsHint")} />
        <div className="p-5">
          <Attachments entityType="contractor" entityId={id} canUpload={can(user, "contractors.edit")} />
        </div>
      </Card>
    </>
  );
}
