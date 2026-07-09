import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock3,
  Eye,
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
  current:
    "border-[var(--phase-current-border)] bg-[var(--phase-current-bg)] text-[var(--phase-current-text)]",
  viewing:
    "border-[var(--phase-viewing-border)] bg-[var(--phase-viewing-bg)] text-[var(--phase-viewing-text)]",
  completed:
    "border-[var(--phase-completed-border)] bg-[var(--phase-completed-bg)] text-[var(--phase-completed-text)]",
  available:
    "border-[var(--phase-available-border)] bg-[var(--phase-available-bg)] text-[var(--phase-available-text)] hover:bg-[var(--surface-hover)]",
  blocked:
    "border-[var(--phase-blocked-border)] bg-[var(--phase-blocked-bg)] text-[var(--phase-blocked-text)]",
};

export function LicitacaoPhaseStepper({
  phases,
  onSelectPhase,
}: LicitacaoPhaseStepperProps) {
  const viewingPhase = phases.find((phase) => phase.status === "viewing");
  const currentPhase = phases.find((phase) => phase.status === "current");

  return (
    <div className="space-y-2">
      <nav
        aria-label="Fases da licitacao"
        className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-2 py-2 shadow-[var(--shadow-card)]"
      >
        <div className="flex snap-x gap-2 overflow-x-auto pb-1">
          {phases.map((phase) => {
            const Icon = phaseIcons[phase.key];
            const blocked = phase.status === "blocked";
            const StatusIcon =
              phase.status === "completed"
                ? CheckCircle2
                : phase.status === "viewing"
                  ? Eye
                  : blocked
                    ? Lock
                    : phase.status === "current"
                      ? Icon
                      : Circle;

            return (
              <button
                key={phase.key}
                type="button"
                aria-current={phase.isSelected ? "step" : undefined}
                disabled={blocked}
                onClick={() => onSelectPhase(phase.key)}
                className={[
                  "group flex min-h-[56px] min-w-[154px] snap-start items-center gap-2 rounded-[14px] border px-3 py-2 text-left transition",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-panel)]",
                  blocked ? "cursor-not-allowed" : "hover:-translate-y-0.5",
                  statusClassName[phase.status],
                ].join(" ")}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-current/30 bg-[var(--surface-raised)]">
                  <StatusIcon className="h-4 w-4" />
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em]">
                    <span>{phase.statusLabel}</span>
                    {phase.pendingCount > 0 ? (
                      <span className="rounded-full border border-current/30 px-1.5 py-0.5">
                        {phase.pendingCount}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-sm font-black">
                    {phase.shortLabel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {viewingPhase && currentPhase ? (
        <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--notice-warning-border)] bg-[var(--notice-warning-bg)] px-3 py-2 text-sm text-[var(--notice-warning-text)] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold">
            Visualizando etapa concluida: {viewingPhase.shortLabel}.
          </span>
          <button
            type="button"
            onClick={() => onSelectPhase(currentPhase.key)}
            className="inline-flex items-center justify-center rounded-lg border border-current/40 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]"
          >
            Voltar para etapa atual
          </button>
        </div>
      ) : null}
    </div>
  );
}
