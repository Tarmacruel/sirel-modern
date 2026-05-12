import { z } from "zod";

import { grauPrioridadeOptions, metodologiaCotacaoOptions } from "../const.js";


const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pcaStatusOptions = [
  "RASCUNHO",
  "EM_CONSOLIDACAO",
  "APROVADO",
  "PUBLICACAO_PREPARADA",
  "PUBLICADO",
  "CANCELADO",
] as const;

export const pcaListInputSchema = z.object({
  ano: z.number().int().min(2000).max(2100).optional(),
  secretariaId: z.number().int().positive().optional(),
  status: z.enum(pcaStatusOptions).optional(),
  search: z.string().trim().optional(),
});

export const pcaDetailInputSchema = z.object({
  planoId: z.number().int().positive(),
});

export const pcaSaveInputSchema = z.object({
  planoId: z.number().int().positive().optional(),
  ano: z.number().int().min(2000).max(2100),
  orgaoCnpj: z.string().trim().min(14).max(18),
  orgaoNome: z.string().trim().max(255).optional(),
  unidade: z.string().trim().min(2).max(255),
  secretariaId: z.number().int().positive().optional(),
  status: z.enum(pcaStatusOptions).default("RASCUNHO"),
  versao: z.number().int().positive().default(1),
  dataAprovacao: dateStringSchema.optional(),
  responsavelId: z.number().int().positive().optional(),
  responsavelNome: z.string().trim().max(255).optional(),
  justificativa: z.string().trim().max(6000).optional(),
  pncpId: z.string().trim().max(120).optional(),
  pncpUrl: z.string().trim().url().max(500).optional(),
  pncpPayload: z.record(z.string(), z.unknown()).optional(),
  metadados: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if ((value.status === "APROVADO" || value.status === "PUBLICADO") && !value.dataAprovacao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dataAprovacao"],
      message: "Informe a data de aprovação do PCA.",
    });
  }
});

export const pcaItemSaveInputSchema = z.object({
  planoId: z.number().int().positive(),
  itemId: z.number().int().positive().optional(),
  processoId: z.number().int().positive().optional(),
  dfdId: z.number().int().positive().optional(),
  itemProcessoId: z.number().int().positive().optional(),
  descricao: z.string().trim().min(3).max(4000),
  quantidade: z.number().positive(),
  unidade: z.string().trim().min(1).max(32),
  valorEstimado: z.number().nonnegative().optional(),
  dataDesejada: dateStringSchema.optional(),
  grauPrioridade: z.enum(grauPrioridadeOptions).default("MEDIA"),
  categoria: z.string().trim().min(2).max(120).default("PRODUTO"),
  tipo: z.string().trim().max(120).optional(),
  unidadeRequisitanteId: z.number().int().positive().optional(),
  unidadeRequisitante: z.string().trim().max(255).optional(),
  dfdVinculo: z.string().trim().max(120).optional(),
  pendencias: z.array(z.string().trim().min(1).max(255)).default([]),
  metadados: z.record(z.string(), z.unknown()).optional(),
});

export const pcaItemFromDfdInputSchema = z.object({
  planoId: z.number().int().positive(),
  processoId: z.number().int().positive(),
  itemIds: z.array(z.number().int().positive()).optional(),
});

export const pcaItemRemoveInputSchema = z.object({
  planoId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  justificativa: z.string().trim().max(1000).optional(),
});

export const pcaApproveInputSchema = z.object({
  planoId: z.number().int().positive(),
  dataAprovacao: dateStringSchema,
  responsavelId: z.number().int().positive().optional(),
  responsavelNome: z.string().trim().max(255).optional(),
  justificativa: z.string().trim().min(10).max(6000),
});

export const pcaConsolidateVersionInputSchema = z.object({
  planoId: z.number().int().positive(),
  justificativa: z.string().trim().min(10).max(6000),
});

export const pcaPreparePublicationInputSchema = z.object({
  planoId: z.number().int().positive(),
  canal: z.string().trim().min(2).max(80).default("PNCP"),
  pncpPayload: z.record(z.string(), z.unknown()).optional(),
});

export const pcaDocumentoGenerateInputSchema = z.object({
  planoId: z.number().int().positive(),
  formato: z.enum(["HTML", "JSON"]).default("HTML"),
});

export const planejamentoListInputSchema = z.object({
  search: z.string().trim().optional(),
  somenteSemDfd: z.boolean().optional(),
});

export const dfdSaveInputSchema = z
  .object({
    processoId: z.number().int().positive(),
    solicitanteId: z.number().int().positive(),
    secretariaDemandanteId: z.number().int().positive(),
    secretariaResponsavelId: z.number().int().positive(),
    grauPrioridade: z.enum(grauPrioridadeOptions),
    demandaSistemica: z.boolean().default(false),
    secretariasParticipantes: z.array(z.number().int().positive()).default([]),
    justificativa: z.string().trim().min(10),
    observacoes: z.string().trim().max(4000).optional(),
    responsavelIds: z.array(z.number().int().positive()).min(1),
    assinaturaResponsavelId: z.number().int().positive(),
    dataNecessidade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dataPrevistaConclusao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    concluir: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const participantesUnicos = Array.from(new Set(value.secretariasParticipantes));
    if (value.demandaSistemica && participantesUnicos.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secretariasParticipantes"],
        message: "Selecione pelo menos duas secretarias participantes para demanda sistemica.",
      });
    }

    const dataNecessidade = new Date(`${value.dataNecessidade}T00:00:00`);
    const dataPrevistaConclusao = new Date(`${value.dataPrevistaConclusao}T00:00:00`);
    if (dataPrevistaConclusao < dataNecessidade) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataPrevistaConclusao"],
        message: "A data prevista para conclusao deve ser igual ou posterior a data da necessidade.",
      });
    }

    if (!value.responsavelIds.includes(value.assinaturaResponsavelId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assinaturaResponsavelId"],
        message: "A assinatura deve corresponder a um dos responsaveis selecionados para a DFD.",
      });
    }
  });

export const dfdItemSaveInputSchema = z.object({
  processoId: z.number().int().positive(),
  itemId: z.number().int().positive().optional(),
  descricao: z.string().trim().min(3).max(4000),
  quantidade: z.number().positive(),
  unidade: z.string().trim().min(1).max(32),
});

export const dfdItemDeleteInputSchema = z.object({
  processoId: z.number().int().positive(),
  itemId: z.number().int().positive(),
});

export const dfdDeleteInputSchema = z.object({
  processoId: z.number().int().positive(),
});

export const catalogoItemListInputSchema = z.object({
  search: z.string().trim().optional(),
});

export const catalogoItemCreateInputSchema = z.object({
  descricao: z.string().trim().min(3).max(4000),
  unidadePadrao: z.string().trim().min(1).max(32),
});

export const dfdCatalogItemsAddInputSchema = z.object({
  processoId: z.number().int().positive(),
  itens: z.array(z.object({
    catalogoItemId: z.number().int().positive(),
    quantidade: z.number().positive(),
    unidade: z.string().trim().min(1).max(32),
  })).min(1),
});

export const etpSaveInputSchema = z.object({
  processoId: z.number().int().positive(),
  metodologiaCotacao: z.enum(metodologiaCotacaoOptions).default("MEDIA"),
  descricaoNecessidade: z.string().trim().max(6000).optional(),
  analiseSolucoesMercado: z.string().trim().max(6000).optional(),
  justificativaTecnica: z.string().trim().max(6000).optional(),
  providenciasPrevias: z.string().trim().max(4000).optional(),
  conclusaoViabilidade: z.string().trim().max(6000).optional(),
  observacoes: z.string().trim().max(4000).optional(),
  concluir: z.boolean().default(false),
});

export const trSaveInputSchema = z.object({
  processoId: z.number().int().positive(),
  orcamentoSigiloso: z.boolean().default(false),
  observacoes: z.string().trim().max(4000).optional(),
  concluir: z.boolean().default(false),
});

export const etpCotacaoSaveInputSchema = z.object({
  processoId: z.number().int().positive(),
  cotacaoId: z.number().int().positive().optional(),
  itemId: z.number().int().positive(),
  fonte: z.string().trim().min(2).max(255),
  fornecedorNome: z.string().trim().min(2).max(255),
  documento: z.string().trim().max(80).optional(),
  dataCotacao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  quantidadeConsiderada: z.number().positive(),
  valorUnitario: z.number().positive(),
  considerada: z.boolean().default(true),
  motivoDesconsideracao: z.enum(["SOBREPRECO", "INEXEQUIVEL", "OUTRO"]).optional(),
  justificativaDesconsideracao: z.string().trim().max(4000).optional(),
  observacao: z.string().trim().max(4000).optional(),
}).superRefine((value, ctx) => {
  if (!value.considerada && !value.motivoDesconsideracao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["motivoDesconsideracao"],
      message: "Informe o motivo da desconsideracao da cotacao.",
    });
  }
  if (!value.considerada && !value.justificativaDesconsideracao?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["justificativaDesconsideracao"],
      message: "Registre a justificativa para desconsiderar a cotacao.",
    });
  }
});

export const etpCotacaoDeleteInputSchema = z.object({
  processoId: z.number().int().positive(),
  cotacaoId: z.number().int().positive(),
});

export const planejamentoDocumentoGenerateInputSchema = z.object({
  processoId: z.number().int().positive(),
  documento: z.enum(["DFD", "MAPA_COMPARATIVO", "TR"]),
  formato: z.enum(["HTML", "PDF"]),
});

export type PcaListInput = z.infer<typeof pcaListInputSchema>;
export type PcaDetailInput = z.infer<typeof pcaDetailInputSchema>;
export type PcaSaveInput = z.infer<typeof pcaSaveInputSchema>;
export type PcaItemSaveInput = z.infer<typeof pcaItemSaveInputSchema>;
export type PcaItemFromDfdInput = z.infer<typeof pcaItemFromDfdInputSchema>;
export type PcaItemRemoveInput = z.infer<typeof pcaItemRemoveInputSchema>;
export type PcaApproveInput = z.infer<typeof pcaApproveInputSchema>;
export type PcaConsolidateVersionInput = z.infer<typeof pcaConsolidateVersionInputSchema>;
export type PcaPreparePublicationInput = z.infer<typeof pcaPreparePublicationInputSchema>;
export type PcaDocumentoGenerateInput = z.infer<typeof pcaDocumentoGenerateInputSchema>;
export type PlanejamentoListInput = z.infer<typeof planejamentoListInputSchema>;
export type DfdSaveInput = z.infer<typeof dfdSaveInputSchema>;
export type DfdItemSaveInput = z.infer<typeof dfdItemSaveInputSchema>;
export type DfdItemDeleteInput = z.infer<typeof dfdItemDeleteInputSchema>;
export type DfdDeleteInput = z.infer<typeof dfdDeleteInputSchema>;
export type CatalogoItemListInput = z.infer<typeof catalogoItemListInputSchema>;
export type CatalogoItemCreateInput = z.infer<typeof catalogoItemCreateInputSchema>;
export type DfdCatalogItemsAddInput = z.infer<typeof dfdCatalogItemsAddInputSchema>;
export type EtpSaveInput = z.infer<typeof etpSaveInputSchema>;
export type TrSaveInput = z.infer<typeof trSaveInputSchema>;
export type EtpCotacaoSaveInput = z.infer<typeof etpCotacaoSaveInputSchema>;
export type EtpCotacaoDeleteInput = z.infer<typeof etpCotacaoDeleteInputSchema>;
export type PlanejamentoDocumentoGenerateInput = z.infer<typeof planejamentoDocumentoGenerateInputSchema>;
