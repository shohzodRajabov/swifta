import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SupplierForm } from "../supplier-form";
import { saveSupplier } from "../actions";

export default async function NewSupplierPage() {
  await requirePermission("suppliers.edit");
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("suppliers.new")} back={{ href: "/suppliers", label: t("suppliers.title") }} />
      <SupplierForm action={saveSupplier.bind(null, null)} cancelHref="/suppliers" />
    </>
  );
}
