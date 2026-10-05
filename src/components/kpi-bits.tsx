import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { coverage, MIN_COVERAGE } from "@/lib/kpi";

/** Marks scores computed from too little data (components without data cover more than half of the weight). */
export function CoverageNote({ components }: { components: { weight: number; value: number | null }[] }) {
  const t = useTranslations("kpi");
  const c = coverage(components);
  if (c >= MIN_COVERAGE) return null;
  return (
    <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] font-normal text-muted" title={t("lowCoverageHint")}>
      {t("lowCoverage", { pct: String(Math.round(c * 100)) })}
    </span>
  );
}

export function scoreTone(v: number | null | undefined) {
  if (v === null || v === undefined) return "text-muted";
  return v >= 90 ? "text-success" : v >= 75 ? "text-primary" : v >= 60 ? "text-warning" : "text-danger";
}

export function KpiScore({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined) return <span className={cn("text-muted", className)}>—</span>;
  return <span className={cn("num font-semibold", scoreTone(value), className)}>{value.toFixed(1)}%</span>;
}

export function KpiBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted">—</span>;
  const tone = value >= 90 ? "bg-success" : value >= 75 ? "bg-primary" : value >= 60 ? "bg-warning" : "bg-danger";
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.round(value)}%` }} />
      </span>
      <span className="num text-xs">{Math.round(value)}</span>
    </span>
  );
}
