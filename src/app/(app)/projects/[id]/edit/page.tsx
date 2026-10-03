import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ProjectForm } from "../../project-form";
import { updateProject } from "../../actions";

export default async function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  const { id } = await params;
  const user = await requirePermission("projects.edit");
  const project = await db.project.findFirst({ where: { id, companyId: user.companyId } });
  if (!project) notFound();
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("projects.editTitle")} back={{ href: `/projects/${id}`, label: project.name }} />
      <ProjectForm
        action={updateProject.bind(null, id)}
        companyId={user.companyId}
        project={project}
        cancelHref={`/projects/${id}`}
      />
    </>
  );
}
