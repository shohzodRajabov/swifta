import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { openSecret } from "@/lib/crypto-box";
import { otpauthUri } from "@/lib/totp";
import { Button } from "@/components/ui";
import { logout } from "@/app/login/actions";
import { startTotp } from "./actions";
import { CodeForm } from "./code-form";

export default async function SecurityPage({ searchParams }: PageProps<"/security">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/set-password");
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  const sp = await searchParams;
  const required = user.company.require2faForAdmins && can(user, "settings.manage");
  const secret = !user.totpEnabled && user.totpSecret ? openSecret(user.totpSecret) : null;
  const qr = secret ? await QRCode.toDataURL(otpauthUri(secret, user.phone ?? user.email ?? user.name, "Swifta"), { margin: 1, width: 200 }) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-base font-semibold">{t("twoFactorSetup")}</h1>
        {required && !user.totpEnabled && <p className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{t("twoFactorRequired")}</p>}
        {sp.ok && <p className="mb-3 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{t("twoFactorEnabled")}</p>}

        {user.totpEnabled ? (
          <>
            <p className="mb-4 text-sm text-muted">{t("twoFactorOn")}</p>
            {!required && <CodeForm mode="disable" />}
          </>
        ) : secret && qr ? (
          <>
            <p className="mb-3 text-sm text-muted">{t("twoFactorScan")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR" width={200} height={200} className="mx-auto mb-2 rounded-lg border border-border bg-white" />
            <p className="mb-4 break-all text-center font-mono text-xs text-muted">{secret.replace(/(.{4})/g, "$1 ").trim()}</p>
            <CodeForm mode="confirm" />
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted">{t("twoFactorIntro")}</p>
            <form action={startTotp}>
              <Button type="submit" className="h-10 w-full">
                {t("twoFactorStart")}
              </Button>
            </form>
          </>
        )}
        {required && !user.totpEnabled ? (
          <form action={logout} className="mt-4 text-center">
            <button type="submit" className="text-sm text-muted hover:text-text">
              {tc("logout")}
            </button>
          </form>
        ) : (
          <Link href="/" className="mt-4 block text-center text-sm text-muted hover:text-text">
            ← {t("back")}
          </Link>
        )}
      </div>
    </main>
  );
}
