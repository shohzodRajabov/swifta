import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { ContractorForm } from "../contractor-form";
import { saveContractor } from "../actions";

export default async function NewContractorPage() {
  const user = await requirePermission("contractors.edit");
  const t = await getTranslations();
  const [workTypes, company] = await Promise.all([
    db.workType.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
    db.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { contractorPhoneRequired: true } }),
  ]);
  return (
    <>
      <PageHeader title={t("contractors.new")} back={{ href: "/contractors", label: t("contractors.title") }} />
      <Card>
        <ContractorForm action={saveContractor.bind(null, null)} workTypes={workTypes.map((w) => w.name)} phoneRequired={company.contractorPhoneRequired} />
      </Card>
    </>
  );
}
