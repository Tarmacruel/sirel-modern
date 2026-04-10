import { Link } from "wouter";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

export type ActionStripItem = {
  id: string;
  label: string;
  description: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
  badge?: string | null;
};

interface ActionStripProps {
  title?: string;
  description?: string;
  items: ActionStripItem[];
  dataTourId?: string;
}

export function ActionStrip({ title = "Próximas ações", description, items, dataTourId }: ActionStripProps) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="space-y-3" data-tour-id={dataTourId}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="font-[var(--font-heading)] text-lg font-black tracking-tight text-[var(--text-primary)]">{title}</h3>
          {description ? <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const content = (
            <Card className="h-full border-[var(--border-subtle)] bg-[var(--surface-card)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]">
              <div className="flex items-start justify-between gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--accent-color)]">
                  {item.icon}
                </div>
                {item.badge ? <span className="rounded-full bg-[var(--surface-highlight)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]">{item.badge}</span> : null}
              </div>
              <p className="mt-4 text-base font-black text-[var(--text-primary)]">{item.label}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.description}</p>
              <div className="mt-5 inline-flex w-full items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">
                <span>Abrir ação</span>
                <span className="text-[var(--text-muted)]">→</span>
              </div>
            </Card>
          );

          if (item.href) {
            return (
              <Link key={item.id} href={item.href}>
                {content}
              </Link>
            );
          }

          return (
            <button key={item.id} type="button" onClick={item.onClick} className="text-left">
              {content}
            </button>
          );
        })}
      </div>
    </section>
  );
}
