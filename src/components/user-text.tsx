import { getLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { requestTranslator } from "@/server/ai/translate";

/**
 * User-entered text shown in the viewer's language (AI translation, cached). Without AI settings, or on any
 * failure, the original is shown. The original stays available as a tooltip.
 */
export async function UT({ children, className }: { children: string | null | undefined; className?: string }) {
  if (!children) return children ?? null;
  const user = await getCurrentUser();
  if (!user) return children;
  const tr = requestTranslator(user.companyId, await getLocale());
  const cfg = await tr.cfg;
  if (!cfg) return children;
  const out = await tr.translate(children);
  if (out === children) return className ? <span className={className}>{children}</span> : children;
  return (
    <span title={children} className={className}>
      {out}
    </span>
  );
}
