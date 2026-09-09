import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LicitacaoPhaseStepper } from "./licitacao-phase-stepper";
import { resolveAccessibleLicitacaoPhase } from "@/lib/licitacao-phase-access";
import { getLicitacaoGuidedPhaseSequence } from "@sirel/shared/licitacao-guided-flow";
import type { LicitacaoGuidedPhaseView } from "@/lib/licitacao-processo-view-model";

describe("navegacao bloqueada da dispensa simplificada", () => {
  const phases: LicitacaoGuidedPhaseView[] = getLicitacaoGuidedPhaseSequence({ modalidadeCodigo: "DISPENSA_SIMPLIFICADA", modoDisputa: "NAO_SE_APLICA" })
    .map((phase, index) => ({ ...phase, pendingCount: 1, completed: false, accessible: index === 0,
      status: index === 0 ? "current" : "blocked", statusLabel: "Pendente", pendingLabel: "1 pendencia", isSelected: index === 0, isRuntime: index === 0 }));

  it("desabilita clique nas fases futuras e omite disputa e recursos", () => {
    const select = vi.fn();
    render(<LicitacaoPhaseStepper phases={phases} onSelectPhase={select} />);
    const homologacao = screen.getByRole("button", { name: /Homologacao/i });
    expect(homologacao).toBeDisabled();
    fireEvent.click(homologacao);
    expect(select).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Disputa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Recursos/i })).not.toBeInTheDocument();
  });

  it("redireciona URL ou sessao salva em fase bloqueada para a primeira pendencia", () => {
    const access = phases.map((phase) => ({ ...phase, complete: phase.completed }));
    expect(resolveAccessibleLicitacaoPhase("HOMOLOGACAO", access)).toBe("PREPARACAO");
    expect(resolveAccessibleLicitacaoPhase("DISPUTA", access)).toBe("PREPARACAO");
    access[0].complete = true; access[1].accessible = true;
    expect(resolveAccessibleLicitacaoPhase("HOMOLOGACAO", access)).toBe("PUBLICACAO");
    expect(resolveAccessibleLicitacaoPhase("PREPARACAO", access)).toBe("PREPARACAO");
  });
});
