import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { AppShell, type NavItem, type NavSection } from "@/components/app-shell";
import { getNotifications } from "@/lib/notifications";
import { switchWorkspace } from "@/app/(app)/settings/demo/actions";
import { db } from "@/lib/db";

type Entry = { key: string; href: string; perm: Permission | Permission[]; phase?: number };

/** Modules in the order they appear in the sidebar. `phase` marks modules that are not available yet. */
const MAIN: Entry[] = [
  { key: "dashboard", href: "/", perm: "dashboard.view" },
  { key: "me", href: "/me", perm: "worker.self" },
  { key: "projects", href: "/projects", perm: "projects.view" },
  { key: "tasks", href: "/tasks", perm: "tasks.view" },
  { key: "calendar", href: "/calendar", perm: "tasks.view" },
  { key: "employees", href: "/employees", perm: "employees.view" },
  { key: "contractors", href: "/contractors", perm: "contractors.view" },
  { key: "clients", href: "/clients", perm: "clients.view" },
  { key: "catalog", href: "/catalog", perm: "catalog.view" },
  { key: "procurement", href: "/procurement", perm: "procurement.view" },
  { key: "warehouse", href: "/warehouse", perm: "warehouse.view" },
  { key: "suppliers", href: "/suppliers", perm: "suppliers.view" },
  { key: "finance", href: "/finance", perm: ["finance.view", "overhead.view", "finance.approve"] },
  { key: "kpi", href: "/kpi", perm: ["kpi.view", "kpi.self"] },
  { key: "service", href: "/service", perm: "service.view" },
  { key: "reports", href: "/reports", perm: "reports.view" },
];

/** Routes that exist in this build (others are shown as "coming"). */
const READY = new Set(["dashboard", "me", "tasks", "calendar", "employees", "contractors", "projects", "clients", "catalog", "procurement", "warehouse", "suppliers", "finance", "notifications"]);

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations();
  const allow = (p: Permission | Permission[]) => (Array.isArray(p) ? p.some((x) => can(user, x)) : can(user, p));

  const main: NavItem[] = [];
  const soon: NavItem[] = [];
  for (const e of MAIN) {
    if (!allow(e.perm)) continue;
    if (READY.has(e.key)) main.push({ key: e.key, href: e.href });
    else soon.push({ key: e.key, href: "#", phase: 3 });
  }
  if (can(user, "notifications.view")) {
    const count = (await getNotifications(user)).length;
    main.push({ key: "notifications", href: "/notifications", badge: count });
  }
  const sections: NavSection[] = [{ key: "sectionMain", items: main }];
  if (soon.length) sections.push({ key: "sectionSoon", items: soon });
  const admin: NavItem[] = [];
  if (["settings.manage", "users.manage", "roles.manage", "backups.manage", "demo.access"].some((p) => can(user, p as Permission)))
    admin.push({ key: "settings", href: "/settings" });
  if (can(user, "audit.view")) admin.push({ key: "audit", href: "/settings/audit" });
  if (admin.length) sections.push({ key: "sectionAdmin", items: admin });

  const demoExists = can(user, "demo.access") || user.homeUserId ? !!(await db.company.findFirst({ where: { isDemo: true }, select: { id: true } })) : false;

  return (
    <AppShell
      sections={sections}
      user={{ name: user.name, roleLabel: `${roleLabel(t, user.roleDef)}${user.company.isDemo ? " · Demo" : ""}` }}
      workspace={{
        isDemo: user.company.isDemo,
        canSwitch: user.company.isDemo ? !!user.homeUserId : can(user, "demo.access") && demoExists,
        switchAction: switchWorkspace,
      }}
    >
      {children}
    </AppShell>
  );
}
