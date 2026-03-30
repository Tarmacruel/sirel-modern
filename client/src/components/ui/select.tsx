import { forwardRef, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, error = false, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition disabled:cursor-not-allowed disabled:bg-[var(--surface-soft)]",
        error
          ? "border-[var(--danger-color)]/45 focus:border-[var(--danger-color)]"
          : "focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--surface-highlight)]",
        className,
      )}
      {...props}
    />
  );
});
