import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { roleLabel } from "@/lib/roles";
import { formatDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { CreateUserForm, ResetPasswordButton } from "./otp-forms";
import { createUser, resetPassword, resetTwoFactor, updateUser } from "./actions";

export default async function UsersPage() {
  const me = await requirePermission("users.manage");
  const t = await getTranslations();
  const [users, roles] = await Promise.all([
    db.user.findMany({
      where: { companyId: me.companyId },
      include: { roleDef: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    db.roleDef.findMany({ where: { companyId: me.companyId }, orderBy: { sortOrder: "asc" } }),
  ]);
  const roleOptions = roles.map((r) => (
    <option key={r.id} value={r.id}>
      {roleLabel(t, r)}
    </option>
  ));

  return (
    <>
      <PageHeader
        title={t("users.title")}
        subtitle={t("users.subtitle")}
        actions={
          <Link href="/settings/roles" className="text-sm text-primary hover:underline">
            {t("roles.manage")} →
          </Link>
        }
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title={t("users.new")} subtitle={t("users.newHint")} />
          <CreateUserForm action={createUser}>
            <Field label={t("users.name")} required>
              <Input name="name" required />
            </Field>
            <Field label={t("users.phone")} hint={t("users.phoneHint")}>
              <Input name="phone" type="tel" placeholder="+998 90 123 45 67" />
            </Field>
            <Field label={t("users.email")}>
              <Input name="email" type="email" autoComplete="off" />
            </Field>
            <Field label={t("users.position")}>
              <Input name="position" />
            </Field>
            <Field label={t("users.role")} required>
              <Select name="roleId" required defaultValue={roles.find((r) => r.key === "WORKER")?.id}>
                {roleOptions}
              </Select>
            </Field>
            <Field label={t("users.oneTimePassword")} hint={t("users.oneTimePasswordHint")}>
              <Input name="password" autoComplete="off" placeholder={t("users.autoGenerate")} />
            </Field>
          </CreateUserForm>
        </Card>

        <Card>
          <Table>
            <thead>
              <tr>
                <Th>{t("users.name")}</Th>
                <Th>{t("users.login")}</Th>
                <Th>{t("users.lastLogin")}</Th>
                <Th>{t("common.actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                  <Td>
                    <div className="font-medium">
                      {u.name} {u.id === me.id && <Badge tone="primary">{t("users.you")}</Badge>}
                    </div>
                    <div className="text-xs text-muted">{roleLabel(t, u.roleDef)}</div>
                    {u.mustChangePassword && <Badge tone="warning">{t("users.mustChange")}</Badge>}
                  </Td>
                  <Td className="text-xs">
                    <div className="num">{formatPhone(u.phone)}</div>
                    <div className="text-muted">{u.email ?? ""}</div>
                  </Td>
                  <Td className="num text-xs">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</Td>
                  <Td>
                    <ActionForm action={updateUser.bind(null, u.id)} className="flex flex-wrap items-center gap-2">
                      <Input name="phone" defaultValue={u.phone ?? ""} placeholder={t("users.phone")} className="w-40" />
                      <Input name="email" defaultValue={u.email ?? ""} placeholder={t("users.email")} className="w-44" />
                      <Select name="roleId" defaultValue={u.roleId ?? ""} className="w-48">
                        {roleOptions}
                      </Select>
                      <label className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="active" defaultChecked={u.active} className="size-4" />
                        {t("users.active")}
                      </label>
                      <SubmitButton variant="secondary">{t("common.save")}</SubmitButton>
                    </ActionForm>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <ResetPasswordButton action={resetPassword.bind(null, u.id)} />
                      {u.totpEnabled && (
                        <form action={resetTwoFactor.bind(null, u.id)}>
                          <Button type="submit" variant="ghost" className="h-8 px-2 text-xs">
                            {t("users.reset2fa")}
                          </Button>
                        </form>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
