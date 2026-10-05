import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { IMPORT_COLUMNS, IMPORT_TYPES } from "@/lib/bulk-import";
import { Notice, PageHeader } from "@/components/ui";
import { IMPORT_PERMS } from "./perms";
import { ImportForm } from "./import-form";

export default async function ImportPage({ searchParams }: PageProps<"/settings/import">) {
  const user = await requireUser();
  const types = IMPORT_TYPES.filter((x) => can(user, IMPORT_PERMS[x]));
  if (types.length === 0) redirect("/forbidden");
  const sp = (await searchParams) as { type?: string };
  const t = await getTranslations();
  const columns = Object.fromEntries(types.map((x) => [x, IMPORT_COLUMNS[x].map((c) => ({ key: c.key, required: !!c.required }))]));
  return (
    <>
      <PageHeader title={t("settings.import.title")} back={{ href: "/settings", label: t("settings.title") }} />
      <div className="flex max-w-6xl flex-col gap-4">
        <Notice tone="primary">
          <ol className="list-decimal space-y-1 pl-4">
            <li>{t("bulkImport.step1")}</li>
            <li>{t("bulkImport.step2")}</li>
            <li>{t("bulkImport.step3")}</li>
          </ol>
        </Notice>
        {!can(user, "salaries.view") && types.includes("employees") && <Notice>{t("bulkImport.noSalary")}</Notice>}
        <ImportForm types={types} initial={types.includes(sp.type as never) ? (sp.type as (typeof types)[number]) : types[0]} columns={columns} />
      </div>
    </>
  );
}
