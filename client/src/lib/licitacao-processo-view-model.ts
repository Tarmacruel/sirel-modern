export type LicitacaoProcessoPhaseKey =
  | "PREPARACAO"
  | "PUBLICACAO"
  | "DISPUTA"
  | "JULGAMENTO_HABILITACAO"
  | "RECURSOS_HOMOLOGACAO"
  | "FECHAMENTO";

export type LicitacaoGuidedPhaseStatus =
  | "active"
  | "completed"
  | "available"
  | "blocked";

export type LicitacaoNextActionIntent =
  | "focus_pending"
  | "focus_section"
  | "run_phase_action";

export interface LicitacaoPendingItemView {
  category: string;
  label: string;
  detalhe?: string;
}

export interface LicitacaoGuidedPhaseSource {
  key: LicitacaoProcessoPhaseKey;
  label: string;
  shortLabel: string;
  description: string;
  pendingCount: number;
  completed: boolean;
  accessible: boolean;
}

export interface LicitacaoGuidedPhaseView extends LicitacaoGuidedPhaseSource {
  status: LicitacaoGuidedPhaseStatus;
  statusLabel: string;
  pendingLabel: string;
  isSelected: boolean;
  isRuntime: boolean;
}

export interface LicitacaoProcessHeaderModel {
  numero: string;
  modalidade: string;
  secretaria: string;
  currentPhaseLabel: string;
  responsavel: string;
  pendingLabel: string;
  checklistProgressLabel: string;
  documentsLabel: string;
  isForaDoFluxo: boolean;
}

export interface LicitacaoNextActionModel {
  title: string;
  objective: string;
  primaryLabel: string;
  primaryDisabled: boolean;
  intent: LicitacaoNextActionIntent;
  blockedReason?: string;
  pendingItems: LicitacaoPendingItemView[];
}

export interface LicitacaoContextAssistantModel {
  selectedPhaseLabel: string;
  runtimePhaseLabel: string;
  leadSectionLabel: string;
  legalBlocks: LicitacaoPendingItemView[];
  legalBlocksLabel: string;
  tip: string;
  flowLabel: string;
  disputeLabel: string;
  modalidadeHelp?: string;
}

export interface LicitacaoPreparationModel {
  doneCount: number;
  totalCount: number;
  pendingCount: number;
  progressPercent: number;
  progressLabel: string;
  nextPendingLabel: string;
}

export interface LicitacaoProcessoViewModel {
  header: LicitacaoProcessHeaderModel;
  phases: LicitacaoGuidedPhaseView[];
  nextAction: LicitacaoNextActionModel;
  assistant: LicitacaoContextAssistantModel;
  preparation: LicitacaoPreparationModel;
}

export interface BuildLicitacaoProcessoViewModelInput {
  processoNumero?: string | null;
  modalidade?: string | null;
  secretaria?: string | null;
  activePhase: LicitacaoProcessoPhaseKey;
  activePhaseLabel: string;
  currentProcessPhase: LicitacaoProcessoPhaseKey;
  currentProcessPhaseLabel: string;
  responsavel?: string | null;
  isForaDoFluxo: boolean;
  checklistDoneCount: number;
  checklistTotalCount: number;
  documentCount: number;
  phases: LicitacaoGuidedPhaseSource[];
  selectedPhasePendingItems: LicitacaoPendingItemView[];
  selectedPhaseLeadSectionLabel: string;
  nextPendingChecklistLabel?: string | null;
  primaryActionLabel: string;
  primaryActionHelper: string;
  primaryActionDisabled: boolean;
  flowLabel: string;
  disputeLabel: string;
  modalidadeHelp?: string | null;
}

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

function normalizeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function getPhaseStatus(
  phase: LicitacaoGuidedPhaseSource,
  activePhase: LicitacaoProcessoPhaseKey,
): LicitacaoGuidedPhaseStatus {
  if (phase.key === activePhase) return "active";
  if (phase.completed) return "completed";
  if (!phase.accessible) return "blocked";
  return "available";
}

function getPhaseStatusLabel(status: LicitacaoGuidedPhaseStatus) {
  switch (status) {
    case "active":
      return "Selecionada";
    case "completed":
      return "Concluida";
    case "blocked":
      return "Bloqueada";
    case "available":
    default:
      return "Disponivel";
  }
}

function getPreparationTip(input: BuildLicitacaoProcessoViewModelInput) {
  if (input.activePhase !== "PREPARACAO") {
    return input.selectedPhasePendingItems.length
      ? "Resolva os bloqueios listados antes de executar a acao principal da etapa."
      : "Use a secao principal para registrar a proxima movimentacao do processo.";
  }

  if (input.selectedPhasePendingItems.length > 0) {
    return "Comece pelo proximo ato obrigatorio e anexe a evidencia ou registre a justificativa prevista.";
  }

  return "Checklist interno completo. Revise o cronograma antes de liberar a publicacao.";
}

export function buildLicitacaoProcessoViewModel(
  input: BuildLicitacaoProcessoViewModelInput,
): LicitacaoProcessoViewModel {
  const checklistTotal = Math.max(0, input.checklistTotalCount);
  const checklistDone = Math.min(
    Math.max(0, input.checklistDoneCount),
    checklistTotal,
  );
  const checklistPending = Math.max(0, checklistTotal - checklistDone);
  const progressPercent =
    checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;
  const selectedPendingCount = input.selectedPhasePendingItems.length;
  const selectedPendingLabel =
    selectedPendingCount === 0
      ? "Sem pendencias abertas"
      : `${selectedPendingCount} ${pluralize(
          selectedPendingCount,
          "pendencia aberta",
          "pendencias abertas",
        )}`;

  const phases = input.phases.map((phase) => {
    const status = getPhaseStatus(phase, input.activePhase);
    return {
      ...phase,
      status,
      statusLabel: getPhaseStatusLabel(status),
      pendingLabel:
        phase.pendingCount === 0
          ? "Sem pendencias"
          : `${phase.pendingCount} ${pluralize(
              phase.pendingCount,
              "pendencia",
              "pendencias",
            )}`,
      isSelected: phase.key === input.activePhase,
      isRuntime: phase.key === input.currentProcessPhase,
    };
  });

  const isPreparation = input.activePhase === "PREPARACAO";
  const preparationBlocked =
    isPreparation && input.selectedPhasePendingItems.length > 0;

  const nextAction: LicitacaoNextActionModel = preparationBlocked
    ? {
        title: "Resolver proxima pendencia interna",
        objective:
          "A publicacao fica bloqueada ate que os atos obrigatorios da fase interna estejam tratados.",
        primaryLabel: "Abrir pendencia",
        primaryDisabled: false,
        intent: "focus_pending",
        blockedReason: input.primaryActionHelper,
        pendingItems: input.selectedPhasePendingItems.slice(0, 4),
      }
    : {
        title: input.primaryActionLabel,
        objective: input.primaryActionHelper,
        primaryLabel: input.primaryActionLabel,
        primaryDisabled: input.primaryActionDisabled,
        intent: input.primaryActionDisabled
          ? "focus_section"
          : "run_phase_action",
        blockedReason: input.primaryActionDisabled
          ? input.primaryActionHelper
          : undefined,
        pendingItems: input.selectedPhasePendingItems.slice(0, 4),
      };

  return {
    header: {
      numero: normalizeText(input.processoNumero, "Processo sem numero"),
      modalidade: normalizeText(input.modalidade, "Modalidade em definicao"),
      secretaria: normalizeText(input.secretaria, "Secretaria em definicao"),
      currentPhaseLabel: input.currentProcessPhaseLabel,
      responsavel: normalizeText(input.responsavel, "Responsavel em definicao"),
      pendingLabel: selectedPendingLabel,
      checklistProgressLabel:
        checklistTotal > 0
          ? `${checklistDone}/${checklistTotal} concluidos`
          : "Checklist sem itens",
      documentsLabel: `${input.documentCount} ${pluralize(
        input.documentCount,
        "documento",
        "documentos",
      )}`,
      isForaDoFluxo: input.isForaDoFluxo,
    },
    phases,
    nextAction,
    assistant: {
      selectedPhaseLabel: input.activePhaseLabel,
      runtimePhaseLabel: input.currentProcessPhaseLabel,
      leadSectionLabel: input.selectedPhaseLeadSectionLabel,
      legalBlocks: input.selectedPhasePendingItems.slice(0, 5),
      legalBlocksLabel: selectedPendingLabel,
      tip: getPreparationTip(input),
      flowLabel: input.flowLabel,
      disputeLabel: input.disputeLabel,
      modalidadeHelp: input.modalidadeHelp ?? undefined,
    },
    preparation: {
      doneCount: checklistDone,
      totalCount: checklistTotal,
      pendingCount: checklistPending,
      progressPercent,
      progressLabel:
        checklistTotal > 0
          ? `${progressPercent}% do checklist interno tratado`
          : "Checklist interno ainda nao carregado",
      nextPendingLabel: normalizeText(
        input.nextPendingChecklistLabel,
        "Nenhuma pendencia obrigatoria",
      ),
    },
  };
}
