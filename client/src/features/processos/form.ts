import { processoCreateInputSchema } from "@sirel/shared/schemas/processos";
import { processoTipoObjetoOptions } from "@sirel/shared/const";
import { normalizeCurrencyInputBR } from "@/lib/formatters";

export interface ProcessoFormState {
  protocolo: string;
  dataEntradaLicitacao: string;
  numeroAdministrativo: string;
  numeroEdital: string;
  anoReferencia: string;
  secretariaId: string;
  modalidadeId: string;
  statusId: string;
  autoridadeCompetenteId: string;
  objeto: string;
  valorEstimado: string;
  escopoDisputa: string;
  criterioJulgamento: string;
  modoDisputa: string;
  tipoObjeto: string;
  tipoContratacao: string;
  dataAbertura: string;
  dataPublicacao: string;
  dataDisputaSessao: string;
  situacao: string;
  condutorProcessoId?: string;
  foraDoFluxo: boolean;
  moduloInicial: string;
}

type ProcessoTipoObjeto = (typeof processoTipoObjetoOptions)[number];

function toOptionalId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toOptionalNumber(value: string) {
  return normalizeCurrencyInputBR(value);
}

export function buildProcessoPayload(form: ProcessoFormState) {
  return {
    protocolo: form.protocolo.trim() || undefined,
    dataEntradaLicitacao: form.dataEntradaLicitacao || undefined,
    numeroAdministrativo: form.numeroAdministrativo.trim() || undefined,
    numeroEdital: form.numeroEdital.trim() || undefined,
    anoReferencia: Number(form.anoReferencia),
    secretariaId: Number(form.secretariaId),
    modalidadeId: toOptionalId(form.modalidadeId),
    statusId: toOptionalId(form.statusId),
    autoridadeCompetenteId: toOptionalId(form.autoridadeCompetenteId),
    objeto: form.objeto.trim(),
    valorEstimado: toOptionalNumber(form.valorEstimado),
    escopoDisputa: form.escopoDisputa as "ITEM" | "LOTE" | "GLOBAL",
    criterioJulgamento: form.criterioJulgamento.trim() || undefined,
    modoDisputa: form.modoDisputa as
      | "NAO_SE_APLICA"
      | "ABERTO"
      | "FECHADO"
      | "ABERTO_FECHADO"
      | "FECHADO_ABERTO",
    tipoObjeto: form.tipoObjeto as ProcessoTipoObjeto,
    tipoContratacao: form.tipoContratacao as
      | "AQUISICAO"
      | "REGISTRO_PRECO"
      | "AQUISICAO_PARCELADA",
    dataAbertura: form.dataAbertura || undefined,
    dataPublicacao: form.dataPublicacao || undefined,
    dataDisputaSessao: form.dataDisputaSessao || undefined,
    situacao: (form.situacao || undefined) as
      | "RASCUNHO"
      | "EM_ANDAMENTO"
      | "AGUARDANDO"
      | "CONCLUIDO"
      | "SUSPENSO"
      | undefined,
    condutorProcessoId: form.condutorProcessoId
      ? Number(form.condutorProcessoId)
      : undefined,
    foraDoFluxo: form.foraDoFluxo,
    moduloInicial: form.foraDoFluxo ? (form.moduloInicial as any) : undefined,
  };
}

export function validateProcessoForm(form: ProcessoFormState) {
  return processoCreateInputSchema.safeParse(buildProcessoPayload(form));
}
