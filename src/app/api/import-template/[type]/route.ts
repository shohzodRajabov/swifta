import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { IMPORT_TYPES, type ImportType } from "@/lib/bulk-import";
import { templateWorkbook } from "@/server/import/bulk";
import { IMPORT_PERMS } from "@/app/(app)/settings/import/perms";

export async function GET(_: Request, ctx: RouteContext<"/api/import-template/[type]">) {
  const { type } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || !IMPORT_TYPES.includes(type as ImportType) || !can(user, IMPORT_PERMS[type as ImportType])) return new Response("Forbidden", { status: 403 });
  const t = await getTranslations("importCols");
  const buf = await templateWorkbook(type as ImportType, (k) => t(k));
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="swifta-${type}-template.xlsx"`,
    },
  });
}
