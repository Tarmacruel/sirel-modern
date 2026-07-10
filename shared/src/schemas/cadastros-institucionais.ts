import { z } from "zod";

export const atoDesignacaoTipoOptions = [
  "DECRETO",
  "PORTARIA",
  "RESOLUCAO",
  "OUTRO",
] as const;

export const grupoInstitucionalTipoOptions = [
  "COMISSAO_CONTRATACAO",
  "EQUIPE_APOIO",
] as const;

export const grupoInstitucionalMembroFuncaoOptions = [
  "PRESIDENTE",
  "AGENTE_CONTRATACAO",
  "PREGOEIRO",
  "MEMBRO",
  "MEMBRO_SUPLENTE",
  "COORDENADOR_APOIO",
  "APOIO",
  "OUTRO",
] as const;

export const ordenadorTipoVinculoOptions = [
  "TITULAR",
  "SUBSTITUTO",
  "DELEGADO",
] as const;

export const atoDesignacaoTipoLabels = {
  DECRETO: "Decreto",
  PORTARIA: "Portaria",
  RESOLUCAO: "Resolucao",
  OUTRO: "Outro",
} as const satisfies Record<(typeof atoDesignacaoTipoOptions)[number], string>;

export const grupoInstitucionalTipoLabels = {
  COMISSAO_CONTRATACAO: "Comissao de Contratacao",
  EQUIPE_APOIO: "Equipe de Apoio",
} as const satisfies Record<
  (typeof grupoInstitucionalTipoOptions)[number],
  string
>;

export const grupoInstitucionalMembroFuncaoLabels = {
  PRESIDENTE: "Presidente",
  AGENTE_CONTRATACAO: "Agente de contratacao",
  PREGOEIRO: "Pregoeiro",
  MEMBRO: "Membro",
  MEMBRO_SUPLENTE: "Membro suplente",
  COORDENADOR_APOIO: "Coordenador de apoio",
  APOIO: "Apoio",
  OUTRO: "Outro",
} as const satisfies Record<
  (typeof grupoInstitucionalMembroFuncaoOptions)[number],
  string
>;

export const ordenadorTipoVinculoLabels = {
  TITULAR: "Titular",
  SUBSTITUTO: "Substituto",
  DELEGADO: "Delegado",
} as const satisfies Record<
  (typeof ordenadorTipoVinculoOptions)[number],
  string
>;

const optionalDateSchema = z.string().trim().optional().or(z.literal(""));

function hasDuplicatePositiveNumbers(values: number[]) {
  const seen = new Set<number>();
  for (const value of values) {
    if (value <= 0) continue;
    if (seen.has(value)) return true;
    seen.add(value);
  }
  return false;
}

export const atoDesignacaoListInputSchema = z.object({
  search: z.string().trim().optional(),
  tipo: z.enum(atoDesignacaoTipoOptions).optional(),
  ativo: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

export const atoDesignacaoSaveInputSchema = z.object({
  id: z.number().int().positive().optional(),
  numero: z.string().trim().min(1, "Informe o numero do ato.").max(80),
  ano: z.number().int().min(1900).max(2200),
  tipo: z.enum(atoDesignacaoTipoOptions),
  ementa: z.string().trim().min(3, "Informe a ementa do ato."),
  dataEmissao: optionalDateSchema,
  dataPublicacao: optionalDateSchema,
  vigenciaInicio: optionalDateSchema,
  vigenciaFim: optionalDateSchema,
  arquivoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  arquivoChave: z.string().trim().max(500).optional().or(z.literal("")),
  mimeType: z.string().trim().max(120).optional().or(z.literal("")),
  tamanhoBytes: z.number().int().nonnegative().optional().nullable(),
  hashArquivo: z.string().trim().max(128).optional().or(z.literal("")),
  ativo: z.boolean().default(true),
});

export const atoDesignacaoGetInputSchema = z.object({
  id: z.number().int().positive(),
});

export const grupoInstitucionalMembroInputSchema = z.object({
  id: z.number().int().positive().optional(),
  pessoaId: z.number().int().positive(),
  funcao: z.enum(grupoInstitucionalMembroFuncaoOptions),
  ordem: z.number().int().nonnegative().default(0),
  titular: z.boolean().default(true),
  ativo: z.boolean().default(true),
});

export const grupoInstitucionalListInputSchema = z.object({
  search: z.string().trim().optional(),
  tipo: z.enum(grupoInstitucionalTipoOptions).optional(),
  secretariaId: z.number().int().positive().optional(),
  ativo: z.boolean().optional(),
  somenteVigentes: z.boolean().default(false),
  dataReferencia: optionalDateSchema,
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

export const grupoInstitucionalSaveInputSchema = z
  .object({
    id: z.number().int().positive().optional(),
    nome: z.string().trim().min(3, "Informe o nome da estrutura.").max(255),
    tipo: z.enum(grupoInstitucionalTipoOptions),
    sigla: z.string().trim().max(32).optional().or(z.literal("")),
    secretariaId: z.number().int().positive().optional().nullable(),
    atoDesignacaoId: z.number().int().positive("Selecione o ato de designacao."),
    vigenciaInicio: optionalDateSchema,
    vigenciaFim: optionalDateSchema,
    versao: z.number().int().positive().default(1),
    substituiGrupoId: z.number().int().positive().optional().nullable(),
    observacao: z.string().trim().optional().or(z.literal("")),
    ativo: z.boolean().default(true),
    membros: z.array(grupoInstitucionalMembroInputSchema).min(1),
  })
  .superRefine((value, ctx) => {
    if (hasDuplicatePositiveNumbers(value.membros.map((member) => member.pessoaId))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["membros"],
        message: "A mesma pessoa nao pode aparecer mais de uma vez na composicao.",
      });
    }
  });

export const grupoInstitucionalGetInputSchema = z.object({
  id: z.number().int().positive(),
});

export const ordenadorDespesaListInputSchema = z.object({
  search: z.string().trim().optional(),
  secretariaId: z.number().int().positive().optional(),
  ativo: z.boolean().optional(),
  somenteVigentes: z.boolean().default(false),
  dataReferencia: optionalDateSchema,
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

export const ordenadorDespesaSaveInputSchema = z
  .object({
    id: z.number().int().positive().optional(),
    pessoaId: z.number().int().positive("Selecione a pessoa."),
    secretariaIds: z.array(z.number().int().positive()).min(1),
    atoDesignacaoId: z.number().int().positive("Selecione o ato de designacao."),
    tipoVinculo: z.enum(ordenadorTipoVinculoOptions),
    vigenciaInicio: optionalDateSchema,
    vigenciaFim: optionalDateSchema,
    versao: z.number().int().positive().default(1),
    observacao: z.string().trim().optional().or(z.literal("")),
    ativo: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (hasDuplicatePositiveNumbers(value.secretariaIds)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secretariaIds"],
        message: "A mesma secretaria nao pode aparecer mais de uma vez no vinculo.",
      });
    }
  });

export const ordenadorDespesaGetInputSchema = z.object({
  id: z.number().int().positive(),
});

export const cadastroInstitucionalIdInputSchema = z.object({
  id: z.number().int().positive(),
});

export const designacoesForProcessInputSchema = z.object({
  processoId: z.number().int().positive(),
  search: z.string().trim().optional(),
  secretariaId: z.number().int().positive().optional(),
  dataReferencia: optionalDateSchema,
  somenteVigentes: z.boolean().default(true),
});

export const designacoesSelectForLicitacaoInputSchema = z.object({
  processoId: z.number().int().positive(),
  comissaoId: z.number().int().positive().optional().nullable(),
  equipeApoioId: z.number().int().positive().optional().nullable(),
  ordenadorDespesaId: z.number().int().positive().optional().nullable(),
  justificativa: z.string().trim().max(500).optional().or(z.literal("")),
  aplicarCondutorSugerido: z.boolean().default(false),
  condutorSugeridoId: z.number().int().positive().optional().nullable(),
});

export type AtoDesignacaoTipo =
  (typeof atoDesignacaoTipoOptions)[number];
export type GrupoInstitucionalTipo =
  (typeof grupoInstitucionalTipoOptions)[number];
export type GrupoInstitucionalMembroFuncao =
  (typeof grupoInstitucionalMembroFuncaoOptions)[number];
export type OrdenadorTipoVinculo =
  (typeof ordenadorTipoVinculoOptions)[number];

export type AtoDesignacaoSaveInput = z.infer<
  typeof atoDesignacaoSaveInputSchema
>;
export type GrupoInstitucionalSaveInput = z.infer<
  typeof grupoInstitucionalSaveInputSchema
>;
export type OrdenadorDespesaSaveInput = z.infer<
  typeof ordenadorDespesaSaveInputSchema
>;
export type DesignacoesSelectForLicitacaoInput = z.infer<
  typeof designacoesSelectForLicitacaoInputSchema
>;
