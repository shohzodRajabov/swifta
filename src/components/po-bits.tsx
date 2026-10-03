import { useTranslations } from "next-intl";
import type { PurchaseOrderStatus } from "@prisma/client";
import { Badge } from "@/components/ui";

const TONE = {
  DRAFT: "neutral",
  ORDERED: "primary",
  PARTIAL: "warning",
  RECEIVED: "success",
  CANCELLED: "neutral",
} as const;

export function PoStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const t = useTranslations("poStatus");
  return <Badge tone={TONE[status]}>{t(status)}</Badge>;
}
