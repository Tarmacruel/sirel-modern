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
    hint: "DFD, ETP, TR e consolidação preliminar.",
    href: "/planejamento",
  },
  {
    key: "COMPRAS",
    label: "Compras",
    hint: "Pesquisa definitiva, mapa comparativo e consolidação final.",
    href: "/compras",
  },
  {
    key: "LICITACAO",
    label: "Licitação",
    hint: "Fase interna, fase externa e cronograma oficial.",
    href: "/licitacao",
  },
  {
    key: "CONTRATO",
    label: "Contrato",
    hint: "Formalização, vigência e acompanhamento contratual.",
    href: "/contratos",
  },
];

export const licitacaoSubphases: LicitacaoSubphaseItem[] = [
  {
    key: "FASE_INTERNA",
    label: "Fase interna",
    hint: "Checklist documental e liberação para publicidade.",
  },
  {
    key: "FASE_EXTERNA",
    label: "Fase externa",
    hint: "Publicação, sessão, julgamento e homologação.",
  },
  {
    key: "CRONOGRAMA",
    label: "Cronograma",
    hint: "Prazos automáticos ou modo manual extemporâneo.",
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

export function getLicitacaoDocumentBlueprint(
  params: LicitacaoDocumentBlueprintParams,
) {
  const modalidadeCodigo = params.modalidadeCodigo ?? "";
  const dispensa = isDispensa(modalidadeCodigo);
  const inexigibilidade = isInexigibilidade(modalidadeCodigo);
  const pregao = isPregao(modalidadeCodigo);

  const internal: LicitacaoDocumentRequirement[] = [
    {
      category: "LICITACAO_DECRETO_COMISSAO",
      label: "Decreto da Comissão Permanente de Contratação",
      description:
        "Ato de designação da comissão responsável pela fase licitatória.",
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
      label: "CI para reserva orçamentária",
      description:
        "Comunicação interna ao setor de Orçamento para abertura da reserva.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_RESERVA_ORCAMENTARIA",
      label: "Reserva orçamentária",
      description: "Comprovante da reserva vinculada ao processo.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_DECRETO_ORDENADOR_DESPESAS",
      label: "Decreto do Ordenador de Despesas",
      description: "Documento do ordenador ou secretário competente.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_ATO_AUTORIZACAO_AUTORIDADE",
      label: "Ato de autorização da autoridade competente",
      description: "Libera oficialmente o prosseguimento da licitação.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_MINUTA_AVISO",
      label: "Minuta do aviso",
      description: "Minuta interna preparada antes da publicação.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_COMUNICACAO_PARECER_JURIDICO",
      label: "CI solicitando parecer jurídico",
      description:
        "Encaminhamento formal para a Procuradoria-Geral do Município.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_PARECER_JURIDICO",
      label: "Parecer jurídico",
      description: "Manifestação jurídica obrigatória antes da publicidade.",
      obrigatorio: true,
    },
  ];

  if (dispensa || params.exigeDeclaracaoNaoFracionamento) {
    internal.push({
      category: "LICITACAO_DECLARACAO_NAO_FRACIONAMENTO",
      label: "Declaração de não fracionamento",
      description:
        "Obrigatória nas hipóteses municipais de dispensa que exigem a declaração.",
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
        description:
          "Fundamentação formal da contratação direta ou dispensa com disputa.",
        obrigatorio: true,
        baseLegal: "Art. 75, Lei 14.133/2021",
      },
      {
        category: "LICITACAO_PESQUISA_PRECOS",
        label: "Pesquisa de preços",
        description:
          "Base comparativa para confirmar a vantajosidade da contratação.",
        obrigatorio: true,
      },
    );
  }

  if (inexigibilidade) {
    internal.push(
      {
        category: "LICITACAO_JUSTIFICATIVA_INEXIGIBILIDADE",
        label: "Justificativa da inexigibilidade",
        description: "Demonstração da inviabilidade de competição.",
        obrigatorio: true,
        baseLegal: "Art. 74, Lei 14.133/2021",
      },
      {
        category: "LICITACAO_COMPROVANTE_EXCLUSIVIDADE",
        label: "Comprovante de exclusividade",
        description:
          "Documento comprobatório da exclusividade do fornecedor ou representante.",
        obrigatorio: true,
      },
    );
  }

  const external: LicitacaoDocumentRequirement[] = [
    {
      category: "LICITACAO_TERMO_AUTUACAO",
      label: "Termo de autuação",
      description:
        "Autuação formal do processo pelo agente de contratação ou pregoeiro.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_DECRETO_AGENTE_CONTRATACAO",
      label: "Decreto do Agente de Contratação",
      description: "Designação do agente responsável pela condução da sessão.",
      obrigatorio: true,
    },
    {
      category: pregao ? "LICITACAO_AVISO_PREGAO" : "LICITACAO_AVISO_DISPENSA",
      label: pregao ? "Aviso de Pregão Eletrônico" : "Aviso de Dispensa",
      description: "Versão oficial do aviso conforme a modalidade adotada.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_CONFIRMACAO_PNCP",
      label: "Confirmação de publicação no PNCP",
      description:
        "Comprovante da publicação oficial no Portal Nacional de Contratações Públicas.",
      obrigatorio: true,
      completionHint:
        "Também pode ser considerado concluído quando o processo já estiver publicado no sistema.",
    },
    {
      category: "LICITACAO_DOCUMENTOS_PLATAFORMA_DISPUTA",
      label: "Documentos da plataforma de disputa",
      description:
        "Arquivos de abertura, comprovantes ou exportações da plataforma utilizada.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_PROPOSTAS_PARTICIPANTES",
      label: "Propostas dos participantes",
      description:
        "Conjunto de propostas recebidas ou exportadas da plataforma.",
      obrigatorio: true,
      completionHint:
        "Também pode ser marcado automaticamente quando houver propostas registradas.",
    },
    {
      category: "LICITACAO_JULGAMENTO_PROPOSTA_TECNICA",
      label: "Julgamento da proposta e área técnica",
      description:
        "Pareceres, planilhas e documentos da classificação técnica ou econômica.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_HABILITACAO_EMPRESAS",
      label: "Habilitação das empresas",
      description:
        "Conferência documental e resultado da habilitação dos licitantes.",
      obrigatorio: true,
      completionHint:
        "Também pode ser considerado concluído quando já existir licitante com status definido.",
    },
    {
      category: "LICITACAO_RECURSOS",
      label: "Recursos",
      description:
        "Recursos administrativos, decisões e anexos correlatos quando existirem.",
      obrigatorio: false,
    },
    {
      category: "LICITACAO_ATAS_SESSAO_ADJUDICACAO",
      label: "Atas de sessão e adjudicação",
      description:
        "Atas operacionais da sessão pública e da adjudicação do resultado.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_COMUNICACAO_CONTROLADORIA",
      label: "Comunicação para Controladoria",
      description: "Encaminhamento do processo para análise da Controladoria.",
      obrigatorio: true,
    },
  ];

  if (pregao) {
    external.push({
      category: "LICITACAO_ATA_RELATORIO_FINAL",
      label: "Ata de relatório final",
      description:
        "Documento final consolidado da sessão do pregão eletrônico.",
      obrigatorio: true,
    });
  }

  external.push(
    {
      category: "LICITACAO_ATA_HOMOLOGACAO",
      label: "Ata de homologação",
      description: "Ata final que registra a homologação do resultado.",
      obrigatorio: true,
    },
    {
      category: "LICITACAO_TERMO_HOMOLOGACAO",
      label: "Termo de homologação",
      description: "Termo final assinado para conclusão da fase licitatória.",
      obrigatorio: true,
      completionHint:
        "Também pode ser considerado concluído quando o processo já estiver homologado.",
    },
  );

  return { internal, external };
}
