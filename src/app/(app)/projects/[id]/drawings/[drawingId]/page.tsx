import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge, PageHeader } from "@/components/ui";
import { NewVersionButton } from "@/components/drawing-upload";
import { projectWhere } from "@/server/projects/access";
import { taskSummaries } from "@/server/drawings/drawings";
import { DrawingViewer, type ViewerRemark, type ViewerZone } from "./viewer";
import type { ZoneGeometry } from "../actions";

export default async function DrawingPage({ params, searchParams }: PageProps<"/projects/[id]/drawings/[drawingId]">) {
  const { id, drawingId } = await params;
  const sp = (await searchParams) as { v?: string; page?: string; zone?: string };
  const user = await requirePermission("documents.view");
  const project = await db.project.findFirst({ where: { AND: [{ id }, projectWhere(user)] }, select: { id: true, name: true } });
  if (!project) notFound();
  const drawing = await db.drawing.findFirst({
    where: { id: drawingId, projectId: id },
    include: { versions: { orderBy: { version: "desc" }, include: { file: { select: { fileName: true } }, _count: { select: { zones: true } } } } },
  });
  if (!drawing || drawing.versions.length === 0) notFound();
  const t = await getTranslations();
  const latest = drawing.versions[0];
  const version = drawing.versions.find((v) => String(v.version) === sp.v) ?? latest;

  const [zones, remarks, taskOptions, locations, users] = await Promise.all([
    db.drawingZone.findMany({ where: { versionId: version.id }, include: { tasks: { select: { taskId: true } } }, orderBy: [{ page: "asc" }, { createdAt: "asc" }] }),
    db.remark.findMany({ where: { drawingVersionId: version.id, posX: { not: null } }, select: { id: true, number: true, drawingPage: true, posX: true, posY: true, description: true, status: true, priority: true } }),
    db.task.findMany({ where: { projectId: id, status: { not: "CANCELLED" } }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true, status: true } }),
    db.projectLocation.findMany({ where: { projectId: id }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    can(user, "remarks.create") || can(user, "remarks.manage") ? db.user.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
  ]);
  const summaries = await taskSummaries([...new Set(zones.flatMap((z) => z.tasks.map((x) => x.taskId)))]);
  const focus = sp.zone ? zones.find((z) => z.id === sp.zone) : undefined;
  const viewerZones: ViewerZone[] = zones.map((z) => ({
    id: z.id,
    page: z.page,
    name: z.name,
    geometry: z.geometry as ZoneGeometry,
    locationId: z.locationId,
    needsReview: z.needsReview,
    taskIds: z.tasks.map((x) => x.taskId),
  }));
  const viewerRemarks: ViewerRemark[] = remarks.map((r) => ({
    id: r.id,
    number: r.number,
    page: r.drawingPage ?? 1,
    x: r.posX ?? 0,
    y: r.posY ?? 0,
    description: r.description,
    status: r.status,
    priority: r.priority,
  }));

  return (
    <>
      <PageHeader
        title={drawing.title}
        back={{ href: `/projects/${id}?tab=drawings`, label: project.name }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {drawing.discipline && <span>{drawing.discipline} ·</span>}
            {drawing.versions.map((v) => (
              <Link
                key={v.id}
                href={`?v=${v.version}`}
                title={`${v.file.fileName} · ${formatDateTime(v.createdAt)}${v.note ? ` · ${v.note}` : ""}`}
                className={cn("rounded-md px-2 py-0.5 text-xs", v.id === version.id ? "bg-primary text-primary-fg" : "bg-surface-2 hover:text-text")}
              >
                v{v.version}
              </Link>
            ))}
            {version.id !== latest.id && <Badge tone="warning">{t("drawings.oldVersion")}</Badge>}
            {version.note && <span className="text-xs">{version.note}</span>}
          </span>
        }
        actions={can(user, "drawings.edit") ? <NewVersionButton projectId={id} drawingId={drawing.id} /> : undefined}
      />
      <DrawingViewer
        fileUrl={`/api/files/${version.fileId}?raw=1`}
        versionId={version.id}
        isLatest={version.id === latest.id}
        needsReview={version.needsReview}
        initialPage={focus?.page ?? (Number(sp.page) || 1)}
        focusZoneId={focus?.id ?? null}
        zones={viewerZones}
        tasks={Object.fromEntries(summaries)}
        taskOptions={taskOptions}
        remarks={viewerRemarks}
        locations={locations}
        users={users}
        canEdit={can(user, "drawings.edit")}
        canRemark={can(user, "remarks.create") || can(user, "remarks.manage")}
      />
    </>
  );
}
