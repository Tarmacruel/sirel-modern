import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface MetricTileProps {
  label: string;
  value: string;
  description?: string;
  icon?: ReactNode;
  accent?: boolean;
}

export function MetricTile({ label, value, description, icon, accent = false }: MetricTileProps) {
  return (
    <Card className={accent ? "bg-[linear-gradient(180deg,rgba(10,26,48,0.98),rgba(19,49,76,0.98))] text-white" : ""}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className={accent ? "text-[11px] font-bold uppercase tracking-[0.22em] text-white/72" : "text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]"}>{label}</p>
          <p className={accent ? "mt-3 text-3xl font-black tracking-[-0.04em] text-white" : "mt-3 text-3xl font-black tracking-[-0.04em] text-[var(--text-primary)]"}>{value}</p>
          {description ? <p className={accent ? "mt-2 text-sm leading-6 text-white/78" : "mt-2 text-sm leading-6 text-[var(--text-secondary)]"}>{description}</p> : null}
        </div>
        {icon ? (
          <div className={accent ? "inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/12 bg-white/10 text-white" : "inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--accent-color)]"}>
            {icon}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
