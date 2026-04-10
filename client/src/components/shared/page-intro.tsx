import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PageIntroProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  aside?: ReactNode;
  meta?: Array<{ label: string; value: string; tone?: "default" | "accent" | "warning" | "danger" | "success" }>;
  className?: string;
  contentClassName?: string;
  dataTourId?: string;
}

function metaToneClass(tone: NonNullable<PageIntroProps["meta"]>[number]["tone"] = "default") {
  switch (tone) {
    case "accent":
      return "border-[rgba(113,189,255,0.28)] bg-[rgba(113,189,255,0.14)] text-white";
    case "warning":
      return "border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.16)] text-white";
    case "danger":
      return "border-[rgba(248,113,113,0.28)] bg-[rgba(248,113,113,0.16)] text-white";
    case "success":
      return "border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.14)] text-white";
    default:
      return "border-white/12 bg-white/[0.06] text-white";
  }
}

export function PageIntro({ eyebrow, title, description, actions, aside, meta, className, contentClassName, dataTourId }: PageIntroProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-[rgba(12,26,61,0.08)] bg-[linear-gradient(135deg,#0f1728_0%,#17304c_46%,#0e1f33_100%)] text-white shadow-[0_24px_70px_-42px_rgba(10,20,50,0.85)]",
        className,
      )}
      contentClassName={cn("relative p-0", contentClassName)}
      data-tour-id={dataTourId}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(134,239,255,0.18),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(96,165,250,0.14),transparent_28%)]" />
        <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="relative grid gap-6 px-5 py-5 sm:px-6 sm:py-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)] xl:items-end">
        <div>
          {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-sky-100/72">{eyebrow}</p> : null}
          <h2 className="mt-3 max-w-4xl font-[var(--font-heading)] text-3xl font-black leading-[1.02] tracking-[-0.05em] sm:text-[2.7rem]">
            {title}
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 sm:text-[15px]">{description}</p>

          {meta?.length ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {meta.map((item) => (
                <div key={item.label} className={cn("min-w-[140px] rounded-[22px] border px-4 py-3 backdrop-blur-sm", metaToneClass(item.tone))}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">{item.label}</p>
                  <p className="mt-2 text-lg font-black tracking-[-0.03em]">{item.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {actions ? <div className="mt-6">{actions}</div> : null}
        </div>

        <div className="xl:justify-self-end">{aside}</div>
      </div>
    </Card>
  );
}
