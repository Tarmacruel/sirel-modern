import type { CSSProperties } from "react";

import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Info } from "lucide-react";
import { Link } from "wouter";

import { Card } from "@/components/ui/card";

export type CriticalAlertItem = {
  id: string;
  title: string;
  description: string;
  eyebrow?: string;
  href?: string;
  tone?: "danger" | "warning" | "info" | "success";
};

interface CriticalAlertRailProps {
  title?: string;
  description?: string;
  items: CriticalAlertItem[];
  dataTourId?: string;
}

function toneMeta(tone: CriticalAlertItem["tone"] = "info") {
  switch (tone) {
    case "danger":
      return { tint: "#fb7185", icon: <AlertTriangle className="h-4 w-4" /> };
    case "warning":
      return { tint: "#f6ad55", icon: <Clock3 className="h-4 w-4" /> };
    case "success":
      return { tint: "#34d399", icon: <CheckCircle2 className="h-4 w-4" /> };
    default:
      return { tint: "#67b2ea", icon: <Info className="h-4 w-4" /> };
  }
}

function buildToneStyles(tint: string) {
  return {
    card: {
      borderColor: `color-mix(in srgb, ${tint} 28%, var(--border-subtle))`,
      background: `linear-gradient(180deg, color-mix(in srgb, var(--surface-card) 88%, ${tint} 12%), color-mix(in srgb, var(--surface-soft) 92%, ${tint} 8%))`,
      boxShadow: "var(--shadow-card)",
    } satisfies CSSProperties,
    icon: {
      color: tint,
      borderColor: `color-mix(in srgb, ${tint} 34%, var(--border-subtle))`,
      background: `color-mix(in srgb, var(--surface-elevated) 84%, ${tint} 16%)`,
    } satisfies CSSProperties,
    accentLine: {
      background: `linear-gradient(90deg, transparent, ${tint}, transparent)`,
    } satisfies CSSProperties,
    link: {
      color: `color-mix(in srgb, ${tint} 72%, var(--text-primary))`,
    } satisfies CSSProperties,
  };
}

export function CriticalAlertRail({ title = "Leitura crítica", description, items, dataTourId }: CriticalAlertRailProps) {
  if (!items.length) return null;

  return (
    <section className="space-y-3" data-tour-id={dataTourId}>
      <div>
        <h3 className="font-[var(--font-heading)] text-lg font-black tracking-tight text-[var(--text-primary)]">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {items.map((item) => {
          const meta = toneMeta(item.tone);
          const toneStyles = buildToneStyles(meta.tint);
          const card = (
            <Card className="relative h-full overflow-hidden border" style={toneStyles.card}>
              <div className="pointer-events-none absolute inset-x-5 top-0 h-px" style={toneStyles.accentLine} />
              <div className="flex items-start gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border" style={toneStyles.icon}>
                  {meta.icon}
                </div>
                <div className="min-w-0 flex-1">
                  {item.eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">{item.eyebrow}</p> : null}
                  <p className="mt-1 text-base font-black text-[var(--text-primary)]">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.description}</p>
                  {item.href ? (
                    <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold" style={toneStyles.link}>
                      Abrir contexto <ArrowRight className="h-4 w-4" />
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          );

          return item.href ? (
            <Link key={item.id} href={item.href}>
              {card}
            </Link>
          ) : (
            <div key={item.id}>
              {card}
            </div>
          );
        })}
      </div>
    </section>
  );
}
