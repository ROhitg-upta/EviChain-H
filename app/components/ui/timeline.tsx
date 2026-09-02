import type { ReactNode } from "react";
import { cn } from "./utils";

type TimelineTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClass: Record<TimelineTone, string> = {
  neutral: "bg-slate-400",
  success: "bg-emerald-600",
  warning: "bg-amber-500",
  danger: "bg-red-600",
  info: "bg-blue-600",
};

export type TimelineItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  tone?: TimelineTone;
};

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("space-y-0", className)} aria-label="Timeline">
      {items.map((item, index) => (
        <li key={item.id} className="relative grid grid-cols-[1rem_1fr] gap-3 pb-5 last:pb-0">
          {index < items.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200 dark:bg-slate-800" aria-hidden="true" />}
          <span className={cn("relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-white dark:border-slate-950", toneClass[item.tone ?? "neutral"])} aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-semibold text-slate-950 dark:text-slate-50">{item.title}</div>
            {item.meta && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.meta}</div>}
            {item.description && <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.description}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
