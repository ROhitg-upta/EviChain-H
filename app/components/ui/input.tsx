import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ChangeEvent,
} from "react";
import { cn } from "./utils";

type FieldState = "default" | "error" | "success";

const stateClass: Record<FieldState, string> = {
  default:
    "border-slate-200 focus:border-emerald-600 focus:ring-emerald-600/20 dark:border-slate-700",
  error:
    "border-red-300 focus:border-red-600 focus:ring-red-600/20 dark:border-red-500",
  success:
    "border-emerald-300 focus:border-emerald-600 focus:ring-emerald-600/20 dark:border-emerald-500",
};

const fieldClass =
  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
  error?: string;
  fieldState?: FieldState;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helperText, error, fieldState = "default", id, className, type = "text", ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const descriptionId = inputId ? `${inputId}-description` : undefined;
  const activeState = error ? "error" : fieldState;

  return (
    <div className="grid gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        type={type}
        className={cn(
          fieldClass,
          type === "file" && "cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100",
          stateClass[activeState],
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helperText ? descriptionId : undefined}
        {...props}
      />
      {(error || helperText) && (
        <p
          id={descriptionId}
          className={cn(
            "text-xs leading-5",
            error ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-slate-400",
          )}
        >
          {error || helperText}
        </p>
      )}
    </div>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  helperText?: string;
  error?: string;
  autoResize?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, helperText, error, autoResize = true, id, className, onChange, rows = 3, ...props },
    ref,
  ) {
    const textareaId = id ?? props.name;
    const descriptionId = textareaId ? `${textareaId}-description` : undefined;

    function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
      if (autoResize) {
        event.currentTarget.style.height = "auto";
        event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
      }
      onChange?.(event);
    }

    return (
      <div className="grid gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          onChange={handleChange}
          className={cn(
            fieldClass,
            "min-h-24 resize-y leading-6",
            stateClass[error ? "error" : "default"],
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || helperText ? descriptionId : undefined}
          {...props}
        />
        {(error || helperText) && (
          <p
            id={descriptionId}
            className={cn(
              "text-xs leading-5",
              error ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-slate-400",
            )}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  },
);
