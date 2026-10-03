import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Building, DatabaseBackup, FileStack, KeyRound, ListChecks, ScrollText, Send, Settings2, Users, FlaskConical } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import { Card, PageHeader } from "@/components/ui";

const ITEMS: { href: string; key: string; icon: typeof Users; perm: Permission }[] = [
  { href: "/settings/company", key: "company", icon: Settings2, perm: "settings.manage" },
  { href: "/settings/firms", key: "firms", icon: Building, perm: "settings.manage" },
  { href: "/settings/statuses", key: "statuses", icon: ListChecks, perm: "settings.manage" },
  { href: "/settings/users", key: "users", icon: Users, perm: "users.manage" },
  { href: "/settings/roles", key: "roles", icon: KeyRound, perm: "roles.manage" },
  { href: "/settings/work-types", key: "workTypes", icon: FileStack, perm: "settings.manage" },
  { href: "/settings/telegram", key: "telegram", icon: Send, perm: "settings.manage" },
  { href: "/settings/backups", key: "backups", icon: DatabaseBackup, perm: "backups.manage" },
  { href: "/settings/demo", key: "demo", icon: FlaskConical, perm: "demo.access" },
  { href: "/settings/audit", key: "audit", icon: ScrollText, perm: "audit.view" },
];

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");
  const items = ITEMS.filter((i) => can(user, i.perm));
  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href}>
            <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-primary/40 hover:bg-primary-soft/30">
              <i.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <div className="font-medium">{t(`${i.key}.title`)}</div>
                <div className="text-sm text-muted">{t(`${i.key}.hint`)}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
