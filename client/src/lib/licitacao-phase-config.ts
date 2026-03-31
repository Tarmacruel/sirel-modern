export type LicitacaoMacroPhaseKey = "PLANEJAMENTO" | "COMPRAS" | "LICITACAO" | "CONTRATO";
export type LicitacaoSubphaseKey = "FASE_INTERNA" | "FASE_EXTERNA" | "CRONOGRAMA";

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

export interface LicitacaoDocumentRequirement {
  category: string;
  label: string;
  description: string;
  obrigatorio: boolean;
  baseLegal?: string;
  condicional?: boolean;
  completionHint?: string;
}

interface LicitacaoDocumentBlueprintParams {
  modalidadeCodigo?: string | null;
  exigeDeclaracaoNaoFracionamento?: boolean;
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

function isDispensa(modalidadeCodigo?: string | null) {
  return /DISPENSA/.test(modalidadeCodigo ?? "");
}

function isInexigibilidade(modalidadeCodigo?: string | null) {
  return /INEXIGIBILIDADE/.test(modalidadeCodigo ?? "");
}

function isPregao(modalidadeCodigo?: string | null) {
  return /PREGAO/.test(modalidadeCodigo ?? "");
}

export function getLicitacaoDocumentBlueprint(params: LicitacaoDocumentBlueprintParams) {
  const modalidadeCodigo = params.modalidadeCodigo ?? "";
  const dispensa = isDispensa(modalidadeCodigo);
  const inexigibilidade = isInexigibilidade(modalidadeCodigo);
  const pregao = isPregao(modalidadeCodigo);

  const internal: LicitacaoDocumentRequirement[] = [
    {
      category: "LICITACAO_DECRETO_COMISSAO",
      label: "Decreto da Comissao Permanente de Contratacao",
      description: "Ato de designacao da comissao responsavel pela fase licitatoria.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_DECRETO_EQUIPE_APOIO",
      label: "Decreto da equipe de apoio",
      description: "Formaliza a equipe de apoio vinculada ao processo.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_COMUNICACAO_RESERVA_ORCAMENTARIA",
      label: "CI para reserva orcamentaria",
      description: "Comunicacao interna ao setor de Orcamento para abertura da reserva.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_RESERVA_ORCAMENTARIA",
      label: "Reserva orcamentaria",
      description: "Comprovante da reserva vinculada ao processo.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_DECRETO_ORDENADOR_DESPESAS",
      label: "Decreto do Ordenador de Despesas",
      description: "Documento do ordenador ou secretario competente.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_ATO_AUTORIZACAO_AUTORIDADE",
      label: "Ato de autorizacao da autoridade competente",
      description: "Libera oficialmente o prosseguimento da licitacao.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_MINUTA_AVISO",
      label: "Minuta do aviso",
      description: "Minuta interna preparada antes da publicacao.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_COMUNICACAO_PARECER_JURIDICO",
      label: "CI solicitando parecer juridico",
      description: "Encaminhamento formal para a Procuradoria Geral do Municipio.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_PARECER_JURIDICO",
      label: "Parecer juridico",
      description: "Manifestacao juridica obrigatoria antes da publicidade.",
      obrigatorio: true,
    },
  ];

  if (dispensa || params.exigeDeclaracaoNaoFracionamento) {
    internal.push({
      category: "LICITACAO_DECLARACAO_NAO_FRACIONAMENTO",
      label: "Declaracao de nao fracionamento",
      description: "Obrigatoria nas hipoteses municipais de dispensa que exigem a declaracao.",
      obrigatorio: true,
      condicional: true,
      baseLegal: "Art. 75, Lei 14.133/2021",
    });
  }

  if (dispensa) {
    internal.push(
      {
        category: "LICITACAO_JUSTIFICATIVA_DISPENSA",
        label: "Justificativa da dispensa",
        description: "Fundamentacao formal da contratacao direta ou dispensa com disputa.",
        obrigatorio: true,
        baseLegal: "Art. 75, Lei 14.133/2021",
      },
      {
        category: "LICITACAO_PESQUISA_PRECOS",
        label: "Pesquisa de precos",
        description: "Base comparativa para confirmar a vantajosidade da contratacao.",
        obrigatorio: true,
      },
    );
  }

  if (inexigibilidade) {
    internal.push(
      {
        category: "LICITACAO_JUSTIFICATIVA_INEXIGIBILIDADE",
        label: "Justificativa da inexigibilidade",
        description: "Demonstracao da inviabilidade de competicao.",
        obrigatorio: true,
        baseLegal: "Art. 74, Lei 14.133/2021",
      },
      {
        category: "LICITACAO_COMPROVANTE_EXCLUSIVIDADE",
        label: "Comprovante de exclusividade",
        description: "Documento comprobatório da exclusividade do fornecedor ou representante.",
        obrigatorio: true,
      },
    );
  }

  const external: LicitacaoDocumentRequirement[] = [
    {
      category: "LICITACAO_TERMO_AUTUACAO",
      label: "Termo de autuacao",
      description: "Autuacao formal do processo pelo agente de contratacao ou pregoeiro.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_DECRETO_AGENTE_CONTRATACAO",
      label: "Decreto do Agente de Contratacao",
      description: "Designacao do agente responsavel pela conducao da sessao.",
      obrigatorio: true,
    },
    {
      category: pregao ? "LICITACAO_AVISO_PREGAO" : "LICITACAO_AVISO_DISPENSA",
      label: pregao ? "Aviso de Pregao Eletronico" : "Aviso de Dispensa",
      description: "Versao oficial do aviso conforme a modalidade adotada.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_CONFIRMACAO_PNCP",
      label: "Confirmacao de publicacao no PNCP",
      description: "Comprovante da publicacao oficial no Portal Nacional de Contratacoes Publicas.",
      obrigatorio: true,
      completionHint: "Tambem pode ser considerado concluido quando o processo ja estiver publicado no sistema.",
    },
    {
      category: "LICITACAO_DOCUMENTOS_PLATAFORMA_DISPUTA",
      label: "Documentos da plataforma de disputa",
      description: "Arquivos de abertura, prints ou exportacoes da plataforma utilizada.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_PROPOSTAS_PARTICIPANTES",
      label: "Propostas dos participantes",
      description: "Conjunto de propostas recebidas ou exportadas da plataforma.",
      obrigatorio: true,
      completionHint: "Tambem pode ser marcado automaticamente quando houver propostas registradas.",
    },
    {
      category: "LICITACAO_JULGAMENTO_PROPOSTA_TECNICA",
      label: "Julgamento da proposta e area tecnica",
      description: "Pareceres, planilhas e documentos da classificacao tecnica ou economica.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_HABILITACAO_EMPRESAS",
      label: "Habilitacao das empresas",
      description: "Conferencia documental e resultado da habilitacao dos licitantes.",
      obrigatorio: true,
      completionHint: "Tambem pode ser considerado concluido quando ja existir licitante com status definido.",
    },
    {
      category: "LICITACAO_RECURSOS",
      label: "Recursos",
      description: "Recursos administrativos, decisoes e anexos correlatos quando existirem.",
      obrigatorio: false,
    },
    {
      category: "LICITACAO_ATAS_SESSAO_ADJUDICACAO",
      label: "Atas de sessao e adjudicacao",
      description: "Atas operacionais da sessao publica e da adjudicacao do resultado.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_COMUNICACAO_CONTROLADORIA",
      label: "Comunicacao para Controladoria",
      description: "Encaminhamento do processo para analise da Controladoria.",
      obrigatorio: true,
    },
  ];

  if (pregao) {
    external.push({
      category: "LICITACAO_ATA_RELATORIO_FINAL",
      label: "Ata de relatorio final",
      description: "Documento final consolidado da sessao do pregao eletronico.",
      obrigatorio: true,
    });
  }

  external.push(
    {
      category: "LICITACAO_ATA_HOMOLOGACAO",
      label: "Ata de homologacao",
      description: "Ata final que registra a homologacao do resultado.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_TERMO_HOMOLOGACAO",
      label: "Termo de homologacao",
      description: "Termo final assinado para conclusao da fase licitatoria.",
      obrigatorio: true,
      completionHint: "Tambem pode ser considerado concluido quando o processo ja estiver homologado.",
    },
  );

  return { internal, external };
}
