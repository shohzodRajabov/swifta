import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { PENDING_2FA_COOKIE, verifyPending2fa } from "@/lib/session";
import { VerifyForm } from "./verify-form";

export default async function VerifyPage() {
  if (!(await verifyPending2fa((await cookies()).get(PENDING_2FA_COOKIE)?.value))) redirect("/login");
  const t = await getTranslations("auth");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-base font-semibold">{t("twoFactorTitle")}</h1>
        <p className="mb-4 text-sm text-muted">{t("twoFactorText")}</p>
        <VerifyForm />
      </div>
    </main>
  );
}
