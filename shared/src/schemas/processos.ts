import { z } from "zod";

import {
  modoDisputaOptions,
  modalidadeGrupoOptions,
  processoOrigemCadastroOptions,
  processoTipoObjetoOptions,
  workflowModuleOptions,
  workflowSituacaoOptions,
} from "../const.js";

export const processoListInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  secretariaId: z.number().int().positive().optional(),
  statusId: z.number().int().positive().optional(),
  moduloAtual: z.string().optional(),
  situacao: z.string().optional(),
  modalidadeGrupo: z.enum(modalidadeGrupoOptions).optional(),
  somenteObrasServicosEngenharia: z.boolean().optional(),
  foraDoFluxo: z.boolean().optional(),
  paradosHaMaisDeSeteDias: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

export const processoCreateInputSchema = z
  .object({
    protocolo: z.string().max(160).optional(),
    dataEntradaLicitacao: z.string().optional(),
    numeroAdministrativo: z.string().max(64).optional(),
    numeroEdital: z.string().max(64).optional(),
    anoReferencia: z.number().int().gte(2020).lte(2100),
    secretariaId: z.number().int().positive(),
    modalidadeId: z.number().int().positive().optional(),
    statusId: z.number().int().positive().optional(),
    autoridadeCompetenteId: z.number().int().positive().optional(),
    objeto: z.string().min(10),
    valorEstimado: z.number().nonnegative().optional(),
    escopoDisputa: z.enum(["ITEM", "LOTE", "GLOBAL"]).optional(),
    criterioJulgamento: z.string().max(120).optional(),
    modoDisputa: z.enum(modoDisputaOptions).optional(),
    tipoObjeto: z.enum(processoTipoObjetoOptions).optional(),
    tipoContratacao: z
      .enum(["AQUISICAO", "REGISTRO_PRECO", "AQUISICAO_PARCELADA"])
      .optional(),
    condutorProcessoId: z.number().int().positive().optional(),
    dataAbertura: z.string().optional(),
    dataPublicacao: z.string().optional(),
    dataDisputaSessao: z.string().optional(),
    situacao: z.enum(workflowSituacaoOptions).optional(),
    origemCadastro: z.enum(processoOrigemCadastroOptions).optional(),
    foraDoFluxo: z.boolean().default(false),
    moduloInicial: z.enum(workflowModuleOptions).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.foraDoFluxo && !value.moduloInicial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["moduloInicial"],
        message: "Selecione o modulo inicial para processos fora do fluxo.",
      });
    }
    if (
      !value.foraDoFluxo &&
      value.moduloInicial &&
      value.moduloInicial !== "PLANEJAMENTO"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["moduloInicial"],
        message: "Processos no fluxo regular devem iniciar no Planejamento.",
      });
    }
  });

export const processoSetAtivoInputSchema = z.object({
  processoId: z.number().int().positive(),
  ativo: z.boolean(),
});

export const processoUpdateDataInputSchema = z.object({
  processoId: z.number().int().positive(),
  foraDoFluxo: z.boolean().optional(),
  protocolo: z.string().max(160).optional(),
  dataEntradaLicitacao: z.string().optional(),
  numeroAdministrativo: z.string().max(64).optional(),
  numeroEdital: z.string().max(64).optional(),
  dataAbertura: z.string().optional(),
  dataPublicacao: z.string().optional(),
  dataDisputaSessao: z.string().optional(),
  situacao: z.enum(workflowSituacaoOptions).optional(),
  secretariaId: z.number().int().positive().optional(),
  modalidadeId: z.number().int().positive().optional(),
  tipoObjeto: z.enum(processoTipoObjetoOptions).optional(),
  tipoContratacao: z
    .enum(["AQUISICAO", "REGISTRO_PRECO", "AQUISICAO_PARCELADA"])
    .optional(),
  autoridadeCompetenteId: z.number().int().positive().optional(),
  condutorProcessoId: z.number().int().positive().optional(),
  objeto: z.string().min(10).optional(),
  valorEstimado: z.number().nonnegative().optional(),
  criterioJulgamento: z.string().max(120).optional(),
  modoDisputa: z.enum(modoDisputaOptions).optional(),
  escopoDisputa: z.enum(["ITEM", "LOTE", "GLOBAL"]).optional(),
});

export const processoMacroPhaseTargetOptions = [
  "COMPRAS",
  "LICITACAO",
  "CONTRATOS",
] as const;

export const processoMacroPhaseGateInputSchema = z.object({
  processoId: z.number().int().positive(),
  moduloDestino: z.enum(processoMacroPhaseTargetOptions),
});

export const processoAdvanceMacroPhaseInputSchema =
  processoMacroPhaseGateInputSchema.extend({
    permitirBypass: z.boolean().default(false),
    justificativaAuditoria: z.string().trim().max(4000).optional(),
    observacao: z.string().trim().max(2000).optional(),
  });

export type ProcessoListInput = z.infer<typeof processoListInputSchema>;
export type ProcessoCreateInput = z.infer<typeof processoCreateInputSchema>;
export type ProcessoSetAtivoInput = z.infer<typeof processoSetAtivoInputSchema>;
export type ProcessoUpdateDataInput = z.infer<
  typeof processoUpdateDataInputSchema
>;
export type ProcessoMacroPhaseGateInput = z.infer<
  typeof processoMacroPhaseGateInputSchema
>;
export type ProcessoAdvanceMacroPhaseInput = z.infer<
  typeof processoAdvanceMacroPhaseInputSchema
>;
