import { z } from "zod";

export const documentoTipoOptions = [
  "DFD",
  "ETP",
  "TR",
  "EDITAL",
  "COMUNICACAO_INTERNA",
  "RESULTADO",
  "CONTRATO",
  "OUTRO",
] as const;

export const documentoAccessRoleOptions = ["admin", "gestor", "operador", "auditor", "user"] as const;

export const documentoPublicacaoStatusOptions = [
  "RASCUNHO",
  "EM_REVISAO",
  "APROVADO",
  "REJEITADO",
  "RETIRADO",
] as const;

export const documentoListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  processoId: z.number().int().positive().optional(),
  search: z.string().trim().optional(),
  tipo: z.enum(documentoTipoOptions).optional(),
  categoria: z.string().trim().optional(),
  publico: z.boolean().optional(),
  statusPublicacao: z.enum(documentoPublicacaoStatusOptions).optional(),
  dataInicial: z.string().optional(),
  dataFinal: z.string().optional(),
});

export const documentoDetailInputSchema = z.object({
  documentoId: z.number().int().positive(),
});

export const documentoMetadataInputSchema = z.object({
  documentoId: z.number().int().positive(),
  titulo: z.string().trim().min(3).max(255),
  descricao: z.string().trim().max(1000).optional(),
  categoria: z.string().trim().max(120).optional(),
  dataReferencia: z.string().optional(),
  palavrasChave: z.array(z.string().trim().min(1).max(50)).default([]),
});

const documentoJustificativaSchema = z
  .string()
  .trim()
  .min(3, "Informe uma justificativa com ao menos 3 caracteres.")
  .max(4000);

export const documentoAccessInputSchema = z.object({
  documentoId: z.number().int().positive(),
  publico: z.boolean(),
  restritoA: z.array(z.enum(documentoAccessRoleOptions)).default([]),
  justificativa: documentoJustificativaSchema,
});

export const documentoPublicationActionInputSchema = z.object({
  documentoId: z.number().int().positive(),
  justificativa: documentoJustificativaSchema,
});

export const documentoProcessOptionsInputSchema = z.object({
  search: z.string().trim().max(160).optional(),
});

export type DocumentoListInput = z.infer<typeof documentoListInputSchema>;
export type DocumentoMetadataInput = z.infer<typeof documentoMetadataInputSchema>;
export type DocumentoAccessInput = z.infer<typeof documentoAccessInputSchema>;
export type DocumentoPublicationActionInput = z.infer<
  typeof documentoPublicationActionInputSchema
>;
export type DocumentoProcessOptionsInput = z.infer<
  typeof documentoProcessOptionsInputSchema
>;
