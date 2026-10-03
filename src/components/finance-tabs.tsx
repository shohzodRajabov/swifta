import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export type FinanceTab = "expenses" | "receivables" | "payables" | "approvals" | "overhead" | "pnl";

/** Sub-navigation of the finance section. */
export async function FinanceTabs({ user, active, pending = 0 }: { user: CurrentUser; active: FinanceTab; pending?: number }) {
  const t = await getTranslations("finance");
  const tabs: { key: FinanceTab; href: string; show: boolean }[] = [
    { key: "expenses", href: "/finance", show: can(user, "finance.view") },
    { key: "receivables", href: "/finance?tab=receivables", show: can(user, "finance.view") },
    { key: "payables", href: "/finance?tab=payables", show: can(user, "finance.view") },
    { key: "approvals", href: "/finance/approvals", show: can(user, "finance.approve") },
    { key: "overhead", href: "/finance/overhead", show: can(user, "overhead.view") },
    { key: "pnl", href: "/finance/pnl", show: can(user, "finance.view") && can(user, "overhead.view") },
  ];
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {tabs
        .filter((x) => x.show)
        .map((x) => (
          <Link
            key={x.key}
            href={x.href}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              active === x.key ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t(`tab_${x.key}`)}
            {x.key === "approvals" && pending > 0 && (
              <span className="num rounded-full bg-warning px-1.5 text-[11px] font-semibold text-white">{pending}</span>
            )}
          </Link>
        ))}
    </nav>
  );
}
