import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Task } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatNumber, formatQty } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { cn, formatDate, isoDate } from "@/lib/utils";
import { Badge, Card, CardHeader, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { AvailabilityBadge, OutsourceStatusBadge, RatingValue, ReliabilityValue } from "@/components/contractor-bits";
import { contractorScores, contractorWorkload } from "@/server/contractors/score";
import { addContractorPayment, assignContractor, outsourceStep, updateOutsource } from "@/app/(app)/contractors/actions";

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Outsource work of a task: contractor terms, plan / agreed / actual / paid / remaining, verification and choosing a contractor. */
export async function OutsourcePanel({ user, task, workTypeName }: { user: CurrentUser; task: Task; workTypeName: string | null }) {
  const t = await getTranslations();
  const manage = can(user, "tasks.manage") || can(user, "contractors.edit");
  const record = manage || can(user, "outsource.verify") || can(user, "sessions.record");
  const verify = can(user, "outsource.verify");
  const pay = can(user, "contractorPayments.edit");
  const showMoney = can(user, "finance.view") || pay || manage;
  const closed = task.status === "APPROVED" || task.status === "CANCELLED";

  const assignments = await db.taskAssignment.findMany({
    where: { taskId: task.id, kind: "CONTRACTOR" },
    include: { contractor: true, payments: { orderBy: { date: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
  if (assignments.length === 0 && (!manage || closed) && !can(user, "contractors.view")) return null;

  // Candidates for choosing: matching specialization first, facts side by side (no "best" verdict).
  const candidates = manage && !closed ? await db.contractor.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" } }) : [];
  const ids = candidates.map((c) => c.id);
  const [scores, workload, prices] = await Promise.all([
    ids.length ? contractorScores(user.companyId, ids) : Promise.resolve(new Map()),
    ids.length ? contractorWorkload(user.companyId) : Promise.resolve(new Map()),
    ids.length && task.workTypeId
      ? db.taskAssignment.findMany({
          where: { kind: "CONTRACTOR", contractorId: { in: ids }, outsourceStatus: "VERIFIED", task: { workTypeId: task.workTypeId }, completedQty: { gt: 0 } },
          select: { contractorId: true, actualUzs: true, agreedUzs: true, completedQty: true },
        })
      : Promise.resolve([]),
  ]);
  const unitPrice = new Map<string, number[]>();
  for (const p of prices) {
    const v = n(p.actualUzs ?? p.agreedUzs) / n(p.completedQty);
    if (v > 0) unitPrice.set(p.contractorId!, [...(unitPrice.get(p.contractorId!) ?? []), v]);
  }
  const ranked = candidates
    .map((c) => ({ c, s: scores.get(c.id), w: workload.get(c.id), match: workTypeName ? c.specializations.includes(workTypeName) : false, price: unitPrice.get(c.id) }))
    .filter((x) => x.c.availability !== "BLACKLISTED")
    .sort((a, b) => Number(b.match) - Number(a.match) || a.c.name.localeCompare(b.c.name));
  const matching = ranked.filter((r) => r.match);
  const table = matching.length ? matching : ranked.slice(0, 8);

  return (
    <Card>
      <CardHeader title={t("outsource.title")} subtitle={t("outsource.subtitle")} />
      {assignments.length === 0 && <p className="px-5 py-4 text-sm text-muted">{t("outsource.none")}</p>}
      <div className="divide-y divide-border">
        {assignments.map((a) => {
          const paid = a.payments.filter((p) => p.approval === "APPROVED").reduce((s, p) => s + n(p.amountUzs), 0);
          const owed = n(a.actualUzs ?? a.agreedUzs);
          const s = a.outsourceStatus ?? "ASSIGNED";
          const step = outsourceStep.bind(null, a.id);
          return (
            <div key={a.id} className="px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/contractors/${a.contractorId}`} className="font-medium hover:text-primary">
                  {a.contractor?.name}
                </Link>
                <OutsourceStatusBadge status={a.outsourceStatus} />
                {a.reworkCount > 0 && <Badge tone="danger">{t("contractors.reworkTimes", { n: String(a.reworkCount) })}</Badge>}
                {a.qualityScore && <Badge tone="success">★ {a.qualityScore}</Badge>}
                <span className="ml-auto text-xs text-muted">
                  {a.contactName}
                  {a.contactPhone && (
                    <a href={`tel:+${a.contactPhone}`} className="num ml-1 hover:text-primary">
                      {formatPhone(a.contactPhone)}
                    </a>
                  )}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
                {(
                  [
                    [t("outsource.qty"), `${a.completedQty ? formatQty(n(a.completedQty)) : "0"} / ${a.plannedQty ? formatQty(n(a.plannedQty)) : "—"} ${task.unit ?? ""}`],
                    ...(showMoney
                      ? [
                          [t("outsource.planned"), a.plannedCostUzs ? formatNumber(n(a.plannedCostUzs)) : "—"],
                          [t("contractors.agreed"), a.agreedAmount ? `${formatNumber(n(a.agreedAmount))} ${a.currency}` : "—"],
                          [t("contractors.actual"), a.actualUzs ? formatNumber(n(a.actualUzs)) : "—"],
                          [t("contractors.paid"), formatNumber(paid)],
                          [t("outsource.remaining"), formatNumber(Math.max(0, owed - paid))],
                        ]
                      : []),
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs text-muted">{k}</div>
                    <div className="num">{v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-xs text-muted">
                {formatDate(a.startDate)} → {formatDate(a.deadline)}
                {a.completedAt && (
                  <span className={cn(a.deadline && a.completedAt > new Date(a.deadline.getTime() + 86399999) ? "text-danger" : "")}> · ✓ {formatDate(a.completedAt)}</span>
                )}
                {a.note && ` · ${a.note}`}
              </div>

              {!closed && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  {s === "ASSIGNED" && record && (
                    <ActionForm action={step}>
                      <input type="hidden" name="step" value="START" />
                      <SubmitButton variant="secondary">{t("outsource.start")}</SubmitButton>
                    </ActionForm>
                  )}
                  {(s === "ASSIGNED" || s === "IN_PROGRESS") && record && (
                    <ActionForm action={step} className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
                      <input type="hidden" name="step" value="COMPLETE" />
                      <Field label={`${t("outsource.doneQty")} (${task.unit ?? ""})`}>
                        <Input name="completedQty" inputMode="decimal" defaultValue={a.plannedQty ? String(n(a.plannedQty)) : ""} className="w-24" />
                      </Field>
                      {showMoney && (
                        <Field label={`${t("contractors.actual")} (${a.currency})`}>
                          <Input name="actualAmount" inputMode="decimal" defaultValue={a.agreedAmount ? String(n(a.agreedAmount)) : ""} className="w-36" />
                        </Field>
                      )}
                      <Field label={t("common.date")}>
                        <Input type="date" name="completedAt" defaultValue={isoDate(new Date())} className="w-36" />
                      </Field>
                      <SubmitButton>{t("outsource.complete")}</SubmitButton>
                    </ActionForm>
                  )}
                  {s === "COMPLETED" && verify && (
                    <>
                      <ActionForm action={step} className="flex flex-wrap items-end gap-2 rounded-lg border border-success/40 p-2">
                        <input type="hidden" name="step" value="VERIFY" />
                        <Field label={t("contractors.quality")}>
                          <Select name="qualityScore" defaultValue="5" className="w-24">
                            {[5, 4, 3, 2, 1].map((q) => (
                              <option key={q} value={q}>
                                ★ {q}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={t("common.note")}>
                          <Input name="note" className="w-48" />
                        </Field>
                        <SubmitButton>{t("outsource.verify")}</SubmitButton>
                      </ActionForm>
                      <ActionForm action={step} className="flex flex-wrap items-end gap-2 rounded-lg border border-danger/40 p-2">
                        <input type="hidden" name="step" value="REJECT" />
                        <Field label={t("outsource.rejectReason")}>
                          <Input name="note" required className="w-56" />
                        </Field>
                        <SubmitButton variant="secondary">{t("outsource.reject")}</SubmitButton>
                      </ActionForm>
                    </>
                  )}
                  {s === "REJECTED" && record && (
                    <ActionForm action={step}>
                      <input type="hidden" name="step" value="RESUME" />
                      <SubmitButton variant="secondary">{t("outsource.resume")}</SubmitButton>
                    </ActionForm>
                  )}
                  {["ASSIGNED", "IN_PROGRESS", "REJECTED"].includes(s) && manage && (
                    <ActionForm action={step}>
                      <input type="hidden" name="step" value="CANCEL" />
                      <SubmitButton variant="secondary">{t("outsource.cancel")}</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              )}

              {(pay || (manage && !["VERIFIED", "CANCELLED"].includes(s))) && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-primary">{t("outsource.moreActions")}</summary>
                  <div className="mt-2 grid gap-3 lg:grid-cols-2">
                    {pay && s !== "CANCELLED" && (
                      <ActionForm action={addContractorPayment.bind(null, a.contractorId!)} resetOnSuccess className="grid gap-2 rounded-lg border border-border p-3">
                        <div className="text-xs font-semibold">{t("outsource.addPayment")}</div>
                        <input type="hidden" name="assignmentId" value={a.id} />
                        <MoneyInput label={t("common.amount")} defaultCurrency={a.currency} />
                        <div className="grid grid-cols-2 gap-2">
                          <Input type="date" name="date" defaultValue={isoDate(new Date())} />
                          <Select name="method" defaultValue="CASH">
                            {(["CASH", "BANK", "CARD", "OTHER"] as const).map((m) => (
                              <option key={m} value={m}>
                                {t(`paymentMethod.${m}`)}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <SubmitButton variant="secondary">{t("common.add")}</SubmitButton>
                      </ActionForm>
                    )}
                    {manage && !["VERIFIED", "CANCELLED"].includes(s) && (
                      <ActionForm action={updateOutsource.bind(null, a.id)} className="grid gap-2 rounded-lg border border-border p-3">
                        <div className="text-xs font-semibold">{t("outsource.changeTerms")}</div>
                        <MoneyInput label={t("contractors.agreed")} defaultAmount={a.agreedAmount ? String(n(a.agreedAmount)) : ""} defaultCurrency={a.currency} required={false} vat defaultVat={n(a.vatRate)} />
                        <div className="grid grid-cols-2 gap-2">
                          <Field label={t("outsource.qty")}>
                            <Input name="plannedQty" inputMode="decimal" defaultValue={a.plannedQty ? String(n(a.plannedQty)) : ""} />
                          </Field>
                          <Field label={t("tasks.deadline")}>
                            <Input type="date" name="deadline" defaultValue={isoDate(a.deadline)} />
                          </Field>
                        </div>
                        <Input name="note" placeholder={t("outsource.changeReason")} />
                        <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {manage && !closed && (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-primary">+ {t("outsource.assign")}</summary>
          <div className="px-5 pb-5">
            <p className="mb-2 text-xs text-muted">
              {matching.length ? t("outsource.candidatesFor", { type: workTypeName ?? "" }) : t("outsource.candidatesAll")} {t("contractors.factsHint")}
            </p>
            {table.length > 0 && (
              <Table className="mb-4">
                <thead>
                  <tr>
                    <Th>{t("contractors.name")}</Th>
                    <Th>{t("contractors.availabilityLabel")}</Th>
                    <Th className="text-right">{t("contractors.rating")}</Th>
                    <Th className="text-right">{t("contractors.reliability")}</Th>
                    <Th className="text-right">{t("contractors.doneTasks")}</Th>
                    <Th className="text-right">{t("contractors.onTime")}</Th>
                    <Th className="text-right">{t("contractors.avgQuality")}</Th>
                    <Th className="text-right">{t("outsource.unitPrice", { unit: task.unit ?? "" })}</Th>
                  </tr>
                </thead>
                <tbody>
                  {table.map(({ c, s, w, price }) => (
                    <tr key={c.id}>
                      <Td>
                        <Link href={`/contractors/${c.id}`} className="font-medium hover:text-primary" target="_blank">
                          {c.name}
                        </Link>
                        <div className="text-xs text-muted">{c.regions.join(", ")}</div>
                      </Td>
                      <Td>
                        <AvailabilityBadge availability={c.availability} busy={w?.tasks} />
                      </Td>
                      <Td className="text-right">
                        <RatingValue rating={s?.rating} />
                      </Td>
                      <Td className="text-right">
                        <ReliabilityValue value={s?.reliability} />
                      </Td>
                      <Td className="num text-right">{s?.stats.verified ?? 0}</Td>
                      <Td className="num text-right">{s?.stats.withDeadline ? `${Math.round((s.stats.onTime / s.stats.withDeadline) * 100)}%` : "—"}</Td>
                      <Td className="num text-right">{s?.stats.avgQuality ? s.stats.avgQuality.toFixed(1) : "—"}</Td>
                      <Td className="num text-right text-xs">
                        {price ? `${formatNumber(Math.min(...price))}${price.length > 1 ? ` – ${formatNumber(Math.max(...price))}` : ""}` : "—"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <ActionForm action={assignContractor.bind(null, task.id)} className="grid gap-3 md:grid-cols-2">
              <Field label={t("outsource.contractor")} required>
                <Select name="contractorId" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {ranked.map(({ c, w }) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {w ? ` (${t("availability.busyTasks", { n: String(w.tasks) })})` : c.availability !== "AVAILABLE" ? ` (${t(`availability.${c.availability}`)})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("outsource.contactName")}>
                  <Input name="contactName" />
                </Field>
                <Field label={t("contractors.phone")}>
                  <Input name="contactPhone" inputMode="tel" placeholder={t("outsource.phoneFromCard")} />
                </Field>
              </div>
              <MoneyInput label={t("contractors.agreed")} required={false} vat />
              <div className="grid grid-cols-2 gap-2">
                <Field label={`${t("outsource.qty")} (${task.unit ?? ""})`}>
                  <Input name="plannedQty" inputMode="decimal" defaultValue={task.plannedQty ? String(n(task.plannedQty)) : ""} />
                </Field>
                <Field label={t("outsource.planned")} hint={t("outsource.plannedHint")}>
                  <Input name="plannedCostUzs" inputMode="decimal" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("tasks.startDate")}>
                  <Input type="date" name="startDate" defaultValue={isoDate(task.startDate ?? new Date())} />
                </Field>
                <Field label={t("tasks.deadline")}>
                  <Input type="date" name="deadline" defaultValue={isoDate(task.deadline)} />
                </Field>
              </div>
              <Field label={t("common.note")}>
                <Input name="note" />
              </Field>
              <div className="md:col-span-2">
                <SubmitButton>{t("outsource.assignBtn")}</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </details>
      )}
    </Card>
  );
}
