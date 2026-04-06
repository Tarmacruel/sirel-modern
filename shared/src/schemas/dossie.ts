import { z } from "zod";

export const dossieDetailInputSchema = z.object({
  processoId: z.number().int().positive(),
});

export const dossieProcessOptionsInputSchema = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().positive().max(100).default(50),
});

export interface DossieResumo {
  totalItens: number;
  totalFornecedores: number;
  totalFornecedoresVencedores: number;
  totalDocumentos: number;
  totalContratos: number;
  totalContratosPncp: number;
  totalMovimentacoes: number;
  totalPrazos: number;
  prazosPendentes: number;
  valorEstimadoTotal: number;
  valorVencedorTotal: number;
  valorCotadoTotal: number;
  valorContratadoTotal: number;
  valorPncpTotal: number;
  economiaTotal: number;
  percentualEconomia: number | null;
  itensHomologados: number;
  itensFracassados: number;
  itensDesertos: number;
  percentualHomologacao: number | null;
  ultimaSincronizacaoFinanceira: string | null;
  temLegado: boolean;
  temBll: boolean;
  temPncp: boolean;
}

export interface DossiePessoaResumo {
  id: number;
  nome: string;
  cargo: string | null;
  secretaria: string | null;
}

export interface DossieProcesso {
  id: number;
  numeroSirel: string;
  protocolo: string | null;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  anoReferencia: number;
  origemCadastro: "MANUAL" | "LEGADO";
  foraDoFluxo: boolean;
  objeto: string;
  valorEstimado: number | null;
  valorHomologado: number | null;
  tipoObjeto: string;
  tipoContratacao: string;
  criterioJulgamento: string | null;
  modoDisputa: string | null;
  escopoDisputa: string;
  dataEntradaLicitacao: string | null;
  dataAbertura: string | null;
  dataPublicacao: string | null;
  dataDisputaSessao: string | null;
  dataEncerramento: string | null;
  publicado: boolean;
  homologado: boolean;
  finalizado: boolean;
  ativo: boolean;
  criadoEm: string | null;
  atualizadoEm: string | null;
  secretaria: {
    id: number;
    sigla: string;
    nome: string;
  };
  modalidade: {
    id: number;
    codigo: string;
    nome: string;
  } | null;
  statusAtual: {
    id: number;
    codigo: string;
    nome: string;
    cor: string | null;
  } | null;
  autoridadeCompetente: DossiePessoaResumo | null;
  condutorProcesso: DossiePessoaResumo | null;
}

export interface DossiePlanejamento {
  dfd: {
    id: number;
    setorDemandante: string;
    grauPrioridade: string;
    demandaSistemica: boolean;
    justificativa: string;
    dataNecessidade: string | null;
    dataPrevistaConclusao: string | null;
    observacoes: string | null;
    concluido: boolean;
    secretariaDemandante: string | null;
    secretariaResponsavel: string | null;
    solicitante: DossiePessoaResumo | null;
    assinaturaResponsavel: DossiePessoaResumo | null;
    responsaveis: DossiePessoaResumo[];
    secretariasParticipantes: Array<{
      id: number;
      nome: string;
      sigla: string;
    }>;
  } | null;
  etp: {
    id: number;
    metodologiaCotacao: string;
    descricaoNecessidade: string | null;
    analiseSolucoesMercado: string | null;
    justificativaTecnica: string | null;
    providenciasPrevias: string | null;
    conclusaoViabilidade: string | null;
    observacoes: string | null;
    concluido: boolean;
  } | null;
  tr: {
    id: number;
    objetoTermo: string;
    fundamentacaoContratacao: string;
    descricaoSolucao: string;
    requisitosContratacao: string;
    modeloExecucao: string | null;
    criteriosMedicaoPagamento: string | null;
    adequacaoOrcamentaria: string | null;
    orcamentoSigiloso: boolean;
    observacoes: string | null;
    concluido: boolean;
  } | null;
}

export interface DossieItem {
  id: number;
  numeroItem: number;
  loteId: number | null;
  loteNumero: number | null;
  loteNumeroExterno: string | null;
  loteDescricao: string | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitarioEstimado: number | null;
  valorTotalEstimado: number | null;
  valorLanceVencedorUnitario: number | null;
  valorLanceVencedorTotal: number | null;
  percentualDesconto: number | null;
  economiaObtida: number | null;
  fornecedorVencedorId: number | null;
  fornecedorVencedorNome: string | null;
  fornecedorVencedorCnpj: string | null;
  itemHomologado: boolean;
  itemDeserto: boolean;
  itemFracassado: boolean;
  motivoFracasso: string | null;
  dataHomologacao: string | null;
  statusResumo: string;
  origemValores: string | null;
  cotacoesPreliminares: number;
  cotacoesMercado: number;
  propostasRecebidas: number;
  melhorProposta: number | null;
  melhorLance: number | null;
}

export interface DossieCotacaoPreliminar {
  id: number;
  itemId: number;
  itemNumero: number;
  fonte: string;
  fornecedorNome: string;
  documento: string | null;
  dataCotacao: string | null;
  quantidadeConsiderada: number;
  valorUnitario: number;
  valorTotal: number;
  considerada: boolean;
  motivoDesconsideracao: string | null;
  justificativaDesconsideracao: string | null;
  observacao: string | null;
}

export interface DossieCotacaoMercado {
  id: number;
  processoId: number;
  itemId: number | null;
  itemNumero: number | null;
  fornecedorId: number;
  fornecedorNome: string;
  fornecedorCnpj: string | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  dataCotacao: string | null;
  status: string;
}

export interface DossieFornecedorResumo {
  fornecedorId: number | null;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
  cotacoes: number;
  licitacoes: number;
  contratos: number;
  valorCotado: number;
  valorContratado: number;
  itensVencidos: number;
  valorVencedor: number;
  origem: string[];
}

export interface DossieFornecedorVencedor {
  fornecedorId: number | null;
  nome: string;
  cnpj: string | null;
  totalItens: number;
  valorTotal: number;
  origemPrincipal: string;
}

export interface DossieLicitacao {
  cabecalho: {
    id: number;
    statusLicitacao: string;
    exigeDeclaracaoNaoFracionamento: boolean;
    publicarNoDou: boolean;
    publicarEmJornal: boolean;
    dataPublicacaoEdital: string | null;
    dataRecebimentoPropostasInicio: string | null;
    dataRecebimentoPropostasFim: string | null;
    dataAberturaPropostas: string | null;
    dataInicioLances: string | null;
    dataFimLances: string | null;
    dataJulgamento: string | null;
    dataHomologacao: string | null;
    linkBllPublico: string | null;
    linkPncpPublico: string | null;
    inversaoFasesHabilitada: boolean;
    inversaoFasesJustificativa: string | null;
    observacoes: string | null;
  } | null;
  checklistExcecoes: Array<{
    id: number;
    categoria: string;
    statusFlexivel: string;
    naoAplicavel: boolean;
    justificativa: string | null;
    departamentoResponsavel: string | null;
    previsaoRecebimento: string | null;
    processoFisicoNumero: string | null;
    localArquivamento: string | null;
    digitalizarDepois: boolean;
  }>;
  licitantes: Array<{
    id: number;
    fornecedorId: number;
    fornecedorNome: string;
    fornecedorCnpj: string | null;
    dataCadastro: string | null;
    statusHabilitacao: string;
    observacaoHabilitacao: string | null;
    ativo: boolean;
  }>;
  propostas: Array<{
    id: number;
    licitanteId: number;
    licitanteNome: string;
    fornecedorId: number;
    fornecedorNome: string;
    itemId: number;
    itemNumero: number;
    valorUnitarioProposto: number;
    valorTotalProposto: number;
    dataProposta: string | null;
    classificacao: number | null;
    situacao: string;
    justificativa: string | null;
  }>;
  lances: Array<{
    id: number;
    propostaId: number;
    licitanteNome: string;
    fornecedorNome: string;
    itemNumero: number | null;
    valorLance: number;
    dataLance: string | null;
    usuario: string | null;
    observacao: string | null;
  }>;
  recursos: Array<{
    id: number;
    licitanteNome: string;
    fornecedorNome: string;
    dataInterposicao: string | null;
    dataJulgamento: string | null;
    resultado: string;
    descricao: string;
    decisao: string | null;
  }>;
}

export interface DossieContrato {
  id: number;
  origem: "INTERNO" | "PNCP";
  numeroContrato: string;
  fornecedorId: number | null;
  fornecedorNome: string;
  fornecedorCnpj: string | null;
  valorContrato: number | null;
  dataAssinatura: string | null;
  dataVigenciaInicio: string | null;
  dataVigenciaFim: string | null;
  diasVigencia: number | null;
  objeto: string;
  status: string;
  pncpContractId: string | null;
  pncpProcessId: string | null;
  pncpUrl: string | null;
  pncpApiUrl: string | null;
  documentoContratoUrl: string | null;
  documentoEmpenhoUrl: string | null;
  itens: Array<{
    id: number;
    descricao: string;
    unidade: string;
    quantidadeContratada: number;
    quantidadeConsumida: number;
    saldoQuantidade: number;
    valorUnitario: number | null;
    valorTotal: number | null;
    ativo: boolean;
  }>;
  aditivos: Array<{
    id: number;
    numeroAditivo: number;
    tipo: string;
    descricao: string;
    valorAditado: number | null;
    diasAdicionados: number | null;
    dataAssinatura: string | null;
  }>;
}

export interface DossieDocumento {
  id: number;
  titulo: string;
  descricao: string | null;
  tipo: string;
  categoria: string | null;
  versao: number;
  arquivoUrl: string | null;
  mimeType: string | null;
  dataReferencia: string | null;
  publico: boolean;
  palavrasChave: string[];
  criadoEm: string | null;
}

export interface DossiePrazo {
  id: number;
  tipo: string;
  titulo: string;
  dataPrevista: string | null;
  dataRealizada: string | null;
  status: string;
  responsavel: string | null;
  observacao: string | null;
}

export interface DossieMovimentacao {
  id: number;
  moduloOrigem: string | null;
  moduloDestino: string;
  descricao: string;
  observacao: string | null;
  usuario: string | null;
  criadoEm: string | null;
}

export interface DossieImportacoes {
  legado: {
    registros: Array<{
      id: number;
      loteId: number;
      loteArquivo: string;
      abaOrigem: string;
      linha: number;
      legacyId: string | null;
      modalidade: string | null;
      processoAdministrativo: string | null;
      protocolo: string | null;
      numeroEdital: string | null;
      statusLegado: string | null;
      secretaria: string | null;
      mappedSecretaria: string | null;
      objetoResumo: string | null;
      valorEstimado: number | null;
      valorContratado: number | null;
      analysisSeverity: string;
      reviewStatus: string;
      reviewNotes: string | null;
      issues: unknown[];
      rawPayload: Record<string, unknown>;
    }>;
  };
  bll: {
    processo: {
      id: number;
      origem: string;
      chaveExterna: string;
      idOrigem: string | null;
      numeroEdital: string | null;
      numeroAdministrativo: string | null;
      anoReferencia: number | null;
      modalidade: string;
      situacaoExterna: string | null;
      tipoContrato: string | null;
      artigo: string | null;
      inciso: string | null;
      objeto: string;
      condutorNome: string | null;
      coordenadorNome: string | null;
      autoridadeNome: string | null;
      fornecedorNome: string | null;
      valorReferencia: number | null;
      valorTotal: number | null;
      publicacaoEm: string | null;
      conclusaoEm: string | null;
      inicioRecepcaoEm: string | null;
      fimRecepcaoEm: string | null;
      inicioDisputaEm: string | null;
      linkExterno: string | null;
      totalLotes: number;
      totalItens: number;
      justificativa: string | null;
      legislacaoAplicavel: string | null;
      observacoes: string | null;
      cotaMe: boolean | null;
      codigoPncp: string | null;
      urlPncp: string | null;
      dataSincronizacaoPncp: string | null;
      completenessScore: number | null;
      statusConciliacao: string;
      scoreConciliacao: number | null;
      detalhesConciliacao: unknown;
      primeiraCapturaEm: string | null;
      ultimaAtualizacaoEm: string | null;
    } | null;
    lotes: Array<{
      id: number;
      numero: string;
      titulo: string;
      tipo: string | null;
      faseAtual: string | null;
      valorReferencia: number | null;
      valorHomologado: number | null;
      vencedor: string | null;
      exclusivoMe: boolean | null;
      localEntrega: string | null;
      garantiaExigida: string | null;
    }>;
    itens: Array<{
      id: number;
      loteNumero: string | null;
      itemNumero: string | null;
      descricao: string;
      unidade: string | null;
      quantidade: number | null;
      fornecedorNome: string | null;
      marca: string | null;
      modelo: string | null;
      valorReferencia: number | null;
      valorUnitario: number | null;
      subtotal: number | null;
      situacaoExterna: string | null;
      faseExterna: string | null;
    }>;
    itensEspecificados: Array<{
      id: number;
      loteNumero: string | null;
      numeroItem: string;
      codigoCatalogo: string | null;
      descricaoResumida: string;
      especificacaoTecnica: string | null;
      unidadeMedida: string | null;
      quantidade: number | null;
      valorReferenciaUnitario: number | null;
      valorHomologadoUnitario: number | null;
      subtotalReferencia: number | null;
      subtotalHomologado: number | null;
      fornecedorHomologado: string | null;
      marcaHomologada: string | null;
      modeloHomologado: string | null;
    }>;
    auditoriaEdicoes: Array<{
      id: number;
      usuario: string | null;
      justificativa: string;
      origemEdicao: string;
      criadoEm: string | null;
      camposAlterados: unknown;
    }>;
  };
  pncp: {
    contratacoes: Array<{
      id: number;
      numeroControlePncp: string;
      modalidade: string | null;
      modoDisputa: string | null;
      criterioJulgamento: string | null;
      objeto: string | null;
      valorTotalEstimado: number | null;
      dataPublicacao: string | null;
      dataAberturaProposta: string | null;
      dataEncerramentoProposta: string | null;
      situacao: string | null;
      urlProcesso: string | null;
      itens: Array<{
        id: number;
        numeroItem: string | null;
        descricao: string | null;
        unidade: string | null;
        quantidade: number | null;
        valorUnitario: number | null;
        valorTotal: number | null;
        situacao: string | null;
        fornecedorNome: string | null;
        fornecedorDocumento: string | null;
      }>;
    }>;
    atas: Array<{
      id: number;
      idAtaPncp: string;
      numeroAta: string | null;
      objeto: string | null;
      valorGlobal: number | null;
      dataAssinatura: string | null;
      dataInicioVigencia: string | null;
      dataFimVigencia: string | null;
      situacao: string | null;
      fornecedorNome: string | null;
      fornecedorDocumento: string | null;
      urlAta: string | null;
      itens: Array<{
        id: number;
        numeroItem: string | null;
        descricao: string | null;
        unidade: string | null;
        quantidade: number | null;
        valorUnitario: number | null;
        valorTotal: number | null;
        fornecedorNome: string | null;
        fornecedorDocumento: string | null;
      }>;
    }>;
    contratos: Array<{
      id: number;
      idContratoPncp: string;
      numeroContrato: string | null;
      objeto: string | null;
      modalidade: string | null;
      valorTotal: number | null;
      dataAssinatura: string | null;
      dataInicioVigencia: string | null;
      dataFimVigencia: string | null;
      dataEncerramento: string | null;
      situacao: string | null;
      fornecedorNome: string | null;
      fornecedorDocumento: string | null;
      urlContrato: string | null;
      aditivos: Array<{
        id: number;
        idAditivoPncp: string | null;
        numeroAditivo: string | null;
        tipoAditivo: string | null;
        objeto: string | null;
        valorAditivo: number | null;
        dataAssinatura: string | null;
        dataInicioVigencia: string | null;
        dataFimVigencia: string | null;
      }>;
    }>;
  };
}

export interface DossieDetail {
  resumo: DossieResumo;
  processo: DossieProcesso;
  planejamento: DossiePlanejamento;
  itens: DossieItem[];
  cotacoesPreliminares: DossieCotacaoPreliminar[];
  cotacoesMercado: DossieCotacaoMercado[];
  fornecedores: DossieFornecedorResumo[];
  fornecedoresVencedores: DossieFornecedorVencedor[];
  licitacao: DossieLicitacao;
  contratos: DossieContrato[];
  documentos: DossieDocumento[];
  prazos: DossiePrazo[];
  workflow: {
    estado: {
      moduloAtual: string | null;
      situacao: string | null;
      etapaAtual: string | null;
      dataInicio: string | null;
      dataConclusao: string | null;
      atualizadoEm: string | null;
    } | null;
    movimentacoes: DossieMovimentacao[];
  };
  importacoes: DossieImportacoes;
}

export type DossieDetailInput = z.infer<typeof dossieDetailInputSchema>;
export type DossieProcessOptionsInput = z.infer<
  typeof dossieProcessOptionsInputSchema
>;
