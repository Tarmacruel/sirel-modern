import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, error = false, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[120px] w-full rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-3 text-sm leading-6 text-[var(--color-neutral-900)] outline-none transition placeholder:text-[var(--color-neutral-500)] disabled:cursor-not-allowed disabled:bg-[var(--surface-soft)]",
        error ? "border-rose-300 focus:border-rose-400" : "focus:border-[var(--border-strong)]",
        className,
      )}
      {...props}
    />
  );
});
