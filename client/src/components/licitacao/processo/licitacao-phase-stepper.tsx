import { useId, useRef, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Eye,
  FileCheck2,
  FolderKanban,
  Lock,
  Scale,
  ShieldCheck,
} from "lucide-react";

import type {
  LicitacaoGuidedPhaseView,
  LicitacaoProcessoPhaseKey,
} from "@/lib/licitacao-processo-view-model";

interface LicitacaoPhaseStepperProps {
  phases: LicitacaoGuidedPhaseView[];
  onSelectPhase: (phase: LicitacaoProcessoPhaseKey) => void;
  compact?: boolean;
}

const phaseIcons = {
  PREPARACAO: ShieldCheck,
  PUBLICACAO: CalendarClock,
  DISPUTA: FolderKanban,
  JULGAMENTO: FileCheck2,
  HABILITACAO: ShieldCheck,
  RECURSOS: Scale,
  CONTROLE_INTERNO: ShieldCheck,
  HOMOLOGACAO: CheckCircle2,
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
  available_with_pending:
    "border-[var(--notice-warning-border)] bg-[var(--notice-warning-bg)] text-[var(--notice-warning-text)] hover:bg-[var(--surface-hover)]",
  blocked:
    "border-[var(--phase-blocked-border)] bg-[var(--phase-blocked-bg)] text-[var(--phase-blocked-text)]",
};

export function LicitacaoPhaseStepper({
  phases,
  onSelectPhase,
  compact = false,
}: LicitacaoPhaseStepperProps) {
  const [expanded, setExpanded] = useState(false);
  const phaseListId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const viewingPhase = phases.find((phase) => phase.status === "viewing");
  const currentPhase = phases.find((phase) => phase.status === "current");
  const selectedPhase =
    phases.find((phase) => phase.isSelected) ?? currentPhase ?? phases[0];

  if (compact) {
    return (
      <nav
        aria-label="Fases da licitação"
        className="border-t border-[var(--border-subtle)] bg-[var(--surface-panel)]"
      >
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:px-5">
          <div className="flex items-center gap-2.5 text-sm">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary-500)]"
              aria-hidden="true"
            />
            <span className="text-[var(--text-muted)]">
              Etapa {selectedPhase ? phases.indexOf(selectedPhase) + 1 : 0} de{" "}
              {phases.length}
            </span>
            <span className="font-semibold text-[var(--text-primary)]">
              {selectedPhase?.shortLabel}
            </span>
          </div>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={phaseListId}
            onClick={() => setExpanded((open) => !open)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]"
          >
            {expanded ? "Ocultar etapas" : "Ver etapas"}
            <ChevronDown
              aria-hidden="true"
              className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>
        <div
          id={phaseListId}
          hidden={!expanded}
          className="border-t border-[var(--border-subtle)] px-3 py-2 sm:px-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setExpanded(false);
              toggleRef.current?.focus();
            }
          }}
        >
          <ol className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
            {phases.map((phase, index) => {
              const blocked = !phase.accessible || phase.status === "blocked";
              const StatusIcon = phase.completed
                ? CheckCircle2
                : blocked
                  ? Lock
                  : phase.isSelected
                    ? Eye
                    : Circle;
              return (
                <li key={phase.key}>
                  <button
                    type="button"
                    disabled={blocked}
                    aria-current={phase.isSelected ? "step" : undefined}
                    onClick={() => {
                      setExpanded(false);
                      toggleRef.current?.focus();
                      onSelectPhase(phase.key);
                    }}
                    className={[
                      "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]",
                      phase.isSelected
                        ? "bg-[var(--surface-soft)] text-[var(--color-primary-700)]"
                        : "text-[var(--text-secondary)]",
                      blocked
                        ? "cursor-not-allowed text-[var(--text-muted)]"
                        : "hover:bg-[var(--surface-soft)]",
                    ].join(" ")}
                  >
                    <span
                      className="w-4 shrink-0 text-right text-xs tabular-nums"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      {phase.shortLabel}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px]">
                      <StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />
                      {blocked
                        ? "Bloqueada"
                        : phase.status === "current"
                          ? "Atual"
                          : phase.isSelected
                            ? "Em exibição"
                            : phase.completed
                              ? "Concluída"
                              : "Disponível"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        {viewingPhase && currentPhase ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--text-secondary)] sm:px-5">
            <span>Etapa atual do processo: {currentPhase.shortLabel}</span>
            <button
              type="button"
              onClick={() => onSelectPhase(currentPhase.key)}
              className="rounded px-1 py-1 font-semibold text-[var(--color-primary-700)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]"
            >
              Voltar à etapa atual
            </button>
          </div>
        ) : null}
      </nav>
    );
  }

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
