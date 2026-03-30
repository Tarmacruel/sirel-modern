import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, error = false, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:bg-[var(--surface-soft)]",
        error
          ? "border-[var(--danger-color)]/45 focus:border-[var(--danger-color)]"
          : "focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--surface-highlight)]",
        className,
      )}
      {...props}
    />
  );
});
