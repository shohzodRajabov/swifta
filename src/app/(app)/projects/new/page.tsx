import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProjectForm } from "../project-form";
import { createProject } from "../actions";

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  const user = await requirePermission("projects.edit");
  const { client } = (await searchParams) as { client?: string };
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("projects.new")} back={{ href: "/projects", label: t("projects.title") }} />
      <ProjectForm action={createProject} companyId={user.companyId} defaultClientId={client} cancelHref="/projects" />
    </>
  );
}
