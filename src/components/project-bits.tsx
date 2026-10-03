import { useTranslations } from "next-intl";
import type { Priority, ProjectStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

export type StatusView = {
  code: string;
  name: string;
  group: { letter: string; name: string; color: string; code: string };
};

/** Object status: group colour dot + code + name (e.g. "● D3 Montaj boshlandi"). */
export function StatusBadge({ status, compact = false }: { status: StatusView | null | undefined; compact?: boolean }) {
  if (!status) return <Badge>—</Badge>;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium"
      title={`${status.group.letter}. ${status.group.name} — ${status.name}`}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: status.group.color }} aria-hidden />
      <span className="num text-muted">{status.code}</span>
      {!compact && <span className="truncate">{status.name}</span>}
    </span>
  );
}

export function StatusBadgeGroup({ group }: { group: { letter: string; name: string; color: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="size-2 rounded-full" style={{ background: group.color }} aria-hidden />
      {group.letter}. {group.name}
    </span>
  );
}

export function LifecycleBadge({ status }: { status: ProjectStatus }) {
  const t = useTranslations("projectStatus");
  const tone = status === "ACTIVE" ? "success" : status === "ON_HOLD" ? "warning" : "neutral";
  return <Badge tone={tone}>{t(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const t = useTranslations("priority");
  const tone = priority === "CRITICAL" ? "danger" : priority === "HIGH" ? "warning" : "neutral";
  return <Badge tone={tone}>{t(priority)}</Badge>;
}

export function DelayedBadge() {
  const t = useTranslations("projects");
  return <Badge tone="danger">{t("delayedBadge")}</Badge>;
}

/** Physical progress bar; `null` means "not measurable yet" (no tasks with quantities). */
export function ProgressBar({ percent, className }: { percent: number | null; className?: string }) {
  if (percent === null) return <span className="text-xs text-muted">—</span>;
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="num text-xs text-muted">{pct}%</span>
    </div>
  );
}
