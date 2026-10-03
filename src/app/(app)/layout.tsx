import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AppShell, type NavSection } from "@/components/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations("roles");
  const allow = (p: Parameters<typeof can>[1]) => can(user.role, p);

  const main: NavSection["items"] = [];
  if (allow("dashboard.view")) main.push({ key: "dashboard", href: "/" });
  if (allow("projects.view")) main.push({ key: "projects", href: "/projects" });
  if (allow("clients.view")) main.push({ key: "clients", href: "/clients" });
  if (allow("catalog.view")) main.push({ key: "catalog", href: "/catalog" });
  if (allow("finance.view")) main.push({ key: "finance", href: "/finance" });

  const sections: NavSection[] = [
    { key: "sectionMain", items: main },
    {
      key: "sectionSoon",
      items: [
        { key: "procurement", href: "#", phase: 2 },
        { key: "warehouse", href: "#", phase: 2 },
        { key: "suppliers", href: "#", phase: 2 },
        { key: "tasks", href: "#", phase: 3 },
        { key: "documents", href: "#", phase: 3 },
        { key: "reports", href: "#", phase: 4 },
      ],
    },
  ];
  const admin: NavSection["items"] = [];
  if (allow("users.manage")) admin.push({ key: "users", href: "/settings/users" });
  if (allow("audit.view")) admin.push({ key: "audit", href: "/settings/audit" });
  if (admin.length) sections.push({ key: "sectionAdmin", items: admin });

  return (
    <AppShell sections={sections} user={{ name: user.name, roleLabel: t(user.role) }}>
      {children}
    </AppShell>
  );
}
