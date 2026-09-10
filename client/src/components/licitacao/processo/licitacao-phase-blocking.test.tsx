import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LicitacaoPhaseStepper } from "./licitacao-phase-stepper";
import { resolveAccessibleLicitacaoPhase } from "@/lib/licitacao-phase-access";
import { getLicitacaoGuidedPhaseSequence } from "@sirel/shared/licitacao-guided-flow";
import type { LicitacaoGuidedPhaseView } from "@/lib/licitacao-processo-view-model";

describe("navegacao bloqueada da dispensa simplificada", () => {
  afterEach(cleanup);
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

  it("mantem bloqueios na navegacao compacta e devolve o foco ao fechar por Escape", () => {
    const select = vi.fn();
    render(<LicitacaoPhaseStepper compact phases={phases} onSelectPhase={select} />);
    const toggle = screen.getByRole("button", { name: "Ver etapas" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Homologacao/i })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    const homologacao = screen.getByRole("button", { name: /Homologacao/i });
    expect(homologacao).toBeDisabled();
    fireEvent.click(homologacao);
    expect(select).not.toHaveBeenCalled();
    const preparation = screen.getByRole("button", { name: /Preparacao/i });
    preparation.focus();
    fireEvent.keyDown(preparation, { key: "Escape" });
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("permite selecionar uma fase liberada no modo compacto", () => {
    const select = vi.fn();
    const ready = phases.map((phase, index): LicitacaoGuidedPhaseView => index === 1
      ? { ...phase, accessible: true, status: "available" }
      : phase);
    render(<LicitacaoPhaseStepper compact phases={ready} onSelectPhase={select} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver etapas" }));
    fireEvent.click(screen.getByRole("button", { name: /Publicacao/i }));
    expect(select).toHaveBeenCalledWith("PUBLICACAO");
    expect(screen.getByRole("button", { name: "Ver etapas" })).toHaveFocus();
  });
});
