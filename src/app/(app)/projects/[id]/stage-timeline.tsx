import { useTranslations } from "next-intl";
import type { ProjectStage } from "@prisma/client";
import { Check } from "lucide-react";
import { STAGES, stageIndex } from "@/lib/stages";
import { formatDate, cn } from "@/lib/utils";

export function StageTimeline({ stage, reached }: { stage: ProjectStage; reached: Map<ProjectStage, Date> }) {
  const t = useTranslations("stages");
  const current = stageIndex(stage);
  return (
    <ol className="flex gap-0 overflow-x-auto pb-2">
      {STAGES.map((s, i) => {
        const done = i < current;
        const isCurrent = i === current;
        const date = reached.get(s);
        return (
          <li key={s} className="flex min-w-[92px] flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <div className={cn("h-0.5 flex-1", i === 0 ? "bg-transparent" : i <= current ? "bg-primary" : "bg-border")} />
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold",
                  done && "border-primary bg-primary text-primary-fg",
                  isCurrent && "border-primary bg-primary-soft text-primary ring-4 ring-primary/15",
                  !done && !isCurrent && "border-border bg-surface text-muted",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </div>
              <div
                className={cn("h-0.5 flex-1", i === STAGES.length - 1 ? "bg-transparent" : i < current ? "bg-primary" : "bg-border")}
              />
            </div>
            <div className={cn("mt-1.5 px-1 text-[11px] leading-tight", isCurrent ? "font-semibold text-text" : "text-muted")}>
              {t(s)}
            </div>
            {date && (done || isCurrent) && <div className="num mt-0.5 text-[10px] text-muted">{formatDate(date)}</div>}
          </li>
        );
      })}
    </ol>
  );
}
