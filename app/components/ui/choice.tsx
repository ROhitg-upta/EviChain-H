import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./utils";

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  description?: string;
};

export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(
  function Checkbox({ label, description, className, id, ...props }, ref) {
    const inputId = id ?? props.name;
    return (
      <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800", className)}>
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-2 focus:ring-emerald-600 dark:border-slate-600"
          {...props}
        />
        <span className="grid gap-0.5">
          <span className="text-sm font-semibold text-slate-950 dark:text-slate-50">{label}</span>
          {description && <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>}
        </span>
      </label>
    );
  },
);

export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(
  function Radio({ label, description, className, id, ...props }, ref) {
    const inputId = id ?? props.name;
    return (
      <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800", className)}>
        <input
          ref={ref}
          id={inputId}
          type="radio"
          className="mt-0.5 h-4 w-4 border-slate-300 text-emerald-700 focus:ring-2 focus:ring-emerald-600 dark:border-slate-600"
          {...props}
        />
        <span className="grid gap-0.5">
          <span className="text-sm font-semibold text-slate-950 dark:text-slate-50">{label}</span>
          {description && <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>}
        </span>
      </label>
    );
  },
);
