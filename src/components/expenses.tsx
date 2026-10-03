import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Expense } from "@prisma/client";
import { COST_CATEGORIES } from "@/lib/metrics";
import { recordMoney } from "@/lib/money-value";
import { formatDate, isoDate } from "@/lib/utils";
import { Empty, Field, Input, Notice, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, DeleteButton, SubmitButton } from "@/components/forms/action-form";
import { MoneyInput } from "@/components/forms/money-input";
import { Money } from "@/components/money";
import { addExpense, deleteExpense } from "@/app/(app)/projects/actions";

type Row = Expense & { createdBy: { name: string } | null; project?: { id: string; code: string; name: string } };

export async function ExpenseTable({ rows, canEdit, showProject }: { rows: Row[]; canEdit: boolean; showProject?: boolean }) {
  const t = await getTranslations();
  if (rows.length === 0) return <Empty>{t("common.noData")}</Empty>;
  return (
    <Table>
      <thead>
        <tr>
          <Th>{t("common.date")}</Th>
          {showProject && <Th>{t("expenses.project")}</Th>}
          <Th>{t("expenses.category")}</Th>
          <Th>{t("expenses.description")}</Th>
          <Th>{t("expenses.supplier")}</Th>
          <Th>{t("expenses.createdBy")}</Th>
          <Th className="text-right">{t("common.amount")}</Th>
          {canEdit && <Th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.id}>
            <Td className="num">{formatDate(e.date)}</Td>
            {showProject && (
              <Td>
                {e.project && (
                  <Link href={`/projects/${e.project.id}?tab=expenses`} className="hover:text-primary">
                    <span className="num text-muted">{e.project.code}</span> {e.project.name}
                  </Link>
                )}
              </Td>
            )}
            <Td>{t(`costCategory.${e.category}`)}</Td>
            <Td>
              {e.description}
              {e.reference && <div className="text-xs text-muted">№ {e.reference}</div>}
            </Td>
            <Td>{e.supplier ?? "—"}</Td>
            <Td className="text-muted">{e.createdBy?.name ?? "—"}</Td>
            <Td className="text-right">
              <Money size="sm" value={recordMoney(e)} />
            </Td>
            {canEdit && (
              <Td className="text-right">
                <DeleteButton action={deleteExpense} id={e.id} />
              </Td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export async function ExpenseForm({
  projectId,
  projects,
}: {
  projectId?: string;
  projects?: { id: string; code: string; name: string }[];
}) {
  const t = await getTranslations();
  return (
    <ActionForm action={addExpense} resetOnSuccess className="grid gap-4 p-5 md:grid-cols-2">
      {projectId ? (
        <input type="hidden" name="projectId" value={projectId} />
      ) : (
        <Field label={t("expenses.project")} required className="md:col-span-2">
          <Select name="projectId" required defaultValue="">
            <option value="" disabled>
              —
            </option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("common.date")} required>
          <Input name="date" type="date" required defaultValue={isoDate(new Date())} />
        </Field>
        <Field label={t("expenses.category")} required>
          <Select name="category" defaultValue="MATERIAL">
            {COST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`costCategory.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <MoneyInput label={t("common.amount")} />
      <Field label={t("expenses.description")} required>
        <Input name="description" required />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("expenses.supplier")}>
          <Input name="supplier" />
        </Field>
        <Field label={t("expenses.reference")}>
          <Input name="reference" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <SubmitButton>{t("expenses.add")}</SubmitButton>
        <Notice>{t("expenses.attachmentSoon")}</Notice>
      </div>
    </ActionForm>
  );
}
