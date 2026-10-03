import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ClientForm } from "../client-form";
import { createClient } from "../actions";

export default async function NewClientPage() {
  await requirePermission("clients.edit");
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("clients.new")} back={{ href: "/clients", label: t("clients.title") }} />
      <ClientForm action={createClient} cancelHref="/clients" />
    </>
  );
}
