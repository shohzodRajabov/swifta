import { getTranslations } from "next-intl/server";
import { ShieldX } from "lucide-react";

export default async function ForbiddenPage() {
  const t = await getTranslations("auth");
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <ShieldX className="mb-4 size-10 text-muted" aria-hidden />
      <h1 className="text-xl font-semibold">{t("forbiddenTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("forbiddenText")}</p>
    </div>
  );
}
