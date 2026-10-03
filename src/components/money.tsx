"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/utils";
import { formatNumber, formatUsd, formatUzs, formatUzsCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MoneyValue = {
  uzs: number;
  usd: number;
  /** Single record: the rate details. */
  rate?: number;
  fxDate?: string | Date;
  source?: string;
  currency?: string;
  original?: number;
  /** Aggregate: number of underlying records. */
  count?: number;
};

/**
 * Shows an amount in UZS (main) with its USD equivalent underneath.
 * Clicking reveals the exchange rate, its date and source used for the conversion.
 */
export function Money({
  value,
  size = "md",
  compact = false,
  tone,
  align = "right",
}: {
  value: MoneyValue;
  size?: "sm" | "md" | "lg";
  compact?: boolean;
  tone?: "auto" | "default";
  align?: "left" | "right";
}) {
  const t = useTranslations("money");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const negative = value.uzs < 0;
  const main = compact ? formatUzsCompact(value.uzs, { bn: "mlrd", mn: "mln" }) : formatUzs(value.uzs);
  const isAggregate = value.rate === undefined;
  const avgRate = value.usd !== 0 ? value.uzs / value.usd : 0;

  return (
    <span ref={ref} className={cn("relative inline-flex flex-col", align === "right" ? "items-end" : "items-start")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "num cursor-pointer rounded text-left decoration-dotted underline-offset-4 hover:underline",
          size === "lg" && "text-2xl font-semibold tracking-tight",
          size === "md" && "font-medium",
          size === "sm" && "text-sm",
          tone === "auto" && negative && "text-danger",
        )}
      >
        {main} <span className="text-[0.75em] font-normal text-muted">{t("sum")}</span>
      </button>
      <span className={cn("num text-muted", size === "lg" ? "text-sm" : "text-xs")}>{formatUsd(value.usd)}</span>

      {open && (
        <span
          className={cn(
            "absolute top-full z-30 mt-1 w-72 rounded-lg border border-border bg-surface p-3 text-left text-xs font-normal text-text shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <span className="mb-1.5 block text-sm font-semibold">{t("rateTitle")}</span>
          {isAggregate ? (
            <>
              <span className="block text-muted">{t("aggregate", { count: value.count ?? 0 })}</span>
              {avgRate > 0 && (
                <span className="mt-1.5 block">{t("avgRate", { rate: formatNumber(avgRate, 2) })}</span>
              )}
            </>
          ) : (
            <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <span className="text-muted">{t("rateTitle")}</span>
              <span className="num">{t("rateLine", { rate: formatNumber(value.rate!, 2) })}</span>
              <span className="text-muted">{t("effectiveDate")}</span>
              <span>{formatDate(value.fxDate ? new Date(value.fxDate) : null)}</span>
              <span className="text-muted">{t("source")}</span>
              <span>{value.source === "MANUAL" ? t("sourceMANUAL") : t("sourceCBU")}</span>
              {value.currency && value.original !== undefined && (
                <>
                  <span className="text-muted">{t("original")}</span>
                  <span className="num">
                    {value.currency === "USD" ? formatUsd(value.original) : `${formatUzs(value.original)} ${t("sum")}`}
                  </span>
                </>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
