import type { ReactNode } from "react";
import { Card } from "./card";
import { cn } from "./utils";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "text-slate-950 dark:text-slate-50",
  brand: "text-emerald-700 dark:text-emerald-300",
  success: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-700 dark:text-amber-300",
  danger: "text-red-700 dark:text-red-300",
  info: "text-blue-700 dark:text-blue-300",
};

export type StatsCardProps = {
  label: string;
  value: ReactNode;
  helperText?: string;
  icon?: ReactNode;
  trend?: ReactNode;
  tone?: Tone;
};

export function StatsCard({ label, value, helperText, icon, trend, tone = "neutral" }: StatsCardProps) {
  return (
    <Card className="min-h-32">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {icon && <span className={cn("grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-sm dark:bg-slate-800", toneClass[tone])}>{icon}</span>}
      </div>
      <div className={cn("mt-4 text-3xl font-extrabold leading-none tracking-normal", toneClass[tone])}>{value}</div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        {helperText && <span>{helperText}</span>}
        {trend && <span className="font-semibold">{trend}</span>}
      </div>
    </Card>
  );
}
