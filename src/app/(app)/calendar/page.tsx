import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, isoDate, toDateOnly } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { taskWhere } from "@/server/workforce/access";
import { TASK_TONE } from "@/components/task-bits";

const TONE_CLASS = {
  neutral: "bg-surface-2 text-text",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

/** Month calendar: task deadlines, project milestones and work sessions per day. */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requirePermission("tasks.view");
  const { month: raw } = (await searchParams) as { month?: string };
  const t = await getTranslations();
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : isoDate(new Date()).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  const scope = taskWhere(user);
  const [tasks, sessions, projects] = await Promise.all([
    db.task.findMany({
      where: { AND: [scope, { deadline: { gte: from, lte: to } }] },
      select: { id: true, number: true, title: true, status: true, deadline: true },
    }),
    db.workSession.groupBy({ by: ["date"], where: { task: scope, date: { gte: from, lte: to } }, _count: { _all: true } }),
    db.project.findMany({
      where: { companyId: user.companyId, status: "ACTIVE", plannedEndDate: { gte: from, lte: to }, tasks: { some: scope } },
      select: { id: true, name: true, plannedEndDate: true },
    }),
  ]);
  const firstWeekday = (from.getUTCDay() + 6) % 7; // Monday first
  const days = to.getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + days) / 7) * 7 }, (_, i) => i - firstWeekday + 1);
  const today = toDateOnly(new Date());
  const prev = isoDate(new Date(Date.UTC(y, m - 2, 1))).slice(0, 7);
  const next = isoDate(new Date(Date.UTC(y, m, 1))).slice(0, 7);
  const weekdays = t("calendar.weekdays").split(",");

  return (
    <>
      <PageHeader
        title={t("calendar.title")}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/calendar?month=${prev}`} className="rounded-lg border border-border p-2 hover:bg-surface-2" aria-label="prev">
              <ChevronLeft className="size-4" />
            </Link>
            <span className="num w-24 text-center font-medium">{month}</span>
            <Link href={`/calendar?month=${next}`} className="rounded-lg border border-border p-2 hover:bg-surface-2" aria-label="next">
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />
      <Card className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7">
          {weekdays.map((w) => (
            <div key={w} className="border-b border-border px-2 py-2 text-xs font-medium uppercase text-muted">
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d < 1 || d > days) return <div key={i} className="min-h-28 border-b border-r border-border bg-surface-2/30" />;
            const date = new Date(Date.UTC(y, m - 1, d));
            const dayTasks = tasks.filter((x) => x.deadline?.getTime() === date.getTime());
            const dayProjects = projects.filter((p) => p.plannedEndDate?.getTime() === date.getTime());
            const s = sessions.find((x) => x.date.getTime() === date.getTime())?._count._all ?? 0;
            return (
              <div key={i} className={cn("min-h-28 border-b border-r border-border p-1.5", date.getTime() === today.getTime() && "bg-primary-soft/30")}>
                <div className="flex items-center justify-between">
                  <span className={cn("num text-xs", date.getTime() === today.getTime() ? "font-bold text-primary" : "text-muted")}>{d}</span>
                  {s > 0 && <span className="num text-[10px] text-muted">{t("calendar.sessions", { n: String(s) })}</span>}
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {dayProjects.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`} className="truncate rounded bg-danger-soft px-1 py-0.5 text-[11px] text-danger">
                      ⚑ {p.name}
                    </Link>
                  ))}
                  {dayTasks.slice(0, 4).map((x) => (
                    <Link key={x.id} href={`/tasks/${x.id}`} className={cn("truncate rounded px-1 py-0.5 text-[11px]", TONE_CLASS[TASK_TONE[x.status]])} title={x.title}>
                      T-{x.number} {x.title}
                    </Link>
                  ))}
                  {dayTasks.length > 4 && <span className="text-[11px] text-muted">+{dayTasks.length - 4}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
