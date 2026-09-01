import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "border-emerald-700 bg-emerald-700 text-white shadow-sm shadow-emerald-950/10 hover:border-emerald-800 hover:bg-emerald-800 focus-visible:ring-emerald-600",
  secondary:
    "border-slate-200 bg-white text-slate-950 shadow-sm hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800",
  ghost:
    "border-transparent bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-emerald-600 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white",
  danger:
    "border-red-700 bg-red-700 text-white shadow-sm shadow-red-950/10 hover:border-red-800 hover:bg-red-800 focus-visible:ring-red-600",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
  icon: "h-10 w-10 p-0",
};

const baseClass =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-semibold tracking-normal transition duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-slate-950";

type BaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
};

type NativeButtonProps = BaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type AnchorButtonProps = BaseProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    disabled?: boolean;
  };

export type ButtonProps = NativeButtonProps | AnchorButtonProps;

export function Button({
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  loading = false,
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    baseClass,
    variantClass[variant],
    sizeClass[size],
    fullWidth && "w-full",
    loading && "cursor-wait",
    className,
  );

  const content = (
    <>
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {!loading && leftIcon}
      <span className={cn(size === "icon" && "sr-only")}>{children}</span>
      {!loading && rightIcon}
    </>
  );

  if ("href" in props && props.href) {
    const { disabled, ...anchorProps } = props;
    return (
      <a
        className={cn(classes, disabled && "pointer-events-none opacity-50")}
        aria-disabled={disabled || undefined}
        {...(anchorProps as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </a>
    );
  }

  const buttonProps = props as ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <button
      className={classes}
      disabled={loading || buttonProps.disabled}
      {...buttonProps}
    >
      {content}
    </button>
  );
}
