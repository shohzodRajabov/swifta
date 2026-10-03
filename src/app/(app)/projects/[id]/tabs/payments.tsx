import { getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import type { ProjectMetrics } from "@/lib/metrics";
import { recordMoney } from "@/lib/money-value";
import { formatDate, isoDate, toDateOnly } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { Badge, Card, CardHeader, Empty, Field, Input, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Money } from "@/components/money";
import { addMilestone, addPayment, deleteMilestone, deletePayment } from "@/app/(app)/projects/actions";

type MilestoneRow = { id: string; amountUzs: Prisma.Decimal; amountUsd: Prisma.Decimal; dueDate: Date | null };

/** Allocate received money to milestones in schedule order (explicitly linked payments first). */
function allocate<M extends MilestoneRow>(
  milestones: M[],
  payments: { milestoneId: string | null; amountUzs: Prisma.Decimal }[],
  today: Date,
) {
  let pool = payments.filter((p) => !p.milestoneId).reduce((s, p) => s + Number(p.amountUzs), 0);
  return milestones.map((ms) => {
    const linked = payments.filter((p) => p.milestoneId === ms.id).reduce((s, p) => s + Number(p.amountUzs), 0);
    const planned = Number(ms.amountUzs);
    let paid = Math.min(linked, planned);
    pool += linked - paid;
    const take = Math.min(pool, planned - paid);
    paid += take;
    pool -= take;
    const remaining = planned - paid;
    const ratio = planned > 0 ? Number(ms.amountUsd) / planned : 0;
    return {
      ms,
      planned: { uzs: planned, usd: Number(ms.amountUsd), count: 1 },
      paid: { uzs: paid, usd: paid * ratio, count: 1 },
      remaining: { uzs: remaining, usd: remaining * ratio, count: 1 },
      overdue: remaining > 0.5 && !!ms.dueDate && ms.dueDate < today,
    };
  });
}

export async function PaymentsTab({
  user,
  projectId,
  metrics: m,
}: {
  user: CurrentUser;
  projectId: string;
  metrics: ProjectMetrics;
}) {
  const t = await getTranslations();
  const canEdit = can(user.role, "payments.edit");
  const [milestones, payments] = await Promise.all([
    db.paymentMilestone.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } }),
    db.clientPayment.findMany({ where: { projectId }, orderBy: { date: "desc" }, include: { milestone: true } }),
  ]);
  const today = toDateOnly(new Date());

  const rows = allocate(milestones, payments, today);
  const pctTotal = milestones.reduce((s, ms) => s + Number(ms.percent), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {(
          [
            ["projects.contractAmount", m.contract],
            ["payments.paid", m.received],
            ["payments.remaining", m.clientDebt],
            ["payments.overdue", m.overdueDebt],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} className="p-4">
            <div className="mb-1 text-xs text-muted">{t(label)}</div>
            <Money value={value} align="left" />
          </Card>
        ))}
      </div>

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
                {canEdit && <Th />}
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
                  {canEdit && (
                    <Td className="text-right">
                      <DeleteButton action={deleteMilestone} id={r.ms.id} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {canEdit && (
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
                {canEdit && <Th />}
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
                  {canEdit && (
                    <Td className="text-right">
                      <DeleteButton action={deletePayment} id={p.id} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {canEdit && (
          <ActionForm
            action={addPayment.bind(null, projectId)}
            resetOnSuccess
            className="grid gap-4 border-t border-border p-5 md:grid-cols-2"
          >
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
