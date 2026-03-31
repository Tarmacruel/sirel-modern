import type { ReactNode } from "react";

import { macroPhaseDefinitions, type MacroModuleKey, type MacroModuleStatus } from "@/lib/process-macro-flow";
import { cn } from "@/lib/utils";

interface ProcessMacroPanelProps {
  moduleLabel: string;
  title: string;
  processNumber?: string | null;
  modalidade?: string | null;
  secretaria?: string | null;
  etapaAtual?: string | null;
  objeto?: string | null;
  foraDoFluxo?: boolean;
  phaseStatuses: Record<MacroModuleKey, MacroModuleStatus>;
  summary?: Array<{ label: string; value: string; tone?: "default" | "accent" }>;
  blockers?: Array<{ label: string; detalhe?: string }>;
  targetLabel?: string | null;
  actions?: ReactNode;
  footer?: ReactNode;
}

const phaseClasses: Record<MacroModuleStatus, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-900",
  current:
    "border-[rgba(90,170,255,0.55)] bg-[linear-gradient(180deg,rgba(101,166,255,0.22),rgba(101,166,255,0.08))] text-[var(--text-primary)] shadow-[0_18px_34px_-28px_rgba(43,94,255,0.55)]",
  upcoming: "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)]",
};

export function ProcessMacroPanel({
  moduleLabel,
  title,
  processNumber,
  modalidade,
  secretaria,
  etapaAtual,
  objeto,
  foraDoFluxo,
  phaseStatuses,
  summary = [],
  blockers = [],
  targetLabel,
  actions,
  footer,
}: ProcessMacroPanelProps) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-soft)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
              <span>{moduleLabel}</span>
              {foraDoFluxo ? <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">Fora do fluxo</span> : null}
            </div>
            <div>
              <h2 className="font-[var(--font-heading)] text-2xl font-black tracking-tight text-[var(--text-primary)]">{title}</h2>
              {processNumber || modalidade || secretaria ? (
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{[processNumber, modalidade, secretaria].filter(Boolean).join(" - ")}</p>
              ) : null}
              {etapaAtual ? <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">Etapa atual: {etapaAtual}</p> : null}
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {objeto ? <p className="mt-4 max-w-4xl text-sm leading-7 text-[var(--text-secondary)]">{objeto}</p> : null}
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div className="grid gap-3 xl:grid-cols-4">
          {macroPhaseDefinitions.map((phase) => {
            const status = phaseStatuses[phase.key];
            const badge = status === "done" ? "Concluida" : status === "current" ? "Atual" : "Proxima";
            return (
              <article key={phase.key} className={cn("rounded-[26px] border px-4 py-4 transition", phaseClasses[status])}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-black tracking-tight">{phase.label}</p>
                  <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]">{badge}</span>
                </div>
                <p className="mt-3 text-sm leading-6 opacity-85">{phase.description}</p>
              </article>
            );
          })}
        </div>

        {summary.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summary.map((item) => (
              <article key={item.label} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">{item.label}</p>
                <p className={cn("mt-2 text-2xl font-black", item.tone === "accent" ? "text-[var(--accent-color)]" : "text-[var(--text-primary)]")}>{item.value}</p>
              </article>
            ))}
          </div>
        ) : null}

        {targetLabel ? (
          <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Transicao macro</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">Proximo destino: {targetLabel}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                  {blockers.length
                    ? `Ainda existem ${blockers.length} pendencia(s) operacionais antes de liberar a proxima macrofase.`
                    : "O processo esta apto para seguir para a proxima macrofase sem pendencias bloqueantes."}
                </p>
              </div>
              {footer ? <div className="shrink-0">{footer}</div> : null}
            </div>
            {blockers.length ? (
              <ul className="mt-4 grid gap-2 md:grid-cols-2">
                {blockers.slice(0, 6).map((item) => (
                  <li key={item.label} className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                    <div className="font-semibold">{item.label}</div>
                    {item.detalhe ? <div className="mt-1 text-xs leading-5 text-amber-800">{item.detalhe}</div> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
