import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { ContractForm } from "../contract-form";
import { saveContract } from "../../actions";

export default async function NewContractPage() {
  const user = await requirePermission("service.edit");
  const t = await getTranslations();
  const [clients, projects] = await Promise.all([
    db.client.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.project.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title={t("service.newContract")} back={{ href: "/service?tab=contracts", label: t("service.title") }} />
      <Card>
        <ContractForm action={saveContract.bind(null, null)} clients={clients} projects={projects} />
      </Card>
    </>
  );
}
