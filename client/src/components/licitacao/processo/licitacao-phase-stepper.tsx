import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FolderKanban,
  Lock,
  ShieldCheck,
} from "lucide-react";

import type {
  LicitacaoGuidedPhaseView,
  LicitacaoProcessoPhaseKey,
} from "@/lib/licitacao-processo-view-model";

interface LicitacaoPhaseStepperProps {
  phases: LicitacaoGuidedPhaseView[];
  onSelectPhase: (phase: LicitacaoProcessoPhaseKey) => void;
}

const phaseIcons = {
  PREPARACAO: ShieldCheck,
  PUBLICACAO: CalendarClock,
  DISPUTA: FolderKanban,
  JULGAMENTO_HABILITACAO: FileCheck2,
  RECURSOS_HOMOLOGACAO: CheckCircle2,
  FECHAMENTO: Clock3,
} satisfies Record<LicitacaoProcessoPhaseKey, typeof ShieldCheck>;

const statusClassName = {
  active: "border-[var(--border-strong)] bg-[var(--surface-highlight)]",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-900",
  available:
    "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]",
  blocked: "border-[var(--border-subtle)] bg-[var(--surface-soft)] opacity-70",
};

export function LicitacaoPhaseStepper({
  phases,
  onSelectPhase,
}: LicitacaoPhaseStepperProps) {
  return (
    <nav
      aria-label="Fases da licitacao"
      className="overflow-hidden rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex gap-3 overflow-x-auto pb-1">
        {phases.map((phase) => {
          const Icon = phaseIcons[phase.key];
          const blocked = phase.status === "blocked";

          return (
            <button
              key={phase.key}
              type="button"
              aria-current={phase.isSelected ? "step" : undefined}
              disabled={blocked}
              onClick={() => onSelectPhase(phase.key)}
              className={[
                "group min-w-[190px] rounded-[22px] border px-4 py-4 text-left transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] focus-visible:ring-offset-2",
                statusClassName[phase.status],
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--accent-color)]">
                  {blocked ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {phase.statusLabel}
                </span>
              </div>

              <div className="mt-4 text-sm font-black text-[var(--text-primary)]">
                {phase.shortLabel}
              </div>
              <div className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                {phase.pendingLabel}
              </div>
              {phase.isRuntime ? (
                <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-primary-600)]">
                  Em execucao
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
