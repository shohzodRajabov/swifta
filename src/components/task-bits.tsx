import { useTranslations } from "next-intl";
import type { RemarkStatus, TaskStatus } from "@prisma/client";
import { Badge } from "@/components/ui";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

export const TASK_TONE: Record<TaskStatus, Tone> = {
  NEW: "neutral",
  ASSIGNED: "neutral",
  ACCEPTED: "primary",
  IN_PROGRESS: "primary",
  COMPLETED: "warning",
  INSPECTION: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  REWORK: "danger",
  BLOCKED: "danger",
  CANCELLED: "neutral",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const t = useTranslations("taskStatus");
  return <Badge tone={TASK_TONE[status]}>{t(status)}</Badge>;
}

export type DeadlineState = "ON_TIME" | "AT_RISK" | "DUE_TODAY" | "OVERDUE" | "DONE" | null;

export function DeadlineBadge({ state }: { state: DeadlineState }) {
  const t = useTranslations("deadline");
  if (!state || state === "DONE" || state === "ON_TIME") return null;
  return <Badge tone={state === "OVERDUE" ? "danger" : "warning"}>{t(state)}</Badge>;
}

const REMARK_TONE: Record<RemarkStatus, Tone> = {
  NEW: "danger",
  ASSIGNED: "warning",
  IN_PROGRESS: "primary",
  FIXED: "warning",
  REINSPECTION: "warning",
  ACCEPTED: "success",
};

export function RemarkStatusBadge({ status }: { status: RemarkStatus }) {
  const t = useTranslations("remarkStatus");
  return <Badge tone={REMARK_TONE[status]}>{t(status)}</Badge>;
}

/** Efficiency index (1.00 = company average); grey while there are too few sessions to trust it. */
/** Below this share of person-distinguishing hours the index mostly describes the group (M6). */
export const MIN_DISTINCT = 0.3;

export function EfficiencyBadge({ index, reliable, distinct }: { index: number | null | undefined; reliable?: boolean; distinct?: number }) {
  const t = useTranslations("employees");
  if (index === null || index === undefined) return <span className="text-xs text-muted">—</span>;
  const groupOnly = distinct !== undefined && distinct < MIN_DISTINCT;
  const tone: Tone = !reliable || groupOnly ? "neutral" : index >= 1.1 ? "success" : index < 0.85 ? "danger" : index < 0.95 ? "warning" : "primary";
  const title = [reliable ? t("efficiencyHint") : t("efficiencyUnreliable"), groupOnly ? t("efficiencyGroupOnly", { pct: String(Math.round((distinct ?? 0) * 100)) }) : null].filter(Boolean).join("\n");
  return (
    <Badge tone={tone} title={title}>
      <span className="num">{index.toFixed(2)}</span>
      {!reliable && "*"}
      {groupOnly && "≈"}
    </Badge>
  );
}
