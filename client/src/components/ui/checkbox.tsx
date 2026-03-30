import type { ChangeEvent, InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({ className, onChange, onCheckedChange, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--accent-color)] focus:ring-[var(--surface-highlight)]",
        className,
      )}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        onChange?.(event);
        onCheckedChange?.(event.target.checked);
      }}
      {...props}
    />
  );
}
