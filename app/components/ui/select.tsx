import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "./utils";

export type SelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  helperText?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, helperText, error, options, placeholder, id, className, ...props },
  ref,
) {
  const selectId = id ?? props.name;
  const descriptionId = selectId ? `${selectId}-description` : undefined;

  return (
    <div className="grid gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          "h-10 w-full rounded-lg border bg-white px-3.5 text-sm text-slate-950 shadow-sm transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:bg-slate-900 dark:text-slate-50 dark:disabled:bg-slate-800",
          error
            ? "border-red-300 focus:border-red-600 focus:ring-red-600/20"
            : "border-slate-200 focus:border-emerald-600 focus:ring-emerald-600/20 dark:border-slate-700",
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helperText ? descriptionId : undefined}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {(error || helperText) && (
        <p id={descriptionId} className={cn("text-xs leading-5", error ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-slate-400")}>
          {error || helperText}
        </p>
      )}
    </div>
  );
});
