import { z } from "zod";

import {
  documentoAccessRoleOptions,
  documentoTipoOptions,
} from "./documentos.js";

const ataSessaoSummarySchema = z.object({
  totalLotes: z.number().int().nonnegative(),
  emAndamento: z.number().int().nonnegative(),
  adjudicados: z.number().int().nonnegative(),
  faseRecursal: z.number().int().nonnegative(),
  malsucedidos: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  parsingErrors: z.number().int().nonnegative(),
});

export const ataSessaoProcessInputSchema = z
  .object({
    sourcePath: z.string().trim().min(3).optional(),
    documentoId: z.number().int().positive().optional(),
    outputDir: z.string().trim().min(3).optional(),
    generatedByName: z.string().trim().min(2).max(160).optional(),
    edital: z.string().trim().min(2).max(240).optional(),
    processoAdministrativo: z.string().trim().min(2).max(240).optional(),
    arquivoOrigem: z.string().trim().min(2).max(320).optional(),
    dataGeracao: z.string().trim().min(2).max(120).optional(),
  })
  .refine((value) => Boolean(value.sourcePath || value.documentoId), {
    message: "Informe sourcePath ou documentoId para processar a ata.",
    path: ["sourcePath"],
  });

export const ataSessaoReportArtifactSchema = z.object({
  label: z.string(),
  path: z.string(),
  relativePath: z.string(),
  type: z.enum(["pdf", "xlsx", "json", "log"]),
  downloadUrl: z.string(),
});

export const ataSessaoProcessResultSchema = z.object({
  sourceFile: z.string(),
  outputDir: z.string(),
  generatedAt: z.string(),
  summary: ataSessaoSummarySchema,
  artifacts: z.array(ataSessaoReportArtifactSchema),
});

export const ataSessaoSuggestedProcessSchema = z.object({
  processId: z.number().int().positive(),
  numeroSirel: z.string(),
  numeroEdital: z.string().nullable(),
  numeroAdministrativo: z.string().nullable(),
  objeto: z.string(),
  moduloAtual: z.string().nullable(),
  score: z.number().nonnegative(),
  level: z.enum(["ALTO", "MEDIO"]),
  reasons: z.array(z.string()),
});

export const ataSessaoDiscoveryResultSchema = z.object({
  discoveryId: z.number().int().positive(),
  generatedAt: z.string(),
  originalFileName: z.string(),
  summary: ataSessaoSummarySchema,
  artifacts: z.array(ataSessaoReportArtifactSchema),
  metadata: z.object({
    edital: z.string().nullable(),
    processoAdministrativo: z.string().nullable(),
    providedProcessoId: z.number().int().positive().nullable(),
    providedProcessoNumeroSirel: z.string().nullable(),
  }),
  suggestedProcesses: z.array(ataSessaoSuggestedProcessSchema),
});

export const ataSessaoPreviewIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  lotNumber: z.number().int().positive().nullable().optional(),
  severity: z.enum(["BLOCKING", "WARNING"]),
  entityType: z.string().nullable().optional(),
  entityLabel: z.string().nullable().optional(),
});

export const ataSessaoPreviewLotSchema = z.object({
  lotNumber: z.number().int().positive(),
  statusAta: z.string(),
  title: z.string(),
  matchedItemId: z.number().int().positive().nullable(),
  matchedItemLabel: z.string().nullable(),
  itemMatchStatus: z.enum(["MATCHED", "AMBIGUOUS", "MISSING"]),
  actions: z.array(z.string()),
  issues: z.array(ataSessaoPreviewIssueSchema),
});

export const ataSessaoPreviewCountsSchema = z.object({
  fornecedoresCriar: z.number().int().nonnegative(),
  licitantesCriar: z.number().int().nonnegative(),
  lotesCriar: z.number().int().nonnegative(),
  propostasCriar: z.number().int().nonnegative(),
  propostasAtualizar: z.number().int().nonnegative(),
  lancesCriar: z.number().int().nonnegative(),
  recursosCriar: z.number().int().nonnegative(),
  resultadosAtualizar: z.number().int().nonnegative(),
  conflitosBloqueantes: z.number().int().nonnegative(),
});

export const ataSessaoPreviewSchema = z.object({
  runId: z.number().int().positive(),
  generatedAt: z.string(),
  processId: z.number().int().positive(),
  documentId: z.number().int().positive().nullable(),
  artifacts: z.array(ataSessaoReportArtifactSchema),
  discoveryMode: z
    .enum([
      "PROCESSO_EXPLICITO",
      "SUGERIDO_POR_IDENTIFICADORES",
      "ESCOLHIDO_MANUALMENTE_APOS_SUGESTAO",
    ])
    .nullable(),
  process: z.object({
    id: z.number().int().positive(),
    numeroSirel: z.string(),
    numeroEdital: z.string().nullable(),
    numeroAdministrativo: z.string().nullable(),
    objeto: z.string(),
    moduloAtual: z.string().nullable(),
  }),
  document: z
    .object({
      id: z.number().int().positive(),
      titulo: z.string(),
      arquivoUrl: z.string().nullable(),
    })
    .nullable(),
  extractedMetadata: z.object({
    edital: z.string().nullable(),
    processoAdministrativo: z.string().nullable(),
  }),
  summary: ataSessaoSummarySchema,
  phase: z.object({
    current: z.string(),
    suggested: z.string().nullable(),
    willAdvance: z.boolean(),
  }),
  counts: ataSessaoPreviewCountsSchema,
  warnings: z.array(z.string()),
  blockingIssues: z.array(ataSessaoPreviewIssueSchema),
  lots: z.array(ataSessaoPreviewLotSchema),
});

export const ataSessaoApplyInputSchema = z.object({
  runId: z.number().int().positive(),
});

export const ataSessaoApplyResultSchema = z.object({
  success: z.boolean(),
  runId: z.number().int().positive(),
  processId: z.number().int().positive(),
  documentId: z.number().int().positive().nullable(),
  appliedAt: z.string(),
  phase: z.object({
    current: z.string(),
    suggested: z.string().nullable(),
    willAdvance: z.boolean(),
  }),
  counts: ataSessaoPreviewCountsSchema,
});

export const ataSessaoPreviewProcessInputSchema = z.object({
  processoId: z.number().int().positive(),
  documentoId: z.number().int().positive(),
});

export const ataSessaoPreviewDocumentDraftSchema = z.object({
  tipo: z.enum(documentoTipoOptions).default("OUTRO"),
  categoria: z.string().trim().max(120).optional(),
  titulo: z.string().trim().min(3).max(255),
  descricao: z.string().trim().max(1000).optional(),
  dataReferencia: z.string().trim().max(20).optional(),
  publico: z.boolean().default(false),
  palavrasChave: z.array(z.string().trim().min(1).max(50)).default([]),
  restritoA: z.array(z.enum(documentoAccessRoleOptions)).default([]),
});

export const ataSessaoCreatePreviewFromDiscoveryInputSchema = z.object({
  discoveryId: z.number().int().positive(),
  processoId: z.number().int().positive(),
  selectionMode: z.enum(["SUGERIDO", "MANUAL"]).default("SUGERIDO"),
  document: ataSessaoPreviewDocumentDraftSchema,
});

export type AtaSessaoProcessInput = z.infer<typeof ataSessaoProcessInputSchema>;
export type AtaSessaoProcessResult = z.infer<
  typeof ataSessaoProcessResultSchema
>;
export type AtaSessaoSuggestedProcess = z.infer<
  typeof ataSessaoSuggestedProcessSchema
>;
export type AtaSessaoDiscoveryResult = z.infer<
  typeof ataSessaoDiscoveryResultSchema
>;
export type AtaSessaoPreviewIssue = z.infer<typeof ataSessaoPreviewIssueSchema>;
export type AtaSessaoPreviewLot = z.infer<typeof ataSessaoPreviewLotSchema>;
export type AtaSessaoPreviewCounts = z.infer<
  typeof ataSessaoPreviewCountsSchema
>;
export type AtaSessaoPreview = z.infer<typeof ataSessaoPreviewSchema>;
export type AtaSessaoApplyInput = z.infer<typeof ataSessaoApplyInputSchema>;
export type AtaSessaoApplyResult = z.infer<typeof ataSessaoApplyResultSchema>;
export type AtaSessaoPreviewProcessInput = z.infer<
  typeof ataSessaoPreviewProcessInputSchema
>;
export type AtaSessaoPreviewDocumentDraft = z.infer<
  typeof ataSessaoPreviewDocumentDraftSchema
>;
export type AtaSessaoCreatePreviewFromDiscoveryInput = z.infer<
  typeof ataSessaoCreatePreviewFromDiscoveryInputSchema
>;
