import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ClientForm } from "../../client-form";
import { updateClient } from "../../actions";

export default async function EditClientPage({ params }: PageProps<"/clients/[id]/edit">) {
  const { id } = await params;
  const user = await requirePermission("clients.edit");
  const client = await db.client.findFirst({ where: { id, companyId: user.companyId } });
  if (!client) notFound();
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("clients.editTitle")} back={{ href: `/clients/${id}`, label: client.name }} />
      <ClientForm action={updateClient.bind(null, id)} client={client} cancelHref={`/clients/${id}`} />
    </>
  );
}
