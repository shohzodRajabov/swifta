import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { createRole } from "./actions";

export default async function RolesPage() {
  const me = await requirePermission("roles.manage");
  const t = await getTranslations();
  const roles = await db.roleDef.findMany({
    where: { companyId: me.companyId },
    include: { _count: { select: { users: true } } },
    orderBy: { sortOrder: "asc" },
  });
  return (
    <>
      <PageHeader
        title={t("roles.title")}
        subtitle={t("roles.subtitle")}
        back={{ href: "/settings/users", label: t("users.title") }}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>{t("roles.name")}</Th>
                <Th className="text-right">{t("roles.permissions")}</Th>
                <Th className="text-right">{t("roles.users")}</Th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/settings/roles/${r.id}`} className="font-medium hover:text-primary">
                      {roleLabel(t, r)}
                    </Link>
                    {r.isSystem ? <Badge className="ml-2">{t("roles.system")}</Badge> : <Badge tone="primary" className="ml-2">{t("roles.custom")}</Badge>}
                    {r.description && <div className="text-xs text-muted">{r.description}</div>}
                  </Td>
                  <Td className="num text-right">
                    {r.permissions.length} / {PERMISSIONS.length}
                  </Td>
                  <Td className="num text-right">{r._count.users}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="self-start">
          <CardHeader title={t("roles.new")} />
          <ActionForm action={createRole} className="flex flex-col gap-4 p-5">
            <Field label={t("roles.name")} required>
              <Input name="name" required />
            </Field>
            <Field label={t("roles.copyFrom")}>
              <Select name="copyFrom" defaultValue="">
                <option value="">—</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {roleLabel(t, r)}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <SubmitButton>{t("common.create")}</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
