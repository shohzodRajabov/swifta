import { Check } from "lucide-react";
import type { StatusCatalog } from "@/server/projects/status";
import { cn, formatDate } from "@/lib/utils";

/** Groups A–H as a progress line; the current group shows the current sub-status. */
export function StatusTimeline({
  catalog,
  currentStatusId,
  reached,
}: {
  catalog: StatusCatalog;
  currentStatusId: string | null;
  /** first date each group was entered */
  reached: Map<string, Date>;
}) {
  const currentGroupIndex = catalog.findIndex((g) => g.statuses.some((s) => s.id === currentStatusId));
  const current = catalog[currentGroupIndex]?.statuses.find((s) => s.id === currentStatusId);
  return (
    <ol className="flex gap-0 overflow-x-auto pb-2">
      {catalog.map((g, i) => {
        const done = i < currentGroupIndex;
        const isCurrent = i === currentGroupIndex;
        const date = reached.get(g.id);
        return (
          <li key={g.id} className="flex min-w-[112px] flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <div className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : i <= currentGroupIndex ? "bg-primary" : "bg-border")} />
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                  !done && !isCurrent && "border-border bg-surface text-muted",
                )}
                style={
                  done || isCurrent
                    ? { borderColor: g.color, background: done ? g.color : "var(--surface)", color: done ? "#fff" : g.color }
                    : undefined
                }
              >
                {done ? <Check className="size-4" aria-hidden /> : g.letter}
              </div>
              <div className={cn("h-0.5 flex-1", i === catalog.length - 1 ? "bg-transparent" : i < currentGroupIndex ? "bg-primary" : "bg-border")} />
            </div>
            <div className={cn("mt-1.5 px-1 text-[11px] leading-tight", isCurrent ? "font-semibold text-text" : "text-muted")}>
              {g.name}
            </div>
            {isCurrent && current && (
              <div className="mt-0.5 px-1 text-[11px] font-medium leading-tight" style={{ color: g.color }}>
                {current.code} · {current.name}
              </div>
            )}
            {date && (done || isCurrent) && <div className="num mt-0.5 text-[10px] text-muted">{formatDate(date)}</div>}
          </li>
        );
      })}
    </ol>
  );
}
