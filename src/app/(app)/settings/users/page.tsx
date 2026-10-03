import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { ROLES } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { createUser, updateUser } from "./actions";

export default async function UsersPage() {
  const me = await requirePermission("users.manage");
  const t = await getTranslations();
  const users = await db.user.findMany({ where: { companyId: me.companyId }, orderBy: [{ active: "desc" }, { name: "asc" }] });

  return (
    <>
      <PageHeader title={t("users.title")} />
      <div className="flex flex-col gap-6">
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>{t("users.name")}</Th>
                <Th>{t("users.email")}</Th>
                <Th>{t("users.role")}</Th>
                <Th>{t("common.status")}</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                  <Td>
                    <div className="font-medium">
                      {u.name} {u.id === me.id && <Badge tone="primary">{t("users.you")}</Badge>}
                    </div>
                    {u.position && <div className="text-xs text-muted">{u.position}</div>}
                  </Td>
                  <Td>{u.email}</Td>
                  <Td colSpan={2}>
                    <ActionForm action={updateUser.bind(null, u.id)} className="flex flex-wrap items-center gap-2">
                      <Select name="role" defaultValue={u.role} className="w-52">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`roles.${r}`)}
                          </option>
                        ))}
                      </Select>
                      <label className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="active" defaultChecked={u.active} className="size-4" />
                        {t("users.active")}
                      </label>
                      <Input
                        name="password"
                        type="password"
                        placeholder={t("users.newPassword")}
                        autoComplete="new-password"
                        className="w-40"
                      />
                      <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
                    </ActionForm>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title={t("users.new")} />
          <ActionForm action={createUser} resetOnSuccess className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("users.name")} required>
              <Input name="name" required />
            </Field>
            <Field label={t("users.email")} required>
              <Input name="email" type="email" required autoComplete="off" />
            </Field>
            <Field label={t("users.role")} required>
              <Select name="role" defaultValue="PROJECT_MANAGER">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("users.position")}>
              <Input name="position" />
            </Field>
            <Field label={t("users.phone")}>
              <Input name="phone" type="tel" placeholder="+998" />
            </Field>
            <Field label={t("users.password")} hint={t("users.passwordHint")} required>
              <Input name="password" type="password" minLength={8} required autoComplete="new-password" />
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>{t("common.create")}</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
