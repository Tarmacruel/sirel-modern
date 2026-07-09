import { describe, expect, it } from "vitest";

import {
  buildLicitacaoProcessoViewModel,
  type BuildLicitacaoProcessoViewModelInput,
} from "@/lib/licitacao-processo-view-model";

const baseInput: BuildLicitacaoProcessoViewModelInput = {
  processoNumero: "LIC-001/2026",
  modalidade: "Pregao eletronico",
  secretaria: "Secretaria de Administracao",
  activePhase: "PREPARACAO",
  activePhaseLabel: "Preparacao Interna",
  currentProcessPhase: "PREPARACAO",
  currentProcessPhaseLabel: "Preparacao Interna",
  responsavel: "Maria",
  isForaDoFluxo: false,
  checklistDoneCount: 2,
  checklistTotalCount: 4,
  documentCount: 3,
  selectedPhaseLeadSectionLabel: "Fase interna",
  nextPendingChecklistLabel: "Termo de referencia",
  primaryActionLabel: "Avancar para publicacao",
  primaryActionHelper:
    "Conclua o checklist interno antes de liberar a publicacao.",
  primaryActionDisabled: true,
  flowLabel: "Pregao",
  disputeLabel: "Com disputa",
  phases: [
    {
      key: "PREPARACAO",
      label: "Preparacao Interna",
      shortLabel: "Preparacao",
      description: "Checklist interno.",
      pendingCount: 2,
      completed: false,
      accessible: true,
    },
    {
      key: "PUBLICACAO",
      label: "Publicacao",
      shortLabel: "Publicacao",
      description: "Cronograma.",
      pendingCount: 0,
      completed: false,
      accessible: false,
    },
  ],
  selectedPhasePendingItems: [
    {
      category: "TR",
      label: "Termo de referencia",
      detalhe: "Anexe a evidencia obrigatoria.",
    },
  ],
};

describe("buildLicitacaoProcessoViewModel", () => {
  it("orienta preparacao pendente para resolver o proximo ato", () => {
    const model = buildLicitacaoProcessoViewModel(baseInput);

    expect(model.nextAction.intent).toBe("focus_pending");
    expect(model.nextAction.primaryDisabled).toBe(false);
    expect(model.nextAction.blockedReason).toContain("Conclua o checklist");
    expect(model.preparation.progressPercent).toBe(50);
    expect(model.preparation.nextPendingLabel).toBe("Termo de referencia");
  });

  it("libera a acao da etapa quando a preparacao nao tem pendencias", () => {
    const model = buildLicitacaoProcessoViewModel({
      ...baseInput,
      checklistDoneCount: 4,
      selectedPhasePendingItems: [],
      primaryActionHelper: "Checklist pronto para abrir a etapa de publicacao.",
      primaryActionDisabled: false,
      phases: baseInput.phases.map((phase) =>
        phase.key === "PREPARACAO"
          ? { ...phase, pendingCount: 0, completed: false }
          : { ...phase, accessible: true },
      ),
    });

    expect(model.nextAction.intent).toBe("run_phase_action");
    expect(model.nextAction.primaryLabel).toBe("Avancar para publicacao");
    expect(model.nextAction.blockedReason).toBeUndefined();
    expect(model.assistant.legalBlocksLabel).toBe("Sem pendencias abertas");
  });

  it("classifica fases bloqueadas, concluidas e selecionadas", () => {
    const model = buildLicitacaoProcessoViewModel({
      ...baseInput,
      activePhase: "PUBLICACAO",
      activePhaseLabel: "Publicacao",
      currentProcessPhase: "PUBLICACAO",
      currentProcessPhaseLabel: "Publicacao",
      phases: [
        { ...baseInput.phases[0], completed: true },
        { ...baseInput.phases[1], accessible: true },
        {
          key: "DISPUTA",
          label: "Disputa",
          shortLabel: "Disputa",
          description: "Sessao externa.",
          pendingCount: 0,
          completed: false,
          accessible: false,
        },
      ],
    });

    expect(model.phases.map((phase) => [phase.key, phase.status])).toEqual([
      ["PREPARACAO", "completed"],
      ["PUBLICACAO", "active"],
      ["DISPUTA", "blocked"],
    ]);
  });
});
