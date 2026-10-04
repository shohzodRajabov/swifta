import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button, Card, Notice, PageHeader, Select } from "@/components/ui";
import { projectWhere } from "@/server/projects/access";
import { taskFormOptions } from "@/server/workforce/options";
import { TaskForm } from "../task-form";
import { createTask } from "../actions";

export default async function NewTaskPage({ searchParams }: PageProps<"/tasks/new">) {
  const user = await requirePermission("tasks.manage");
  const { project } = (await searchParams) as { project?: string };
  const t = await getTranslations();
  const projects = await db.project.findMany({
    where: { AND: [projectWhere(user), { status: { in: ["ACTIVE", "ON_HOLD"] } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const projectId = projects.some((p) => p.id === project) ? project! : null;
  const options = await taskFormOptions(user.companyId, projectId);
  return (
    <>
      <PageHeader
        title={t("tasks.new")}
        back={projectId ? { href: `/projects/${projectId}?tab=tasks`, label: projects.find((p) => p.id === projectId)!.name } : { href: "/tasks", label: t("tasks.title") }}
      />
      {!projectId ? (
        <Card className="p-5">
          <Notice>{t("tasks.chooseProjectHint")}</Notice>
          <form className="mt-4 flex flex-wrap gap-2">
            <Select name="project" required defaultValue="" className="max-w-md">
              <option value="" disabled>
                —
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Button type="submit">{t("common.next")}</Button>
          </form>
        </Card>
      ) : (
        <Card>
          <TaskForm action={createTask} projectId={projectId} {...options} />
        </Card>
      )}
    </>
  );
}
