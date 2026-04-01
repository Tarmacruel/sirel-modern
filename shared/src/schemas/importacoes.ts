import { z } from "zod";

export const importacaoBllSourceOptions = [
  "LICITACAO",
  "COMPRA_DIRETA",
] as const;
export const importacaoBllModeOptions = ["REMOTA_JSON", "CSV_MANUAL"] as const;
export const importacaoBllExecutionStatusOptions = [
  "PROCESSANDO",
  "CONCLUIDA",
  "ERRO",
] as const;
export const importacaoBllConciliacaoStatusOptions = [
  "PENDENTE",
  "SUGERIDO",
  "VINCULADO",
  "IGNORADO",
] as const;
export const importacaoLegadoLoteStatusOptions = [
  "EM_REVISAO",
  "PRONTO_PARA_IMPORTACAO",
  "ARQUIVADO",
] as const;
export const importacaoLegadoRowReviewStatusOptions = [
  "PENDENTE",
  "APROVAR_IMPORTACAO",
  "IGNORAR",
  "VINCULAR_INTERNO",
  "DUPLICADO_BASE",
  "REVISAR",
] as const;

export const importacaoBllListInputSchema = z.object({
  source: z.enum(importacaoBllSourceOptions).optional(),
  conciliationStatus: z.enum(importacaoBllConciliacaoStatusOptions).optional(),
  search: z.string().trim().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(12),
});

export const importacaoBllExecutionListInputSchema = z.object({
  source: z.enum(importacaoBllSourceOptions).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(50).default(10),
});

export const importacaoBllDetailInputSchema = z.object({
  id: z.number().int().positive(),
});

export const importacaoBllCsvInputSchema = z.object({
  source: z.enum(importacaoBllSourceOptions),
  registrosFilename: z.string().trim().min(1),
  registrosContent: z.string().min(1),
  itensFilename: z.string().trim().min(1),
  itensContent: z.string().min(1),
});

export const importacaoBllRemoteSyncInputSchema = z.object({
  source: z.enum(importacaoBllSourceOptions).optional(),
});

export const importacaoBllSearchProcessosInputSchema = z.object({
  importedId: z.number().int().positive(),
  search: z.string().trim().optional(),
  pageSize: z.number().int().positive().max(20).default(8),
});

export const importacaoBllLinkProcessoInputSchema = z.object({
  importedId: z.number().int().positive(),
  processoId: z.number().int().positive(),
});

export const importacaoBllUnlinkProcessoInputSchema = z.object({
  importedId: z.number().int().positive(),
});

export const importacaoBllDeleteProcessoInputSchema = z.object({
  importedId: z.number().int().positive(),
});

export const importacaoBllDeleteProcessosInputSchema = z.object({
  importedIds: z.array(z.number().int().positive()).min(1),
});

export const importacaoBllSetIgnoredInputSchema = z.object({
  importedId: z.number().int().positive(),
  ignored: z.boolean().default(true),
});

export const importacaoBllAutoReconcileInputSchema = z.object({
  source: z.enum(importacaoBllSourceOptions).optional(),
  onlyPending: z.boolean().default(true),
});

export const importacaoLegadoXlsxRowSchema = z.object({
  linha: z.number().int().positive(),
  legacyId: z.string().trim().nullable().optional(),
  modalidade: z.string().trim().nullable().optional(),
  formaConducao: z.string().trim().nullable().optional(),
  processoAdministrativo: z.string().trim().nullable().optional(),
  protocolo: z.string().trim().nullable().optional(),
  numeroEdital: z.string().trim().nullable().optional(),
  plataforma: z.string().trim().nullable().optional(),
  prioridade: z.string().trim().nullable().optional(),
  status: z.string().trim().nullable().optional(),
  condutorProcesso: z.string().trim().nullable().optional(),
  resumoObjeto: z.string().trim().nullable().optional(),
  objeto: z.string().trim().nullable().optional(),
  secretaria: z.string().trim().nullable().optional(),
  dataPublicacaoDom: z.string().trim().nullable().optional(),
  dataPublicacaoDou: z.string().trim().nullable().optional(),
  dataPublicacaoJornal: z.string().trim().nullable().optional(),
  dataInicio: z.string().trim().nullable().optional(),
  dataEntrada: z.string().trim().nullable().optional(),
  dataEnvioParecerista: z.string().trim().nullable().optional(),
  dataAutorizacao: z.string().trim().nullable().optional(),
  horarioInicio: z.string().trim().nullable().optional(),
  dataAbertura: z.string().trim().nullable().optional(),
  horarioAbertura: z.string().trim().nullable().optional(),
  dataAberturaPropostas: z.string().trim().nullable().optional(),
  horaAberturaPropostas: z.string().trim().nullable().optional(),
  dataSuspensao: z.string().trim().nullable().optional(),
  dataRevogacao: z.string().trim().nullable().optional(),
  dataAdjudicacao: z.string().trim().nullable().optional(),
  dataHomologacao: z.string().trim().nullable().optional(),
  observacoesProcesso: z.string().trim().nullable().optional(),
  valorEstimado: z.number().nullable().optional(),
  valorContratado: z.number().nullable().optional(),
  vencedor: z.string().trim().nullable().optional(),
  cnpj: z.string().trim().nullable().optional(),
  licitantes: z.string().trim().nullable().optional(),
});

export const importacaoLegadoXlsxAnalyzeInputSchema = z.object({
  filename: z.string().trim().min(1),
  sheetName: z.string().trim().min(1),
  records: z.array(importacaoLegadoXlsxRowSchema).min(1).max(5000),
});

export const importacaoLegadoXlsxListLotesInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(20).default(8),
});

export const importacaoLegadoXlsxDetailInputSchema = z.object({
  loteId: z.number().int().positive(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  severity: z.enum(["CRITICO", "ATENCAO", "OK"]).optional(),
  reviewStatus: z.enum(importacaoLegadoRowReviewStatusOptions).optional(),
  onlyIssues: z.boolean().default(false),
});

export const importacaoLegadoXlsxUpdateRowInputSchema = z.object({
  loteId: z.number().int().positive(),
  rowId: z.number().int().positive(),
  reviewStatus: z.enum(importacaoLegadoRowReviewStatusOptions),
  reviewNotes: z.string().trim().max(4000).nullable().optional(),
  selectedInternalProcessId: z.number().int().positive().nullable().optional(),
  selectedImportedProcessId: z.number().int().positive().nullable().optional(),
});

export const importacaoLegadoXlsxBulkUpdateRowsInputSchema = z.object({
  loteId: z.number().int().positive(),
  rowIds: z.array(z.number().int().positive()).min(1).max(200),
  reviewStatus: z.enum(importacaoLegadoRowReviewStatusOptions),
  reviewNotes: z.string().trim().max(4000).nullable().optional(),
});

export const importacaoLegadoXlsxSetLoteStatusInputSchema = z.object({
  loteId: z.number().int().positive(),
  status: z.enum(importacaoLegadoLoteStatusOptions),
});

export type ImportacaoBllSource = (typeof importacaoBllSourceOptions)[number];
export type ImportacaoBllMode = (typeof importacaoBllModeOptions)[number];
export type ImportacaoBllExecutionStatus =
  (typeof importacaoBllExecutionStatusOptions)[number];
export type ImportacaoBllConciliacaoStatus =
  (typeof importacaoBllConciliacaoStatusOptions)[number];
export type ImportacaoLegadoLoteStatus =
  (typeof importacaoLegadoLoteStatusOptions)[number];
export type ImportacaoLegadoRowReviewStatus =
  (typeof importacaoLegadoRowReviewStatusOptions)[number];
export type ImportacaoBllListInput = z.infer<
  typeof importacaoBllListInputSchema
>;
export type ImportacaoBllExecutionListInput = z.infer<
  typeof importacaoBllExecutionListInputSchema
>;
export type ImportacaoBllDetailInput = z.infer<
  typeof importacaoBllDetailInputSchema
>;
export type ImportacaoBllCsvInput = z.infer<typeof importacaoBllCsvInputSchema>;
export type ImportacaoBllRemoteSyncInput = z.infer<
  typeof importacaoBllRemoteSyncInputSchema
>;
export type ImportacaoBllSearchProcessosInput = z.infer<
  typeof importacaoBllSearchProcessosInputSchema
>;
export type ImportacaoBllLinkProcessoInput = z.infer<
  typeof importacaoBllLinkProcessoInputSchema
>;
export type ImportacaoBllUnlinkProcessoInput = z.infer<
  typeof importacaoBllUnlinkProcessoInputSchema
>;
export type ImportacaoBllDeleteProcessoInput = z.infer<
  typeof importacaoBllDeleteProcessoInputSchema
>;
export type ImportacaoBllSetIgnoredInput = z.infer<
  typeof importacaoBllSetIgnoredInputSchema
>;
export type ImportacaoBllAutoReconcileInput = z.infer<
  typeof importacaoBllAutoReconcileInputSchema
>;
export type ImportacaoLegadoXlsxRow = z.infer<
  typeof importacaoLegadoXlsxRowSchema
>;
export type ImportacaoLegadoXlsxAnalyzeInput = z.infer<
  typeof importacaoLegadoXlsxAnalyzeInputSchema
>;
export type ImportacaoLegadoXlsxListLotesInput = z.infer<
  typeof importacaoLegadoXlsxListLotesInputSchema
>;
export type ImportacaoLegadoXlsxDetailInput = z.infer<
  typeof importacaoLegadoXlsxDetailInputSchema
>;
export type ImportacaoLegadoXlsxUpdateRowInput = z.infer<
  typeof importacaoLegadoXlsxUpdateRowInputSchema
>;
export type ImportacaoLegadoXlsxBulkUpdateRowsInput = z.infer<
  typeof importacaoLegadoXlsxBulkUpdateRowsInputSchema
>;
export type ImportacaoLegadoXlsxSetLoteStatusInput = z.infer<
  typeof importacaoLegadoXlsxSetLoteStatusInputSchema
>;

// PNCP Schemas
export const pncpSearchInputSchema = z.object({
  anoCompra: z.number().int().optional(),
  modalidadeId: z.number().int().optional(),
  orgaoCnpj: z.string().optional(),
  dataInicial: z.string().optional(),
  dataFinal: z.string().optional(),
  pagina: z.number().int().positive().default(1),
  tamanhoPagina: z.number().int().positive().max(50).default(10),
});

export const pncpConciliationInputSchema = z.object({
  importedId: z.number().int().positive(),
  pncpProcessId: z.string(),
});

export type PncpSearchInput = z.infer<typeof pncpSearchInputSchema>;
export type PncpConciliationInput = z.infer<typeof pncpConciliationInputSchema>;

export const pncpStoredEntityOptions = [
  "CONTRATACOES",
  "ATAS",
  "CONTRATOS",
] as const;

export const pncpStoredListInputSchema = z.object({
  tipo: z.enum(pncpStoredEntityOptions),
  search: z.string().trim().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(50).default(12),
});

export const pncpStoredDetailInputSchema = z.object({
  tipo: z.enum(pncpStoredEntityOptions),
  id: z.number().int().positive(),
});

export const pncpStoredDeleteInputSchema = z.object({
  tipo: z.enum(pncpStoredEntityOptions),
  id: z.number().int().positive(),
});

export const pncpStoredSearchProcessosInputSchema = z.object({
  tipo: z.enum(pncpStoredEntityOptions),
  id: z.number().int().positive(),
  search: z.string().trim().optional(),
  pageSize: z.number().int().positive().max(20).default(8),
});

export const pncpStoredLinkProcessoInputSchema = z.object({
  tipo: z.enum(pncpStoredEntityOptions),
  id: z.number().int().positive(),
  processoId: z.number().int().positive(),
});

export const pncpStoredUnlinkProcessoInputSchema = z.object({
  tipo: z.enum(pncpStoredEntityOptions),
  id: z.number().int().positive(),
});

export type PncpStoredEntity = (typeof pncpStoredEntityOptions)[number];
export type PncpStoredListInput = z.infer<typeof pncpStoredListInputSchema>;
export type PncpStoredDetailInput = z.infer<typeof pncpStoredDetailInputSchema>;
export type PncpStoredDeleteInput = z.infer<typeof pncpStoredDeleteInputSchema>;
export type PncpStoredSearchProcessosInput = z.infer<
  typeof pncpStoredSearchProcessosInputSchema
>;
export type PncpStoredLinkProcessoInput = z.infer<
  typeof pncpStoredLinkProcessoInputSchema
>;
export type PncpStoredUnlinkProcessoInput = z.infer<
  typeof pncpStoredUnlinkProcessoInputSchema
>;
