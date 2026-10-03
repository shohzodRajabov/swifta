import { useTranslations } from "next-intl";
import type { Priority, ProjectStage, ProjectStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { STAGE_GROUP, stageProgress } from "@/lib/stages";

const GROUP_TONE = {
  PRESALE: "neutral",
  DESIGN: "primary",
  PROCUREMENT: "warning",
  INSTALLATION: "primary",
  CLOSING: "success",
  COMPLETED: "success",
} as const;

export function StageBadge({ stage }: { stage: ProjectStage }) {
  const t = useTranslations("stages");
  return <Badge tone={GROUP_TONE[STAGE_GROUP[stage]]}>{t(stage)}</Badge>;
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
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

export function ProgressBar({ stage }: { stage: ProjectStage }) {
  const pct = stageProgress(stage);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="num text-xs text-muted">{pct}%</span>
    </div>
  );
}
