import { Link } from "wouter";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ContextEmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  action?: ReactNode;
}

export function ContextEmptyState({ title, description, icon, actionLabel, actionHref, action }: ContextEmptyStateProps) {
  return (
    <Card className="border-dashed bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,249,252,0.94))]">
      <div className="flex flex-col items-center justify-center py-8 text-center sm:py-12">
        {icon ? <div className="inline-flex h-14 w-14 items-center justify-center rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--accent-color)]">{icon}</div> : null}
        <h3 className="mt-4 font-[var(--font-heading)] text-2xl font-black tracking-tight text-[var(--text-primary)]">{title}</h3>
        <p className="mt-3 max-w-xl text-sm leading-7 text-[var(--text-secondary)]">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
        {!action && actionHref && actionLabel ? (
          <div className="mt-5">
            <Link href={actionHref}>
              <Button>{actionLabel}</Button>
            </Link>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
