import { getTranslations } from "next-intl/server";
import type { Project } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import type { ProjectMetrics } from "@/lib/metrics";
import { recordMoney } from "@/lib/money-value";
import { allocatePayments } from "@/lib/schedule";
import { formatDate, isoDate, toDateOnly } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Money } from "@/components/money";
import { projectVatRate } from "@/server/projects/defaults";
import {
  addAct,
  addAmendment,
  addMilestone,
  addPayment,
  deleteAmendment,
  deleteMilestone,
  deletePayment,
  setActStatus,
} from "@/app/(app)/projects/actions";

const ACT_TONE = { DRAFT: "warning", SIGNED: "success", CANCELLED: "neutral" } as const;

export async function RevenueTab({
  user,
  project,
  metrics: m,
}: {
  user: CurrentUser;
  project: Project;
  metrics: ProjectMetrics;
}) {
  const t = await getTranslations();
  const projectId = project.id;
  const canPay = can(user, "payments.edit");
  const canActs = can(user, "acts.edit");
  const canContract = can(user, "projects.edit");
  const [milestones, payments, acts, amendments, defaultVat] = await Promise.all([
    db.paymentMilestone.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } }),
    db.clientPayment.findMany({ where: { projectId }, orderBy: { date: "desc" }, include: { milestone: true } }),
    db.act.findMany({ where: { projectId }, orderBy: { date: "desc" } }),
    db.contractAmendment.findMany({ where: { projectId }, orderBy: { date: "asc" } }),
    projectVatRate(projectId),
  ]);
  const today = toDateOnly(new Date());
  const rows = allocatePayments(milestones, payments, today);
  const pctTotal = milestones.reduce((s, ms) => s + Number(ms.percent), 0);
  const vatLabel = (v: number) => (v > 0 ? `${t("common.vat")} ${formatNumber(v, 0)}%` : t("common.noVat"));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {(
          [
            ["finance.contractBase", m.contract],
            ["finance.amendments", m.amendments],
            ["finance.contractTotal", m.contractTotalGross],
            ["finance.actsSigned", m.actsGross],
            ["finance.received", m.received],
            ["finance.receivable", m.receivable],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} className="p-4">
            <div className="mb-1 text-xs text-muted">{t(label)}</div>
            <Money value={value} align="left" />
          </Card>
        ))}
      </div>

      {/* Acts of completed works */}
      <Card>
        <CardHeader title={t("finance.acts")} subtitle={t("finance.actsHint")} />
        {acts.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("finance.actNumber")}</Th>
                <Th>{t("common.date")}</Th>
                <Th>{t("finance.period")}</Th>
                <Th>{t("common.status")}</Th>
                <Th className="text-right">{t("common.amount")}</Th>
                {canActs && <Th />}
              </tr>
            </thead>
            <tbody>
              {acts.map((a) => (
                <tr key={a.id}>
                  <Td className="num font-medium">{a.number}</Td>
                  <Td className="num">{formatDate(a.date)}</Td>
                  <Td className="num text-xs">
                    {a.periodFrom || a.periodTo ? `${formatDate(a.periodFrom)} — ${formatDate(a.periodTo)}` : "—"}
                  </Td>
                  <Td>
                    <Badge tone={ACT_TONE[a.status]}>{t(`actStatus.${a.status}`)}</Badge>
                  </Td>
                  <Td className="text-right">
                    <Money size="sm" value={recordMoney(a)} />
                    <div className="text-[11px] text-muted">{vatLabel(Number(a.vatRate))}</div>
                  </Td>
                  {canActs && (
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        {a.status === "DRAFT" && (
                          <form action={setActStatus}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="status" value="SIGNED" />
                            <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                              {t("finance.sign")}
                            </Button>
                          </form>
                        )}
                        {a.status === "SIGNED" && (
                          <form action={setActStatus}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="status" value="CANCELLED" />
                            <Button type="submit" variant="ghost" className="h-7 px-2 text-xs">
                              {t("finance.cancelAct")}
                            </Button>
                          </form>
                        )}
                        {a.status !== "SIGNED" && (
                          <form action={setActStatus}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="status" value="DELETE" />
                            <Button type="submit" variant="danger" className="h-7 px-2 text-xs">
                              {t("common.delete")}
                            </Button>
                          </form>
                        )}
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {canActs && (
          <ActionForm action={addAct.bind(null, projectId)} resetOnSuccess className="grid gap-4 border-t border-border p-5 md:grid-cols-2">
            <div className="grid grid-cols-3 gap-2">
              <Field label={t("finance.actNumber")}>
                <Input name="number" placeholder={`AKT-${acts.length + 1}`} />
              </Field>
              <Field label={t("common.date")} required>
                <Input name="date" type="date" required defaultValue={isoDate(today)} />
              </Field>
              <Field label={t("finance.periodTo")}>
                <Input name="periodTo" type="date" />
              </Field>
            </div>
            <MoneyInput label={t("common.amount")} vat defaultVat={defaultVat} />
            <Field label={t("common.note")}>
              <Input name="note" />
            </Field>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name="signed" className="size-4" />
                {t("finance.signedNow")}
              </label>
              <SubmitButton>{t("finance.addAct")}</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Card>

      {/* Additional agreements */}
      <Card>
        <CardHeader title={t("finance.amendments")} subtitle={t("finance.amendmentsHint")} />
        {amendments.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>№</Th>
                <Th>{t("common.date")}</Th>
                <Th>{t("finance.description")}</Th>
                <Th className="text-right">{t("common.amount")}</Th>
                {canContract && <Th />}
              </tr>
            </thead>
            <tbody>
              {amendments.map((a) => (
                <tr key={a.id}>
                  <Td className="num">{a.number}</Td>
                  <Td className="num">{formatDate(a.date)}</Td>
                  <Td>{a.description}</Td>
                  <Td className="text-right">
                    <Money size="sm" value={recordMoney(a)} tone="auto" />
                  </Td>
                  {canContract && (
                    <Td className="text-right">
                      <DeleteButton action={deleteAmendment} id={a.id} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {canContract && (
          <ActionForm action={addAmendment.bind(null, projectId)} resetOnSuccess className="grid gap-4 border-t border-border p-5 md:grid-cols-2">
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <Field label="№">
                <Input name="number" placeholder={String(amendments.length + 1)} />
              </Field>
              <Field label={t("common.date")} required>
                <Input name="date" type="date" required defaultValue={isoDate(today)} />
              </Field>
            </div>
            <MoneyInput label={t("finance.amendmentAmount")} vat defaultVat={defaultVat} />
            <Field label={t("finance.description")} required>
              <Input name="description" required placeholder={t("finance.amendmentPlaceholder")} />
            </Field>
            <div className="flex items-end">
              <SubmitButton variant="secondary">{t("finance.addAmendment")}</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Card>

      {/* Payment schedule */}
      <Card>
        <CardHeader
          title={t("payments.schedule")}
          action={<span className="num text-xs text-muted">{t("payments.scheduleTotal", { p: formatNumber(pctTotal, 0) })}</span>}
        />
        {rows.length === 0 ? (
          <Empty>{t("payments.template")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("payments.milestone")}</Th>
                <Th className="text-right">%</Th>
                <Th>{t("payments.dueDate")}</Th>
                <Th className="text-right">{t("payments.planned")}</Th>
                <Th className="text-right">{t("payments.paid")}</Th>
                <Th className="text-right">{t("payments.remaining")}</Th>
                {canPay && <Th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ms.id}>
                  <Td className="font-medium">
                    {r.ms.name}
                    {r.overdue && (
                      <Badge tone="danger" className="ml-2">
                        {t("payments.overdue")}
                      </Badge>
                    )}
                  </Td>
                  <Td className="num text-right">{formatNumber(Number(r.ms.percent), 0)}%</Td>
                  <Td className="num">{formatDate(r.ms.dueDate)}</Td>
                  <Td className="text-right">
                    <Money size="sm" value={r.planned} />
                  </Td>
                  <Td className="text-right">
                    <Money size="sm" value={r.paid} />
                  </Td>
                  <Td className="text-right">
                    <Money size="sm" value={r.remaining} />
                  </Td>
                  {canPay && (
                    <Td className="text-right">
                      <DeleteButton action={deleteMilestone} id={r.ms.id} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {canPay && (
          <ActionForm
            action={addMilestone.bind(null, projectId)}
            resetOnSuccess
            className="grid gap-3 border-t border-border p-5 sm:grid-cols-[1fr_8rem_10rem_auto] sm:items-end"
          >
            <Field label={t("payments.milestone")} required>
              <Input name="name" required placeholder="Avans" />
            </Field>
            <Field label={t("payments.percentOfContract")} required>
              <Input name="percent" inputMode="decimal" required placeholder="30" />
            </Field>
            <Field label={t("payments.dueDate")}>
              <Input name="dueDate" type="date" />
            </Field>
            <SubmitButton variant="secondary">{t("payments.addMilestone")}</SubmitButton>
          </ActionForm>
        )}
      </Card>

      {/* Payments received */}
      <Card>
        <CardHeader title={t("payments.received")} />
        {payments.length === 0 ? (
          <Empty>{t("common.noData")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("common.date")}</Th>
                <Th>{t("payments.milestone")}</Th>
                <Th>{t("payments.method")}</Th>
                <Th>{t("payments.reference")}</Th>
                <Th className="text-right">{t("common.amount")}</Th>
                {canPay && <Th />}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <Td className="num">{formatDate(p.date)}</Td>
                  <Td>{p.milestone?.name ?? <span className="text-muted">{t("payments.noMilestone")}</span>}</Td>
                  <Td>{t(`paymentMethod.${p.method}`)}</Td>
                  <Td>{p.reference ?? "—"}</Td>
                  <Td className="text-right">
                    <Money size="sm" value={recordMoney(p)} />
                  </Td>
                  {canPay && (
                    <Td className="text-right">
                      <DeleteButton action={deletePayment} id={p.id} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {canPay && (
          <ActionForm action={addPayment.bind(null, projectId)} resetOnSuccess className="grid gap-4 border-t border-border p-5 md:grid-cols-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("common.date")} required>
                <Input name="date" type="date" required defaultValue={isoDate(today)} />
              </Field>
              <Field label={t("payments.method")}>
                <Select name="method" defaultValue="BANK">
                  {(["BANK", "CASH", "CARD", "OTHER"] as const).map((x) => (
                    <option key={x} value={x}>
                      {t(`paymentMethod.${x}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <MoneyInput label={t("common.amount")} />
            <Field label={t("payments.milestone")}>
              <Select name="milestoneId" defaultValue="">
                <option value="">{t("payments.noMilestone")}</option>
                {milestones.map((ms) => (
                  <option key={ms.id} value={ms.id}>
                    {ms.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("payments.reference")}>
              <Input name="reference" />
            </Field>
            <div className="md:col-span-2">
              <SubmitButton>{t("payments.addPayment")}</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}
