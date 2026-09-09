import type { LicitacaoGuidedPhaseKey } from "@sirel/shared/licitacao-guided-flow";

type PhaseAccess = { key: LicitacaoGuidedPhaseKey; accessible: boolean; complete: boolean };

export function resolveAccessibleLicitacaoPhase(requested: LicitacaoGuidedPhaseKey, phases: readonly PhaseAccess[]) {
  if (phases.some((phase) => phase.key === requested && phase.accessible)) return requested;
  return phases.find((phase) => phase.accessible && !phase.complete)?.key
    ?? phases.find((phase) => phase.accessible)?.key ?? "PREPARACAO";
}
