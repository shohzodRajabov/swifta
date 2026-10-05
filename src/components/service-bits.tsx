import { useTranslations } from "next-intl";
import type { ServiceTicketStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import type { SlaState } from "@/lib/sla";

const TONE: Record<ServiceTicketStatus, "neutral" | "primary" | "warning" | "success" | "danger"> = {
  NEW: "danger",
  ASSIGNED: "warning",
  IN_PROGRESS: "primary",
  RESOLVED: "success",
  CLOSED: "neutral",
  CANCELLED: "neutral",
};

export function TicketStatusBadge({ status }: { status: ServiceTicketStatus }) {
  const t = useTranslations("ticketStatus");
  return <Badge tone={TONE[status]}>{t(status)}</Badge>;
}

export function SlaBadge({ state, kind }: { state: SlaState; kind: "response" | "resolve" }) {
  const t = useTranslations("sla");
  if (state === "OK") return null;
  const tone = state === "BREACHED" ? "danger" : state === "AT_RISK" ? "warning" : "success";
  return <Badge tone={tone}>{t(`${kind}_${state}`)}</Badge>;
}
