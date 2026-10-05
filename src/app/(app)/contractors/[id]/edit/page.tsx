import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { ContractorForm } from "../../contractor-form";
import { saveContractor } from "../../actions";

export default async function EditContractorPage({ params }: PageProps<"/contractors/[id]/edit">) {
  const { id } = await params;
  const user = await requirePermission("contractors.edit");
  const contractor = await db.contractor.findFirst({ where: { id, companyId: user.companyId } });
  if (!contractor) notFound();
  const [workTypes, company] = await Promise.all([
    db.workType.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
    db.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { contractorPhoneRequired: true } }),
  ]);
  return (
    <>
      <PageHeader title={contractor.name} back={{ href: `/contractors/${id}`, label: contractor.name }} />
      <Card>
        <ContractorForm action={saveContractor.bind(null, id)} contractor={contractor} workTypes={workTypes.map((w) => w.name)} phoneRequired={company.contractorPhoneRequired} />
      </Card>
    </>
  );
}
