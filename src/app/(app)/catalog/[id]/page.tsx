import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";
import { saveProduct } from "../actions";

export default async function EditProductPage({ params }: PageProps<"/catalog/[id]">) {
  const { id } = await params;
  const user = await requirePermission("catalog.edit");
  const product = await db.product.findFirst({ where: { id, companyId: user.companyId } });
  if (!product) notFound();
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("catalog.editTitle")} back={{ href: "/catalog", label: t("catalog.title") }} />
      <ProductForm action={saveProduct.bind(null, id)} companyId={user.companyId} product={product} />
    </>
  );
}
