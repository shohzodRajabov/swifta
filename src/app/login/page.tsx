import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-fg">
            S
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("common.appName")}</h1>
          <p className="mt-1 text-sm text-muted">{t("common.tagline")}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold">{t("auth.title")}</h2>
          <LoginForm />
        </div>
        <div className="mt-6 flex justify-center">
          <LocaleSwitcher />
        </div>
      </div>
    </main>
  );
}
