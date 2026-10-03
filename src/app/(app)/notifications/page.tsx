import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, BellRing, CheckCircle2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";
import { formatDate } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui";

export default async function NotificationsPage() {
  const user = await requirePermission("notifications.view");
  const t = await getTranslations();
  const list = await getNotifications(user);
  return (
    <>
      <PageHeader title={t("notifications.title")} />
      <Card>
        {list.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm text-success">
            <CheckCircle2 className="size-5" aria-hidden />
            {t("notifications.empty")}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((n) => (
              <li key={n.key}>
                <Link href={n.href} className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2/60">
                  {n.severity === "critical" ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  ) : (
                    <BellRing className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  )}
                  <span className="flex-1 text-sm">{t(`notifications.${n.message}`, n.params)}</span>
                  {n.date && <span className="num text-xs text-muted">{formatDate(n.date)}</span>}
                  <Badge tone={n.severity === "critical" ? "danger" : "warning"}>
                    {t(n.severity === "critical" ? "notifications.critical" : "notifications.warning")}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
