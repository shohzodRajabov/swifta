import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { SupplierForm } from "../../supplier-form";
import { saveSupplier } from "../../actions";

export default async function EditSupplierPage({ params }: PageProps<"/suppliers/[id]/edit">) {
  const { id } = await params;
  const user = await requirePermission("suppliers.edit");
  const supplier = await db.supplier.findFirst({ where: { id, companyId: user.companyId } });
  if (!supplier) notFound();
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("suppliers.editTitle")} back={{ href: `/suppliers/${id}`, label: supplier.name }} />
      <SupplierForm action={saveSupplier.bind(null, id)} supplier={supplier} cancelHref={`/suppliers/${id}`} />
    </>
  );
}
