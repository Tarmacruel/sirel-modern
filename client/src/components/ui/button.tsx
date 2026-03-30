import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "border border-transparent bg-[var(--color-primary-500)] text-white shadow-[0_12px_24px_-18px_rgba(36,64,167,0.65)] hover:bg-[var(--color-primary-600)] hover:shadow-[0_16px_28px_-18px_rgba(36,64,167,0.7)]",
  outline:
    "border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]",
  secondary:
    "border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]",
  destructive:
    "border border-[var(--danger-color)]/35 bg-[var(--danger-bg)] text-[var(--danger-color)] hover:border-[var(--danger-color)]/60 hover:bg-[var(--danger-bg)] hover:text-[var(--danger-color)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 rounded-2xl px-3 text-xs font-semibold",
  md: "h-11 rounded-2xl px-4 text-sm font-semibold",
  lg: "h-12 rounded-2xl px-5 text-sm font-semibold",
  icon: "h-10 w-10 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, variant = "default", size = "md", type = "button", loading = false, icon, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
      {icon && !loading ? <span className="shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
});
