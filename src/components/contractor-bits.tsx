import { useTranslations } from "next-intl";
import type { Availability, OutsourceStatus } from "@prisma/client";
import { Badge } from "@/components/ui";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

const AVAIL_TONE: Record<Availability, Tone> = { AVAILABLE: "success", BUSY: "warning", UNAVAILABLE: "neutral", BLACKLISTED: "danger" };

export function AvailabilityBadge({ availability, busy }: { availability: Availability; busy?: number }) {
  const t = useTranslations("availability");
  // A contractor marked available but working on other tasks is shown as busy (with the count).
  if (availability === "AVAILABLE" && busy) return <Badge tone="warning">{t("busyTasks", { n: String(busy) })}</Badge>;
  return <Badge tone={AVAIL_TONE[availability]}>{t(availability)}</Badge>;
}

const OUT_TONE: Record<OutsourceStatus, Tone> = {
  ASSIGNED: "neutral",
  IN_PROGRESS: "primary",
  COMPLETED: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export function OutsourceStatusBadge({ status }: { status: OutsourceStatus | null }) {
  const t = useTranslations("outsourceStatus");
  const s = status ?? "ASSIGNED";
  return <Badge tone={OUT_TONE[s]}>{t(s)}</Badge>;
}

export function RatingValue({ rating }: { rating: number | null | undefined }) {
  if (rating === null || rating === undefined) return <span className="text-xs text-muted">—</span>;
  const tone = rating >= 4.5 ? "text-success" : rating >= 3.5 ? "text-text" : rating >= 2.5 ? "text-warning" : "text-danger";
  return <span className={`num font-medium ${tone}`}>★ {rating.toFixed(1)}</span>;
}

export function ReliabilityValue({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted">—</span>;
  const tone = value >= 90 ? "text-success" : value >= 75 ? "text-text" : value >= 60 ? "text-warning" : "text-danger";
  return <span className={`num font-medium ${tone}`}>{value.toFixed(0)}%</span>;
}
