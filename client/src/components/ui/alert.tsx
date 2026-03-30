import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "error";

const variantMap: Record<AlertVariant, { wrapper: string; icon: ReactNode }> = {
  info: { wrapper: "border-[var(--info-color)]/35 bg-[var(--info-bg)] text-[var(--text-secondary)]", icon: <Info className="h-4 w-4" /> },
  success: { wrapper: "border-[var(--success-color)]/35 bg-[var(--success-bg)] text-[var(--text-secondary)]", icon: <CheckCircle2 className="h-4 w-4" /> },
  warning: { wrapper: "border-[var(--warning-color)]/35 bg-[var(--warning-bg)] text-[var(--text-secondary)]", icon: <TriangleAlert className="h-4 w-4" /> },
  error: { wrapper: "border-[var(--danger-color)]/35 bg-[var(--danger-bg)] text-[var(--text-secondary)]", icon: <AlertCircle className="h-4 w-4" /> },
};

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Alert({ variant = "info", title, children, className }: AlertProps) {
  return (
    <div className={cn("rounded-[22px] border px-4 py-3 text-sm shadow-[0_10px_24px_-24px_rgba(15,26,109,0.45)]", variantMap[variant].wrapper, className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{variantMap[variant].icon}</div>
        <div className="space-y-1">
          {title ? <p className="font-[var(--font-heading)] font-semibold">{title}</p> : null}
          <div className="leading-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
