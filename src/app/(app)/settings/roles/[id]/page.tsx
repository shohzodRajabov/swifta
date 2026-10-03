import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSION_GROUPS } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { Card, Field, Input, Notice, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ConfirmForm } from "@/components/forms/confirm-form";
import { deleteRole, updateRole } from "../actions";

export default async function RolePage({ params }: PageProps<"/settings/roles/[id]">) {
  const { id } = await params;
  const me = await requirePermission("roles.manage");
  const role = await db.roleDef.findFirst({
    where: { id, companyId: me.companyId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) notFound();
  const t = await getTranslations();
  const locked = role.key === "ADMIN";

  return (
    <>
      <PageHeader
        title={roleLabel(t, role)}
        back={{ href: "/settings/roles", label: t("roles.title") }}
        actions={
          !role.isSystem &&
          role._count.users === 0 && <ConfirmForm action={deleteRole} id={role.id} label={t("common.delete")} />
        }
      />
      <ActionForm action={updateRole.bind(null, role.id)} className="flex max-w-5xl flex-col gap-6">
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label={t("roles.name")} required>
            <Input name="name" defaultValue={role.name} required disabled={role.isSystem} />
          </Field>
          <Field label={t("roles.description")}>
            <Input name="description" defaultValue={role.description ?? ""} />
          </Field>
          {role.isSystem && <input type="hidden" name="name" value={role.name} />}
        </Card>
        {locked && <Notice tone="primary">{t("roles.adminLocked")}</Notice>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
            <Card key={group} className="p-4">
              <h3 className="mb-2 text-sm font-semibold">{t(`permGroup.${group}`)}</h3>
              <div className="flex flex-col gap-1.5">
                {perms.map((p) => (
                  <label key={p} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="perm"
                      value={p}
                      defaultChecked={role.permissions.includes(p)}
                      disabled={locked}
                      className="mt-0.5 size-4"
                    />
                    <span>{t(`perm.${p}`)}</span>
                  </label>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <div>
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
