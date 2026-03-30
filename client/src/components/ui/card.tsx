import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  action?: ReactNode;
  contentClassName?: string;
}

export function Card({ children, className, title, action, contentClassName, ...props }: CardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] backdrop-blur",
        className,
      )}
      {...props}
    >
      {title || action ? (
        <header className="flex flex-col gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title ? <h3 className="font-[var(--font-heading)] text-lg font-bold tracking-tight text-[var(--text-primary)]">{title}</h3> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  );
}
