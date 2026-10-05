import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BarChart3, Building2, ClipboardCheck, Package, Users, Wrench } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { reportsFor, type ReportDef } from "@/server/reports/defs";

const GROUPS: { key: ReportDef["group"]; icon: React.ReactNode }[] = [
  { key: "projects", icon: <Building2 className="size-5" /> },
  { key: "finance", icon: <BarChart3 className="size-5" /> },
  { key: "people", icon: <Users className="size-5" /> },
  { key: "supply", icon: <Package className="size-5" /> },
  { key: "quality", icon: <ClipboardCheck className="size-5" /> },
  { key: "service", icon: <Wrench className="size-5" /> },
];

export default async function ReportsPage() {
  const user = await requirePermission("reports.view");
  const t = await getTranslations();
  const list = reportsFor(user);
  return (
    <>
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GROUPS.filter((g) => list.some((r) => r.group === g.key)).map((g) => (
          <Card key={g.key} className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="text-primary">{g.icon}</span>
              {t(`reports.group_${g.key}`)}
            </div>
            <ul className="space-y-1">
              {list
                .filter((r) => r.group === g.key)
                .map((r) => (
                  <li key={r.key}>
                    <Link href={`/reports/${r.key}`} className="block rounded-lg px-2 py-1.5 hover:bg-surface-2">
                      <div className="text-sm font-medium">{t(`reports.r_${r.key}`)}</div>
                      <div className="text-xs text-muted">{t(`reports.r_${r.key}_hint`)}</div>
                    </Link>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
