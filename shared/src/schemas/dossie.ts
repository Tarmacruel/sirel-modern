import { z } from "zod";

export const dossieDetailInputSchema = z.object({
  processoId: z.number().int().positive(),
});

export const dossieProcessOptionsInputSchema = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().positive().max(100).default(50),
});

export const dossieItemOptionsInputSchema = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().positive().max(100).default(50),
});

export const dossieFornecedorOptionsInputSchema = z.object({
  search: z.string().trim().optional(),
  limit: z.number().int().positive().max(100).default(50),
});

export const dossieItemFiltersSchema = z.object({
  periodoInicio: z.string().trim().optional(),
  periodoFim: z.string().trim().optional(),
  modalidadeId: z.number().int().positive().optional(),
  secretariaId: z.number().int().positive().optional(),
  status: z.string().trim().optional(),
  processoId: z.number().int().positive().optional(),
  contratoId: z.number().int().positive().optional(),
  fornecedorId: z.number().int().positive().optional(),
});

export const dossieFornecedorFiltersSchema = z.object({
  periodoInicio: z.string().trim().optional(),
  periodoFim: z.string().trim().optional(),
  modalidadeId: z.number().int().positive().optional(),
  secretariaId: z.number().int().positive().optional(),
  status: z.string().trim().optional(),
  processoId: z.number().int().positive().optional(),
  contratoId: z.number().int().positive().optional(),
  itemId: z.number().int().positive().optional(),
});

export const dossieItemDetailInputSchema = z.object({
  itemId: z.number().int().positive(),
  filters: dossieItemFiltersSchema.default({}),
});

export const dossieFornecedorDetailInputSchema = z.object({
  fornecedorId: z.number().int().positive(),
  filters: dossieFornecedorFiltersSchema.default({}),
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
  catalogoItemId: number | null;
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

export interface DossieEntityOption {
  id: number;
  label: string;
  subtitle: string | null;
}

export interface DossieInsight {
  id: string;
  categoria: string;
  titulo: string;
  descricao: string;
  severidade: "info" | "warning" | "critical";
}

export interface DossieAuditChange {
  id: number;
  acao: "CREATE" | "UPDATE" | "DELETE";
  descricao: string | null;
  usuario: string | null;
  criadoEm: string | null;
  camposAlterados: string[];
}

export interface DossieTimelineEvent {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string;
  data: string | null;
  href: string | null;
}

export interface DossieFilterOption {
  id: number;
  label: string;
  subtitle: string | null;
}

export interface DossieStatusOption {
  codigo: string;
  nome: string;
}

export interface DossieSerieTemporalPoint {
  chave: string;
  label: string;
  valor: number;
}

export interface DossieMultiSeriePoint {
  chave: string;
  label: string;
  valorA: number;
  valorB: number;
  valorC?: number;
}

export interface DossieScatterPoint {
  id: string;
  label: string;
  eixoX: number;
  eixoY: number;
  serie: string | null;
  descricao: string | null;
}

export interface DossieHeatmapCell {
  linha: string;
  coluna: string;
  valor: number;
}

export interface DossieItemIdentificacao {
  id: number;
  codigoInterno: string;
  descricaoResumida: string;
  descricaoCompleta: string | null;
  unidadeMedida: string;
  categoria: string | null;
  grupo: string | null;
  familia: string | null;
  status: string;
  criadoEm: string | null;
  atualizadoEm: string | null;
  observacoes: string | null;
  aliases: string[];
}

export interface DossieItemResumo {
  totalProcessos: number;
  totalLicitacoes: number;
  totalContratos: number;
  quantidadeTotalContratada: number;
  valorTotalContratado: number;
  valorMedioContratado: number | null;
  menorValorUnitarioHistorico: number | null;
  maiorValorUnitarioHistorico: number | null;
  ultimoValorContratado: number | null;
  totalFornecedoresDistintos: number;
  totalFornecedoresVencedores: number;
  taxaSucessoMediaContratacao: number | null;
  totalAparicoes: number;
  valorEstimadoAcumulado: number;
  valorHomologadoAcumulado: number;
}

export interface DossieItemProcessoRow {
  itemProcessoId: number;
  processoId: number;
  numeroSirel: string;
  numeroAdministrativo: string | null;
  objetoProcesso: string;
  secretariaId: number;
  secretaria: string;
  modalidadeId: number | null;
  modalidade: string | null;
  status: string | null;
  etapaAtual: string | null;
  dataReferencia: string | null;
  quantidadePrevista: number;
  unidade: string;
  valorEstimado: number | null;
  valorHomologado: number | null;
}

export interface DossieItemLicitacaoRow {
  itemProcessoId: number;
  processoId: number;
  numeroSirel: string;
  edital: string | null;
  modalidadeId: number | null;
  modalidade: string | null;
  criterioJulgamento: string | null;
  loteNumero: number | null;
  itemNumero: number;
  quantidadeLicitada: number;
  unidade: string;
  valorEstimadoUnitario: number | null;
  melhorValorOfertado: number | null;
  fornecedorVencedorId: number | null;
  fornecedorVencedor: string | null;
  valorVencedor: number | null;
  economiaAbsoluta: number | null;
  economiaPercentual: number | null;
  statusItem: string;
  dataResultado: string | null;
}

export interface DossieItemContratoRow {
  contratoId: number;
  numeroContrato: string;
  fornecedorId: number | null;
  fornecedorNome: string;
  processoId: number;
  processoNumeroSirel: string;
  quantidadeContratada: number;
  quantidadeConsumida: number;
  saldoRemanescente: number;
  valorUnitario: number | null;
  valorTotalItem: number | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  status: string;
}

export interface DossieItemFornecedorRow {
  fornecedorId: number | null;
  fornecedorNome: string;
  documento: string | null;
  participacoes: number;
  vitorias: number;
  menorValorOfertado: number | null;
  maiorValorOfertado: number | null;
  valorMedioOfertado: number | null;
  ultimoValorOfertado: number | null;
  ultimoValorVencedor: number | null;
  taxaVitoria: number | null;
  origemPrincipal: string;
}

export interface DossieItemEvolucaoPrecoRow {
  data: string;
  processoId: number | null;
  processoNumeroSirel: string | null;
  fornecedorId: number | null;
  fornecedorNome: string | null;
  modalidadeId: number | null;
  modalidade: string | null;
  secretariaId: number | null;
  secretaria: string | null;
  valorEstimado: number | null;
  valorVencedor: number | null;
  valorContratado: number | null;
}

export interface DossieItemAuditoria {
  ultimaAtualizacaoCadastro: string | null;
  usuariosSensiveis: string[];
  mudancasRelevantes: DossieAuditChange[];
  vinculosCriticos: string[];
}

export interface DossieItemCharts {
  seriePrecos: DossieMultiSeriePoint[];
  fornecedores: DossieSerieTemporalPoint[];
  modalidades: DossieSerieTemporalPoint[];
  status: DossieSerieTemporalPoint[];
  recorrencia: DossieSerieTemporalPoint[];
  dispersao: DossieScatterPoint[];
}

export interface DossieItemFiltersAvailable {
  modalidades: DossieFilterOption[];
  secretarias: DossieFilterOption[];
  processos: DossieFilterOption[];
  contratos: DossieFilterOption[];
  fornecedores: DossieFilterOption[];
  status: DossieStatusOption[];
}

export interface DossieItemDetail {
  identificacao: DossieItemIdentificacao;
  resumo: DossieItemResumo;
  filtrosDisponiveis: DossieItemFiltersAvailable;
  processos: DossieItemProcessoRow[];
  licitacoes: DossieItemLicitacaoRow[];
  contratos: DossieItemContratoRow[];
  fornecedores: DossieItemFornecedorRow[];
  evolucaoPrecos: DossieItemEvolucaoPrecoRow[];
  insights: DossieInsight[];
  charts: DossieItemCharts;
  auditoria: DossieItemAuditoria;
}

export interface DossieFornecedorIdentificacao {
  id: number;
  razaoSocial: string;
  nomeFantasia: string | null;
  documento: string;
  situacaoCadastralInterna: string;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  municipio: string | null;
  uf: string | null;
  criadoEm: string | null;
  atualizadoEm: string | null;
  observacoes: string | null;
  status: string;
  registroUnificado: boolean;
}

export interface DossieFornecedorResumoGerencial {
  totalProcessos: number;
  totalLicitacoes: number;
  totalVitorias: number;
  taxaVitoria: number | null;
  valorTotalOfertado: number;
  valorTotalVencido: number;
  valorTotalContratado: number;
  totalContratos: number;
  ticketMedioContrato: number | null;
  totalItensOfertados: number;
  totalItensVencidos: number;
  primeiroRegistroHistorico: string | null;
  ultimaParticipacao: string | null;
  ultimaVitoria: string | null;
}

export interface DossieFornecedorParticipacaoRow {
  processoId: number;
  numeroSirel: string;
  objetoProcesso: string;
  modalidadeId: number | null;
  modalidade: string | null;
  dataReferencia: string | null;
  papel: string;
  tipoParticipacao: string;
  valorGlobalOfertado: number | null;
  melhorClassificacao: number | null;
  statusFornecedor: string | null;
  secretariaId: number;
  secretaria: string;
}

export interface DossieFornecedorOfertaRow {
  id: string;
  tipoRegistro: string;
  processoId: number;
  numeroSirel: string;
  edital: string | null;
  itemId: number | null;
  itemCatalogoId: number | null;
  itemLabel: string;
  loteNumero: number | null;
  valorEstimado: number | null;
  valorOfertadoInicial: number | null;
  valorFinal: number | null;
  diferencaPercentualEstimado: number | null;
  classificacao: number | null;
  resultado: string | null;
  dataReferencia: string | null;
}

export interface DossieFornecedorVitoriaRow {
  processoId: number;
  numeroSirel: string;
  edital: string | null;
  itemProcessoId: number;
  itemCatalogoId: number | null;
  itemLabel: string;
  loteNumero: number | null;
  quantidade: number;
  unidade: string;
  valorVencedorUnitario: number | null;
  valorTotalVencido: number | null;
  dataResultado: string | null;
  statusPosterior: string;
}

export interface DossieFornecedorContratoRow {
  contratoId: number;
  origem: "INTERNO" | "PNCP";
  numeroContrato: string;
  processoId: number | null;
  processoNumeroSirel: string | null;
  objetoResumido: string;
  valorTotalContrato: number | null;
  valorAtribuidoFornecedor: number | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  status: string;
  totalItens: number;
  saldo: number | null;
  pncpUrl: string | null;
}

export interface DossieFornecedorItemRow {
  itemCatalogoId: number | null;
  itemLabel: string;
  ofertado: number;
  vencido: number;
  menorPrecoOfertado: number | null;
  precoMedioOfertado: number | null;
  ultimoPrecoOfertado: number | null;
  ultimoPrecoVencedor: number | null;
  participacaoVitoriasFornecedor: number | null;
}

export interface DossieFornecedorAuditoria {
  ultimaAtualizacaoCadastro: string | null;
  trilha: DossieAuditChange[];
  observacoesCriticas: string[];
}

export interface DossieFornecedorCharts {
  participacoesVitorias: DossieMultiSeriePoint[];
  valorVencidoPorAno: DossieSerieTemporalPoint[];
  modalidades: DossieSerieTemporalPoint[];
  topItens: DossieSerieTemporalPoint[];
  funil: DossieSerieTemporalPoint[];
  heatmapSecretaria: DossieHeatmapCell[];
}

export interface DossieFornecedorFiltersAvailable {
  modalidades: DossieFilterOption[];
  secretarias: DossieFilterOption[];
  processos: DossieFilterOption[];
  contratos: DossieFilterOption[];
  itens: DossieFilterOption[];
  status: DossieStatusOption[];
}

export interface DossieFornecedorDetail {
  identificacao: DossieFornecedorIdentificacao;
  resumo: DossieFornecedorResumoGerencial;
  filtrosDisponiveis: DossieFornecedorFiltersAvailable;
  participacoes: DossieFornecedorParticipacaoRow[];
  ofertas: DossieFornecedorOfertaRow[];
  vitorias: DossieFornecedorVitoriaRow[];
  contratos: DossieFornecedorContratoRow[];
  itens: DossieFornecedorItemRow[];
  timeline: DossieTimelineEvent[];
  insights: DossieInsight[];
  charts: DossieFornecedorCharts;
  auditoria: DossieFornecedorAuditoria;
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
export type DossieItemOptionsInput = z.infer<
  typeof dossieItemOptionsInputSchema
>;
export type DossieFornecedorOptionsInput = z.infer<
  typeof dossieFornecedorOptionsInputSchema
>;
export type DossieItemDetailInput = z.infer<
  typeof dossieItemDetailInputSchema
>;
export type DossieFornecedorDetailInput = z.infer<
  typeof dossieFornecedorDetailInputSchema
>;
