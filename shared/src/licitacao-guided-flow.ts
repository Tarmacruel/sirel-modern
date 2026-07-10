export type LicitacaoGuidedPhaseKey =
  | "PREPARACAO"
  | "PUBLICACAO"
  | "DISPUTA"
  | "JULGAMENTO"
  | "HABILITACAO"
  | "RECURSOS"
  | "CONTROLE_INTERNO"
  | "HOMOLOGACAO"
  | "FECHAMENTO";

export type LicitacaoFlowEnforcement = "ADVISORY" | "BLOCKING";

export type LicitacaoDocumentRequirementSource =
  | "DOCUMENT_UPLOAD"
  | "SYSTEM_STATE"
  | "MANUAL_LINK"
  | "PARSER"
  | "INTEGRATION"
  | "CATALOG";

export type LicitacaoDocumentCompletionStrategy =
  | "DOCUMENT_PRESENT"
  | "SYSTEM_FIELD"
  | "SYSTEM_STATE"
  | "PARSER_OR_DOCUMENT"
  | "OPTIONAL_DECLARATION"
  | "INTEGRATION_STATUS"
  | "CATALOG_SELECTION";

export type LicitacaoDocumentRequirementEditor =
  | "DOCUMENT_UPLOAD"
  | "INSTITUTIONAL_SELECTOR";

export interface LicitacaoFlowContext {
  modalidadeCodigo?: string | null;
  modoDisputa?: string | null;
  exigeDeclaracaoNaoFracionamento?: boolean | null;
  publicarNoDou?: boolean | null;
  publicarEmJornal?: boolean | null;
  fundamentoLegalInciso?: string | null;
}

export interface LicitacaoDocumentRequirement {
  category: string;
  phase: LicitacaoGuidedPhaseKey;
  order: number;
  label: string;
  description: string;
  obrigatorio: boolean;
  source: LicitacaoDocumentRequirementSource;
  completionStrategy: LicitacaoDocumentCompletionStrategy;
  baseLegal?: string;
  condicional?: string;
  completionHint?: string;
  aliases?: readonly string[];
  editor?: LicitacaoDocumentRequirementEditor;
}

export interface LicitacaoPhaseDefinition {
  key: LicitacaoGuidedPhaseKey;
  label: string;
  shortLabel: string;
  eyebrow: string;
  description: string;
}

interface RequirementFactoryItem
  extends Omit<LicitacaoDocumentRequirement, "obrigatorio"> {
  obrigatorio:
    | boolean
    | ((context: Required<LicitacaoFlowContext>) => boolean);
  appliesTo?: (context: Required<LicitacaoFlowContext>) => boolean;
}

const emptyContext: Required<LicitacaoFlowContext> = {
  modalidadeCodigo: "",
  modoDisputa: "NAO_SE_APLICA",
  exigeDeclaracaoNaoFracionamento: false,
  publicarNoDou: false,
  publicarEmJornal: false,
  fundamentoLegalInciso: "",
};

export const licitacaoGuidedPhaseOrder = [
  "PREPARACAO",
  "PUBLICACAO",
  "DISPUTA",
  "JULGAMENTO",
  "HABILITACAO",
  "RECURSOS",
  "CONTROLE_INTERNO",
  "HOMOLOGACAO",
  "FECHAMENTO",
] as const satisfies readonly LicitacaoGuidedPhaseKey[];

export const licitacaoGuidedPhaseCatalog = {
  PREPARACAO: {
    key: "PREPARACAO",
    label: "Preparacao interna",
    shortLabel: "Preparacao",
    eyebrow: "Fundacao do processo",
    description:
      "Checklist interno, configuracoes e acervo documental antes da abertura.",
  },
  PUBLICACAO: {
    key: "PUBLICACAO",
    label: "Publicacao",
    shortLabel: "Publicacao",
    eyebrow: "Divulgacao oficial",
    description:
      "Publicacao oficial, links externos e cronograma minimo da sessao.",
  },
  DISPUTA: {
    key: "DISPUTA",
    label: "Disputa",
    shortLabel: "Disputa",
    eyebrow: "Sessao externa",
    description:
      "Documentos da sessao publica, parser da ata e registros da plataforma.",
  },
  JULGAMENTO: {
    key: "JULGAMENTO",
    label: "Julgamento",
    shortLabel: "Julgamento",
    eyebrow: "Analise das propostas",
    description:
      "Classificacao, pareceres tecnicos, planilhas e decisao do julgamento.",
  },
  HABILITACAO: {
    key: "HABILITACAO",
    label: "Habilitacao",
    shortLabel: "Habilitacao",
    eyebrow: "Conferencia documental",
    description: "Resultado da habilitacao do licitante classificado.",
  },
  RECURSOS: {
    key: "RECURSOS",
    label: "Recursos",
    shortLabel: "Recursos",
    eyebrow: "Tratamento recursal",
    description: "Recursos administrativos, decisoes ou registro de ausencia.",
  },
  CONTROLE_INTERNO: {
    key: "CONTROLE_INTERNO",
    label: "Controle Interno",
    shortLabel: "Controle",
    eyebrow: "Encaminhamento",
    description:
      "Encaminhamento do processo ao Controle Interno antes da homologacao.",
  },
  HOMOLOGACAO: {
    key: "HOMOLOGACAO",
    label: "Homologacao",
    shortLabel: "Homologacao",
    eyebrow: "Conclusao formal",
    description:
      "Atas, relatorios finais, vencedores, adjudicacao e homologacao.",
  },
  FECHAMENTO: {
    key: "FECHAMENTO",
    label: "Fechamento",
    shortLabel: "Fechamento",
    eyebrow: "Rastreabilidade final",
    description: "Historico, auditoria e encaminhamento para Contratos.",
  },
} as const satisfies Record<LicitacaoGuidedPhaseKey, LicitacaoPhaseDefinition>;

export const inexigibilidadeFundamentoOptions = [
  {
    value: "ART_74_I",
    label: "Art. 74, I - fornecedor exclusivo",
  },
  {
    value: "ART_74_II",
    label: "Art. 74, II - profissional do setor artistico",
  },
  {
    value: "ART_74_III",
    label: "Art. 74, III - servico tecnico especializado",
  },
  {
    value: "ART_74_IV",
    label: "Art. 74, IV - credenciamento",
  },
  {
    value: "ART_74_V",
    label: "Art. 74, V - aquisicao ou locacao de imovel",
  },
] as const;

export const inexigibilidadeFundamentoLabels = Object.fromEntries(
  inexigibilidadeFundamentoOptions.map((item) => [item.value, item.label]),
) as Record<(typeof inexigibilidadeFundamentoOptions)[number]["value"], string>;

function normalizeText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeContext(context: LicitacaoFlowContext = {}) {
  return {
    modalidadeCodigo: normalizeText(context.modalidadeCodigo),
    modoDisputa: normalizeText(context.modoDisputa || "NAO_SE_APLICA"),
    exigeDeclaracaoNaoFracionamento: Boolean(
      context.exigeDeclaracaoNaoFracionamento,
    ),
    publicarNoDou: Boolean(context.publicarNoDou),
    publicarEmJornal: Boolean(context.publicarEmJornal),
    fundamentoLegalInciso: String(context.fundamentoLegalInciso ?? "").trim(),
  };
}

export function isDispensaModalidade(modalidadeCodigo?: string | null) {
  return /DISPENSA/.test(normalizeText(modalidadeCodigo));
}

export function isInexigibilidadeModalidade(modalidadeCodigo?: string | null) {
  return /INEXIGIBILIDADE/.test(normalizeText(modalidadeCodigo));
}

export function isPregaoModalidade(modalidadeCodigo?: string | null) {
  return /PREGAO/.test(normalizeText(modalidadeCodigo));
}

export function isConcorrenciaModalidade(modalidadeCodigo?: string | null) {
  return /CONCORRENCIA/.test(normalizeText(modalidadeCodigo));
}

export function isCredenciamentoModalidade(modalidadeCodigo?: string | null) {
  return /CREDENCIAMENTO/.test(normalizeText(modalidadeCodigo));
}

export function isLeilaoModalidade(modalidadeCodigo?: string | null) {
  return /LEILAO/.test(normalizeText(modalidadeCodigo));
}

export function isCompetitivePublicationModalidade(
  modalidadeCodigo?: string | null,
) {
  return (
    isPregaoModalidade(modalidadeCodigo) ||
    isConcorrenciaModalidade(modalidadeCodigo) ||
    isCredenciamentoModalidade(modalidadeCodigo) ||
    isLeilaoModalidade(modalidadeCodigo)
  );
}

export function hasLicitacaoDispute(context: LicitacaoFlowContext = {}) {
  const normalized = normalizeContext(context);
  if (isCompetitivePublicationModalidade(normalized.modalidadeCodigo)) {
    return true;
  }
  if (isDispensaModalidade(normalized.modalidadeCodigo)) {
    return normalized.modoDisputa !== "NAO_SE_APLICA";
  }
  return false;
}

function appliesToDispensa(context: Required<LicitacaoFlowContext>) {
  return isDispensaModalidade(context.modalidadeCodigo);
}

function appliesToInexigibilidade(context: Required<LicitacaoFlowContext>) {
  return isInexigibilidadeModalidade(context.modalidadeCodigo);
}

function appliesToCompetitive(context: Required<LicitacaoFlowContext>) {
  return isCompetitivePublicationModalidade(context.modalidadeCodigo);
}

function appliesToNotInexigibilidade(context: Required<LicitacaoFlowContext>) {
  return !isInexigibilidadeModalidade(context.modalidadeCodigo);
}

const requirementCatalog: readonly RequirementFactoryItem[] = [
  {
    category: "LICITACAO_DECRETO_COMISSAO",
    phase: "PREPARACAO",
    order: 100,
    label: "Selecionar Comissao de Contratacao",
    description: "Comissao institucional vigente para a preparacao da licitacao.",
    obrigatorio: true,
    source: "CATALOG",
    completionStrategy: "CATALOG_SELECTION",
    editor: "INSTITUTIONAL_SELECTOR",
    completionHint: "Concluido ao selecionar uma comissao cadastrada.",
  },
  {
    category: "LICITACAO_DECRETO_EQUIPE_APOIO",
    phase: "PREPARACAO",
    order: 110,
    label: "Selecionar Equipe de Apoio",
    description: "Equipe de apoio institucional vinculada ao processo.",
    obrigatorio: true,
    source: "CATALOG",
    completionStrategy: "CATALOG_SELECTION",
    editor: "INSTITUTIONAL_SELECTOR",
    completionHint: "Concluido ao selecionar uma equipe cadastrada.",
  },
  {
    category: "LICITACAO_DECRETO_ORDENADOR_DESPESAS",
    phase: "PREPARACAO",
    order: 120,
    label: "Selecionar Ordenador de Despesas",
    description: "Ordenador institucional vigente para a secretaria do processo.",
    obrigatorio: true,
    source: "CATALOG",
    completionStrategy: "CATALOG_SELECTION",
    editor: "INSTITUTIONAL_SELECTOR",
    completionHint: "Concluido ao selecionar um ordenador cadastrado.",
  },
  {
    category: "LICITACAO_COMUNICACAO_RESERVA_ORCAMENTARIA",
    phase: "PREPARACAO",
    order: 125,
    label: "CI para reserva orcamentaria",
    description: "Encaminhamento ao setor de Orcamento para reserva.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: appliesToCompetitive,
  },
  {
    category: "LICITACAO_RESERVA_ORCAMENTARIA",
    phase: "PREPARACAO",
    order: 130,
    label: "Reserva orcamentaria",
    description: "Comprovante da reserva vinculada ao processo.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_ATO_AUTORIZACAO_AUTORIDADE",
    phase: "PREPARACAO",
    order: 140,
    label: "Ato de autorizacao da autoridade competente",
    description: "Libera oficialmente o prosseguimento da licitacao.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_DECLARACAO_NAO_FRACIONAMENTO",
    phase: "PREPARACAO",
    order: 145,
    label: "Declaracao de nao fracionamento",
    description: "Declaracao exigida nas hipoteses municipais aplicaveis.",
    obrigatorio: (context) => Boolean(context.exigeDeclaracaoNaoFracionamento),
    condicional: "Exigencia manual",
    baseLegal: "Art. 75, Lei 14.133/2021",
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: (context) => Boolean(context.exigeDeclaracaoNaoFracionamento),
  },
  {
    category: "LICITACAO_JUSTIFICATIVA_DISPENSA",
    phase: "PREPARACAO",
    order: 150,
    label: "Justificativa da dispensa",
    description: "Fundamentacao formal da dispensa ou contratacao direta.",
    obrigatorio: true,
    baseLegal: "Art. 75, Lei 14.133/2021",
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: appliesToDispensa,
  },
  {
    category: "LICITACAO_PESQUISA_PRECOS",
    phase: "PREPARACAO",
    order: 160,
    label: "Pesquisa de precos",
    description: "Base comparativa para demonstrar vantajosidade.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: appliesToDispensa,
  },
  {
    category: "LICITACAO_JUSTIFICATIVA_INEXIGIBILIDADE",
    phase: "PREPARACAO",
    order: 150,
    label: "Justificativa da inexigibilidade",
    description: "Demonstra a inviabilidade de competicao.",
    obrigatorio: true,
    baseLegal: "Art. 74, Lei 14.133/2021",
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: appliesToInexigibilidade,
  },
  {
    category: "LICITACAO_COMPROVANTE_EXCLUSIVIDADE",
    phase: "PREPARACAO",
    order: 160,
    label: "Comprovante de exclusividade",
    description: "Documento de exclusividade do fornecedor ou representante.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: appliesToInexigibilidade,
  },
  {
    category: "LICITACAO_MINUTA_AVISO",
    phase: "PREPARACAO",
    order: 170,
    label: "Minuta do aviso",
    description: "Minuta interna preparada antes da publicacao.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_COMUNICACAO_PARECER_JURIDICO",
    phase: "PREPARACAO",
    order: 175,
    label: "CI solicitando parecer juridico",
    description: "Encaminhamento formal para manifestacao juridica.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: appliesToCompetitive,
  },
  {
    category: "LICITACAO_PARECER_JURIDICO",
    phase: "PREPARACAO",
    order: 180,
    label: "Parecer juridico",
    description: "Manifestacao juridica obrigatoria antes da publicidade.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_TERMO_AUTUACAO",
    phase: "PREPARACAO",
    order: 190,
    label: "Termo de autuacao",
    description: "Autuacao formal pelo agente de contratacao ou pregoeiro.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_DECRETO_AGENTE_CONTRATACAO",
    phase: "PREPARACAO",
    order: 200,
    label: "Decreto do Agente de Contratacao",
    description: "Designacao do agente responsavel pela sessao.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_FUNDAMENTO_INEXIGIBILIDADE",
    phase: "PUBLICACAO",
    order: 300,
    label: "Fundamento legal da inexigibilidade",
    description: "Selecione o inciso do art. 74 antes da publicacao.",
    obrigatorio: true,
    baseLegal: "Art. 74, Lei 14.133/2021",
    source: "SYSTEM_STATE",
    completionStrategy: "SYSTEM_FIELD",
    completionHint: "Preenchido no campo de configuracao da publicacao.",
    appliesTo: appliesToInexigibilidade,
  },
  {
    category: "LICITACAO_EDITAL",
    phase: "PUBLICACAO",
    order: 310,
    label: "Edital ou instrumento convocatorio",
    description: "Edital final assinado para publicacao oficial.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: appliesToCompetitive,
  },
  {
    category: "LICITACAO_AVISO_CONTRATACAO_DIRETA",
    phase: "PUBLICACAO",
    order: 310,
    label: "Aviso de Contratacao Direta",
    description: "Aviso oficial da dispensa ou contratacao direta.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    aliases: ["LICITACAO_AVISO_DISPENSA", "LICITACAO_AVISO"],
    appliesTo: appliesToDispensa,
  },
  {
    category: "LICITACAO_AVISO_INEXIGIBILIDADE",
    phase: "PUBLICACAO",
    order: 310,
    label: "Aviso da inexigibilidade",
    description: "Aviso oficial da inexigibilidade quando aplicavel.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    aliases: ["LICITACAO_AVISO"],
    appliesTo: appliesToInexigibilidade,
  },
  {
    category: "LICITACAO_PUBLICACAO_DOM",
    phase: "PUBLICACAO",
    order: 320,
    label: "Publicacao no Diario Oficial do Municipio",
    description: "Comprovante da publicacao municipal.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: appliesToNotInexigibilidade,
  },
  {
    category: "LICITACAO_PUBLICACAO_DOU",
    phase: "PUBLICACAO",
    order: 330,
    label: "Publicacao no DOU",
    description: "Comprovante de publicacao no Diario Oficial da Uniao.",
    obrigatorio: (context) => Boolean(context.publicarNoDou),
    condicional: "Obrigatorio quando marcado na configuracao",
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: (context) =>
      appliesToCompetitive(context) ||
      (appliesToDispensa(context) && Boolean(context.publicarNoDou)),
  },
  {
    category: "LICITACAO_PUBLICACAO_JORNAL",
    phase: "PUBLICACAO",
    order: 340,
    label: "Publicacao em jornal",
    description: "Comprovante de publicacao em jornal de grande circulacao.",
    obrigatorio: (context) => Boolean(context.publicarEmJornal),
    condicional: "Obrigatorio quando marcado na configuracao",
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    appliesTo: (context) =>
      appliesToCompetitive(context) ||
      (appliesToDispensa(context) && Boolean(context.publicarEmJornal)),
  },
  {
    category: "LICITACAO_CONFIRMACAO_PNCP",
    phase: "PUBLICACAO",
    order: 350,
    label: "Comprovante de publicacao no PNCP",
    description: "Comprovante oficial do Portal Nacional de Contratacoes Publicas.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    completionHint: "Tambem fica concluido quando o processo esta publicado.",
  },
  {
    category: "LICITACAO_PUBLIC_LINK_PNCP",
    phase: "PUBLICACAO",
    order: 360,
    label: "Link publico do PNCP",
    description: "URL publica da publicacao no PNCP.",
    obrigatorio: true,
    source: "MANUAL_LINK",
    completionStrategy: "SYSTEM_FIELD",
  },
  {
    category: "LICITACAO_PUBLIC_LINK_BLL",
    phase: "PUBLICACAO",
    order: 370,
    label: "Link publico da BLL",
    description: "URL publica da plataforma de disputa, quando aplicavel.",
    obrigatorio: true,
    source: "MANUAL_LINK",
    completionStrategy: "SYSTEM_FIELD",
    appliesTo: (context) =>
      hasLicitacaoDispute(context) || appliesToDispensa(context),
  },
  {
    category: "LICITACAO_PUBLICACAO_TRANSPARENCIA",
    phase: "PUBLICACAO",
    order: 380,
    label: "Portal da Transparencia",
    description: "Envio ao Portal da Transparencia por integracao configurada.",
    obrigatorio: false,
    source: "INTEGRATION",
    completionStrategy: "INTEGRATION_STATUS",
    completionHint: "Sem credenciais configuradas, fica apenas como aviso.",
  },
  {
    category: "LICITACAO_ATA_SESSAO_PROVISORIA",
    phase: "DISPUTA",
    order: 400,
    label: "Ata da sessao provisoria",
    description: "Ata extraida da plataforma para leitura pelo parser da sessao.",
    obrigatorio: true,
    source: "PARSER",
    completionStrategy: "PARSER_OR_DOCUMENT",
    aliases: ["LICITACAO_ATAS_SESSAO_ADJUDICACAO"],
  },
  {
    category: "LICITACAO_DOCUMENTOS_PLATAFORMA_DISPUTA",
    phase: "DISPUTA",
    order: 410,
    label: "Documentos da plataforma de disputa",
    description: "Registros da sessao, logs e comprovantes da plataforma.",
    obrigatorio: false,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_JULGAMENTO_PROPOSTA_TECNICA",
    phase: "JULGAMENTO",
    order: 500,
    label: "Julgamento da proposta e area tecnica",
    description: "Pareceres, planilhas e documentos da classificacao.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_MAPA_JULGAMENTO",
    phase: "JULGAMENTO",
    order: 510,
    label: "Mapa de julgamento",
    description: "Planilha ou quadro consolidado da classificacao das propostas.",
    obrigatorio: false,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_DECISAO_JULGAMENTO",
    phase: "JULGAMENTO",
    order: 520,
    label: "Decisao de julgamento",
    description: "Ato ou decisao que confirma o resultado do julgamento.",
    obrigatorio: false,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_HABILITACAO_EMPRESAS",
    phase: "HABILITACAO",
    order: 600,
    label: "Habilitacao das empresas",
    description: "Conferencia documental e resultado da habilitacao.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    completionHint:
      "Tambem pode ser concluido quando houver licitante com status definido.",
  },
  {
    category: "LICITACAO_RECURSOS",
    phase: "RECURSOS",
    order: 700,
    label: "Recursos",
    description: "Recursos administrativos, decisoes ou registro de ausencia.",
    obrigatorio: false,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "OPTIONAL_DECLARATION",
    completionHint: "Quando nao houver recurso, registre no fluxo operacional.",
  },
  {
    category: "LICITACAO_COMUNICACAO_CONTROLADORIA",
    phase: "CONTROLE_INTERNO",
    order: 800,
    label: "Encaminhamento ao Controle Interno",
    description: "Comunicacao de envio para analise do Controle Interno.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_ATA_HOMOLOGACAO",
    phase: "HOMOLOGACAO",
    order: 900,
    label: "Ata de homologacao",
    description: "Ata final que registra a homologacao do resultado.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
  },
  {
    category: "LICITACAO_ATA_RELATORIO_LANCES",
    phase: "HOMOLOGACAO",
    order: 910,
    label: "Ata relatorio de lances",
    description: "Relatorio final de lances emitido pela plataforma.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "PARSER_OR_DOCUMENT",
    aliases: ["LICITACAO_ATA_RELATORIO_FINAL"],
  },
  {
    category: "LICITACAO_ATA_SESSAO_FINAL",
    phase: "HOMOLOGACAO",
    order: 920,
    label: "Ata da sessao final",
    description: "Ata final consolidada da sessao publica.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "PARSER_OR_DOCUMENT",
    aliases: ["LICITACAO_ATAS_SESSAO_ADJUDICACAO"],
  },
  {
    category: "LICITACAO_ATA_ADJUDICACAO",
    phase: "HOMOLOGACAO",
    order: 930,
    label: "Ata de adjudicacao",
    description: "Documento que registra a adjudicacao do objeto.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "PARSER_OR_DOCUMENT",
    aliases: ["LICITACAO_ATAS_SESSAO_ADJUDICACAO"],
  },
  {
    category: "LICITACAO_ATA_VENCEDORES",
    phase: "HOMOLOGACAO",
    order: 940,
    label: "Ata de vencedores",
    description: "Relacao dos vencedores e itens adjudicados.",
    obrigatorio: true,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "PARSER_OR_DOCUMENT",
    aliases: ["LICITACAO_ATAS_SESSAO_ADJUDICACAO"],
  },
  {
    category: "LICITACAO_TERMO_HOMOLOGACAO",
    phase: "HOMOLOGACAO",
    order: 950,
    label: "Termo de homologacao",
    description: "Termo final assinado quando aplicavel.",
    obrigatorio: false,
    source: "DOCUMENT_UPLOAD",
    completionStrategy: "DOCUMENT_PRESENT",
    completionHint:
      "Tambem pode ser concluido quando o processo ja estiver homologado.",
  },
];

export function getLicitacaoGuidedPhaseSequence(
  context: LicitacaoFlowContext = {},
) {
  void normalizeContext(context);
  return licitacaoGuidedPhaseOrder.map(
    (key) => licitacaoGuidedPhaseCatalog[key],
  );
}

export function getLicitacaoDocumentRequirements(
  context: LicitacaoFlowContext = {},
) {
  const normalizedContext = normalizeContext(context);
  return requirementCatalog
    .filter((item) => item.appliesTo?.(normalizedContext) ?? true)
    .map(({ appliesTo: _appliesTo, obrigatorio, ...item }) => ({
      ...item,
      obrigatorio:
        typeof obrigatorio === "function"
          ? obrigatorio(normalizedContext)
          : obrigatorio,
    }))
    .sort((left, right) => left.order - right.order);
}

export function getLicitacaoRequirementsByPhase(
  context: LicitacaoFlowContext = {},
) {
  const grouped = new Map<LicitacaoGuidedPhaseKey, LicitacaoDocumentRequirement[]>();
  licitacaoGuidedPhaseOrder.forEach((phase) => grouped.set(phase, []));
  getLicitacaoDocumentRequirements(context).forEach((item) => {
    grouped.get(item.phase)?.push(item);
  });
  return grouped;
}

export function resolveLicitacaoFlowEnforcement(
  value?: string | null,
): LicitacaoFlowEnforcement {
  return normalizeText(value) === "BLOCKING" ? "BLOCKING" : "ADVISORY";
}

export function getDefaultLicitacaoFlowEnforcement(): LicitacaoFlowEnforcement {
  return "ADVISORY";
}

export function getLicitacaoFlowContextDefaults(): Required<LicitacaoFlowContext> {
  return { ...emptyContext };
}
