import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { SetPasswordForm } from "./set-password-form";

export default async function SetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("auth");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-base font-semibold">{t("setPasswordTitle")}</h1>
        <p className="mb-4 text-sm text-muted">{user.mustChangePassword ? t("setPasswordText", { name: user.name }) : t("changePasswordText")}</p>
        <SetPasswordForm needCurrent={!user.mustChangePassword} />
        {!user.mustChangePassword && (
          <Link href="/" className="mt-4 block text-center text-sm text-muted hover:text-text">
            ← {t("back")}
          </Link>
        )}
      </div>
    </main>
  );
}
