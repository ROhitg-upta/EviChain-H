import type { HTMLAttributes } from "react";
import { cn } from "./utils";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export function Card({ interactive = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-800 bg-slate-900 text-slate-100 p-5 shadow-sm shadow-black/20 dark:border-slate-800 dark:bg-slate-900",
        interactive && "transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md focus-within:border-emerald-400",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-start justify-between gap-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-bold leading-tight tracking-normal text-slate-100 dark:text-slate-50", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("mt-1 text-sm leading-6 text-slate-400 dark:text-slate-400", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-sm text-slate-200 dark:text-slate-200", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-4 dark:border-slate-800", className)}
      {...props}
    />
  );
}
