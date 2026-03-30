import type { PropsWithChildren, ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface SectionCardProps extends PropsWithChildren {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SectionCard({ title, description, action, children }: SectionCardProps) {
  return (
    <Card
      title={title}
      action={action}
      contentClassName="p-5"
      className="rounded-[28px] border-[var(--border-subtle)] bg-[var(--surface-card)]"
    >
      {description ? <p className="mb-4 text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
      {children}
    </Card>
  );
}
