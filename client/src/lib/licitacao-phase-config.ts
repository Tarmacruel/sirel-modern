export type LicitacaoMacroPhaseKey =
  | "PLANEJAMENTO"
  | "COMPRAS"
  | "LICITACAO"
  | "CONTRATO";
export type LicitacaoSubphaseKey =
  | "FASE_INTERNA"
  | "FASE_EXTERNA"
  | "CRONOGRAMA";

export interface LicitacaoMacroPhaseItem {
  key: LicitacaoMacroPhaseKey;
  label: string;
  hint: string;
  href: string;
}

export interface LicitacaoSubphaseItem {
  key: LicitacaoSubphaseKey;
  label: string;
  hint: string;
}

export const licitacaoMacroPhases: LicitacaoMacroPhaseItem[] = [
  {
    key: "PLANEJAMENTO",
    label: "Planejamento",
    hint: "DFD, ETP, TR e consolidacao preliminar.",
    href: "/planejamento",
  },
  {
    key: "COMPRAS",
    label: "Compras",
    hint: "Pesquisa definitiva, mapa comparativo e consolidacao final.",
    href: "/compras",
  },
  {
    key: "LICITACAO",
    label: "Licitacao",
    hint: "Fase interna, fase externa e cronograma oficial.",
    href: "/licitacao",
  },
  {
    key: "CONTRATO",
    label: "Contrato",
    hint: "Formalizacao, vigencia e acompanhamento contratual.",
    href: "/contratos",
  },
];

export const licitacaoSubphases: LicitacaoSubphaseItem[] = [
  {
    key: "FASE_INTERNA",
    label: "Fase interna",
    hint: "Checklist documental e liberacao para publicidade.",
  },
  {
    key: "FASE_EXTERNA",
    label: "Fase externa",
    hint: "Publicacao, sessao, julgamento e homologacao.",
  },
  {
    key: "CRONOGRAMA",
    label: "Cronograma",
    hint: "Prazos automaticos ou modo manual extemporaneo.",
  },
];

export {
  getDefaultLicitacaoFlowEnforcement,
  getLicitacaoDocumentRequirements,
  getLicitacaoFlowContextDefaults,
  getLicitacaoGuidedPhaseSequence,
  getLicitacaoRequirementsByPhase,
  hasLicitacaoDispute,
  inexigibilidadeFundamentoLabels,
  inexigibilidadeFundamentoOptions,
  isCompetitivePublicationModalidade,
  isDispensaModalidade,
  isInexigibilidadeModalidade,
  licitacaoGuidedPhaseCatalog,
  licitacaoGuidedPhaseOrder,
  resolveLicitacaoFlowEnforcement,
  type LicitacaoDocumentRequirement,
  type LicitacaoFlowContext,
  type LicitacaoFlowEnforcement,
  type LicitacaoGuidedPhaseKey,
  type LicitacaoPhaseDefinition,
} from "@sirel/shared/licitacao-guided-flow";
