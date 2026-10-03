import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/ui";
import { ExpenseForm, ExpenseTable } from "@/components/expenses";

export async function ExpensesTab({ user, projectId }: { user: CurrentUser; projectId: string }) {
  const t = await getTranslations();
  const canEdit = can(user.role, "expenses.edit");
  const rows = await db.expense.findMany({
    where: { projectId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { createdBy: { select: { name: true } } },
  });
  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <Card>
          <CardHeader title={t("expenses.add")} />
          <ExpenseForm projectId={projectId} />
        </Card>
      )}
      <Card>
        <CardHeader title={t("expenses.title")} />
        <ExpenseTable rows={rows} canEdit={canEdit} />
      </Card>
    </div>
  );
}
