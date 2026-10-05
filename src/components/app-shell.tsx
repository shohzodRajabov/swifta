"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  FlaskConical,
  Gauge,
  HardHat,
  Settings,
  UserRound,
  UsersRound,
  Wrench,
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  PieChart,
  ScrollText,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Warehouse,
  X,
  Contact,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { logout, logoutEverywhere } from "@/app/login/actions";

const ICONS: Record<string, typeof Boxes> = {
  dashboard: LayoutDashboard,
  me: UserRound,
  projects: Building2,
  tasks: ClipboardList,
  clients: Contact,
  contractors: HardHat,
  catalog: Boxes,
  finance: Wallet,
  procurement: ShoppingCart,
  warehouse: Warehouse,
  suppliers: Truck,
  documents: FileText,
  kpi: Gauge,
  service: Wrench,
  reports: PieChart,
  users: Users,
  settings: Settings,
  audit: ScrollText,
  notifications: Bell,
  employees: UsersRound,
  calendar: CalendarDays,
};

export type NavItem = { key: string; href: string; phase?: number; badge?: number };
export type NavSection = { key: "sectionMain" | "sectionSoon" | "sectionAdmin"; items: NavItem[] };

export function AppShell({
  sections,
  user,
  workspace,
  children,
}: {
  sections: NavSection[];
  user: { name: string; roleLabel: string };
  /** Demo workspace switch: shown when the user may use the demo. */
  workspace?: { isDemo: boolean; canSwitch: boolean; switchAction: () => Promise<void> };
  children: ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.key}>
          <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t(`nav.${section.key}`)}
          </div>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.key] ?? Boxes;
              if (item.phase) {
                return (
                  <li key={item.key}>
                    <span className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted/70">
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{t(`nav.${item.key}`)}</span>
                      <span className="rounded bg-surface-2 px-1.5 text-[10px]">{t("common.phase", { n: item.phase })}</span>
                    </span>
                  </li>
                );
              }
              const active = isActive(item.href);
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                      active ? "bg-primary-soft font-medium text-primary" : "text-text hover:bg-surface-2",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{t(`nav.${item.key}`)}</span>
                    {!!item.badge && (
                      <span className="num rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">{item.badge}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-5 py-4">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-fg">S</span>
      <span className="text-base font-semibold tracking-tight">Swifta</span>
    </Link>
  );

  const footer = (
    <div className="border-t border-border px-4 py-3">
      {workspace?.canSwitch && (
        <form action={workspace.switchAction} className="mb-2">
          <button
            type="submit"
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium",
              workspace.isDemo ? "border-warning/40 bg-warning-soft text-warning" : "border-border text-muted hover:bg-surface-2",
            )}
          >
            <FlaskConical className="size-3.5 shrink-0" aria-hidden />
            {workspace.isDemo ? t("workspace.backToMain") : t("workspace.openDemo")}
          </button>
        </form>
      )}
      <div className="mb-2 min-w-0">
        <div className="truncate text-sm font-medium">{user.name}</div>
        <div className="truncate text-xs text-muted">{user.roleLabel}</div>
      </div>
      <div className="mb-1 flex flex-wrap gap-x-3 text-xs">
        <Link href="/set-password" className="text-muted hover:text-text">
          {t("auth.changePassword")}
        </Link>
        <Link href="/security" className="text-muted hover:text-text">
          {t("auth.twoFactorSetup")}
        </Link>
        <form action={logoutEverywhere}>
          <button type="submit" className="text-muted hover:text-text" title={t("auth.logoutEverywhereHint")}>
            {t("auth.logoutEverywhere")}
          </button>
        </form>
      </div>
      <div className="flex items-center justify-between">
        <LocaleSwitcher />
        <form action={logout}>
          <button type="submit" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text">
            <LogOut className="size-4" aria-hidden />
            {t("common.logout")}
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-fg">S</span>
          <span className="font-semibold">Swifta</span>
        </Link>
        <button type="button" onClick={() => setOpen(true)} className="rounded-md p-1.5 hover:bg-surface-2" aria-label="Menu">
          <Menu className="size-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-surface-2" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      {workspace?.isDemo && (
        <div className="sticky top-0 z-20 bg-warning px-4 py-1.5 text-center text-xs font-medium text-white lg:top-0">
          {t("workspace.demoBanner")}
        </div>
      )}
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
