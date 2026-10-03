import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";
import { saveProduct } from "../actions";

export default async function NewProductPage() {
  const user = await requirePermission("catalog.edit");
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("catalog.new")} back={{ href: "/catalog", label: t("catalog.title") }} />
      <ProductForm action={saveProduct.bind(null, null)} companyId={user.companyId} />
    </>
  );
}
