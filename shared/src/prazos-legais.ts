export type ModalidadePrazoLegal =
  | "PREGAO_ELETRONICO"
  | "PREGAO_PRESENCIAL"
  | "CONCORRENCIA_MENOR_PRECO"
  | "CONCORRENCIA_TECNICA_PRECO"
  | "CONCORRENCIA_MELHOR_TECNICA"
  | "CONTRATACAO_INTEGRADA"
  | "CONTRATACAO_SEMI_INTEGRADA"
  | "CREDENCIAMENTO"
  | "DISPENSA_SIMPLIFICADA"
  | "DISPENSA_ELETRONICA"
  | "INEXIGIBILIDADE"
  | "LEILAO_ELETRONICO";

export type TipoObjetoPrazoLegal =
  | "BENS"
  | "SERVICOS_COMUNS"
  | "SERVICOS_ESPECIAIS"
  | "ENGENHARIA";

export interface RegraPrazoLegal {
  modalidade: ModalidadePrazoLegal;
  tipoObjeto?: TipoObjetoPrazoLegal;
  diasUteisMinimos: number;
  baseLegal: string;
  observacao?: string;
}

export interface ResolveRegraPrazoParams {
  modalidadeCodigo?: string | null;
  tipoObjeto?: string | null;
  criterioJulgamento?: string | null;
}

export interface CalculatePrazoLegalParams extends ResolveRegraPrazoParams {
  dataPublicacaoPNCP: Date;
  feriadosLocais?: Date[];
  acrescimoMunicipal?: number;
  publicarNoDou?: boolean | null;
  publicarEmJornal?: boolean | null;
}

export interface PrazoLegalCalculado {
  dataMinima: Date;
  dataInicioContagem: Date;
  regraAplicada: RegraPrazoLegal;
  diasUteisLegais: number;
  diasUteisTotais: number;
  acrescimoMunicipal: number;
  acrescimoCanais: number;
}

const JULGAMENTO_TECNICA_PRECO = ["TECNICA_PRECO", "TÉCNICA_PREÇO", "TECNICA E PRECO", "TÉCNICA E PREÇO"];
const JULGAMENTO_MELHOR_TECNICA = ["MELHOR_TECNICA", "MELHOR TÉCNICA"];

export const PRAZOS_ART_55: RegraPrazoLegal[] = [
  {
    modalidade: "PREGAO_ELETRONICO",
    tipoObjeto: "BENS",
    diasUteisMinimos: 8,
    baseLegal: "Art. 55, Lei 14.133/2021",
  },
  {
    modalidade: "PREGAO_ELETRONICO",
    tipoObjeto: "SERVICOS_COMUNS",
    diasUteisMinimos: 10,
    baseLegal: "Art. 55, Lei 14.133/2021",
  },
  {
    modalidade: "PREGAO_PRESENCIAL",
    tipoObjeto: "BENS",
    diasUteisMinimos: 8,
    baseLegal: "Art. 55, Lei 14.133/2021",
  },
  {
    modalidade: "PREGAO_PRESENCIAL",
    tipoObjeto: "SERVICOS_COMUNS",
    diasUteisMinimos: 10,
    baseLegal: "Art. 55, Lei 14.133/2021",
  },
  {
    modalidade: "CONCORRENCIA_MENOR_PRECO",
    tipoObjeto: "BENS",
    diasUteisMinimos: 10,
    baseLegal: "Art. 55, §1º, I, Lei 14.133/2021",
  },
  {
    modalidade: "CONCORRENCIA_MENOR_PRECO",
    tipoObjeto: "SERVICOS_COMUNS",
    diasUteisMinimos: 10,
    baseLegal: "Art. 55, §1º, I, Lei 14.133/2021",
  },
  {
    modalidade: "CONCORRENCIA_MENOR_PRECO",
    tipoObjeto: "SERVICOS_ESPECIAIS",
    diasUteisMinimos: 25,
    baseLegal: "Art. 55, §1º, II, Lei 14.133/2021",
    observacao: "Aplicado de forma conservadora para serviços em concorrência quando não houver classificação adicional no cadastro.",
  },
  {
    modalidade: "CONCORRENCIA_MENOR_PRECO",
    tipoObjeto: "ENGENHARIA",
    diasUteisMinimos: 25,
    baseLegal: "Art. 55, §1º, II, Lei 14.133/2021",
  },
  {
    modalidade: "CONCORRENCIA_TECNICA_PRECO",
    diasUteisMinimos: 35,
    baseLegal: "Art. 55, §2º, Lei 14.133/2021",
  },
  {
    modalidade: "CONCORRENCIA_MELHOR_TECNICA",
    diasUteisMinimos: 35,
    baseLegal: "Art. 55, §2º, Lei 14.133/2021",
  },
  {
    modalidade: "CONTRATACAO_INTEGRADA",
    diasUteisMinimos: 60,
    baseLegal: "Art. 55, §3º, Lei 14.133/2021",
  },
  {
    modalidade: "CONTRATACAO_SEMI_INTEGRADA",
    diasUteisMinimos: 35,
    baseLegal: "Art. 55, §4º, Lei 14.133/2021",
  },
  {
    modalidade: "CREDENCIAMENTO",
    diasUteisMinimos: 8,
    baseLegal: "Art. 55, §5º, Lei 14.133/2021",
  },
  {
    modalidade: "DISPENSA_SIMPLIFICADA",
    diasUteisMinimos: 1,
    baseLegal: "Art. 55, §6º, Lei 14.133/2021",
    observacao: "Prazo mínimo para dispensa simplificada ou emergencial.",
  },
  {
    modalidade: "DISPENSA_ELETRONICA",
    diasUteisMinimos: 3,
    baseLegal: "IN 67/2021 + Art. 55, Lei 14.133/2021",
  },
  {
    modalidade: "INEXIGIBILIDADE",
    diasUteisMinimos: 0,
    baseLegal: "Art. 74, Lei 14.133/2021",
    observacao: "Não há prazo mínimo de publicidade competitiva para apresentação de propostas.",
  },
  {
    modalidade: "LEILAO_ELETRONICO",
    diasUteisMinimos: 15,
    baseLegal: "Art. 55, Lei 14.133/2021",
    observacao: "Mantido o parâmetro operacional vigente do SIREL até haver detalhamento municipal específico.",
  },
] as const;

function normalizeUpper(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isBusinessDay(date: Date, feriadosLocais: Date[] = []) {
  return !isWeekend(date) && !feriadosLocais.some((feriado) => isSameDay(feriado, date));
}

export function getNextBusinessDay(date: Date, feriadosLocais: Date[] = []) {
  const cursor = startOfDay(date);
  do {
    cursor.setDate(cursor.getDate() + 1);
  } while (!isBusinessDay(cursor, feriadosLocais));
  return cursor;
}

export function addBusinessDays(date: Date, days: number, feriadosLocais: Date[] = []) {
  if (days <= 0) return startOfDay(date);

  const cursor = startOfDay(date);
  let remaining = days;

  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor, feriadosLocais)) {
      remaining -= 1;
    }
  }

  return cursor;
}

export function differenceInBusinessDays(laterDate: Date, earlierDate: Date, feriadosLocais: Date[] = []): number {
  const start = startOfDay(earlierDate);
  const end = startOfDay(laterDate);
  if (end.getTime() === start.getTime()) return 0;
  if (end.getTime() < start.getTime()) return -differenceInBusinessDays(start, end, feriadosLocais);

  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() < end.getTime()) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor, feriadosLocais)) {
      count += 1;
    }
  }
  return count;
}

function normalizeModalidadePrazo({ modalidadeCodigo, criterioJulgamento }: ResolveRegraPrazoParams): ModalidadePrazoLegal {
  const modalidade = normalizeUpper(modalidadeCodigo);
  const criterio = normalizeUpper(criterioJulgamento);

  if (modalidade.includes("PREGAO") && modalidade.includes("PRESENCIAL")) return "PREGAO_PRESENCIAL";
  if (modalidade.includes("PREGAO")) return "PREGAO_ELETRONICO";
  if (modalidade.includes("CONTRATACAO") && modalidade.includes("SEMI")) return "CONTRATACAO_SEMI_INTEGRADA";
  if (modalidade.includes("CONTRATACAO") && modalidade.includes("INTEGRADA")) return "CONTRATACAO_INTEGRADA";
  if (modalidade.includes("CONCORRENCIA")) {
    if (JULGAMENTO_TECNICA_PRECO.includes(criterio)) return "CONCORRENCIA_TECNICA_PRECO";
    if (JULGAMENTO_MELHOR_TECNICA.includes(criterio)) return "CONCORRENCIA_MELHOR_TECNICA";
    return "CONCORRENCIA_MENOR_PRECO";
  }
  if (modalidade.includes("CREDENCIAMENTO")) return "CREDENCIAMENTO";
  if (modalidade.includes("DISPENSA") && modalidade.includes("ELETR")) return "DISPENSA_ELETRONICA";
  if (modalidade.includes("DISPENSA")) return "DISPENSA_SIMPLIFICADA";
  if (modalidade.includes("INEXIG")) return "INEXIGIBILIDADE";
  if (modalidade.includes("LEILAO")) return "LEILAO_ELETRONICO";

  return "PREGAO_ELETRONICO";
}

function mapTipoObjetoPrazo(params: ResolveRegraPrazoParams, modalidade: ModalidadePrazoLegal): TipoObjetoPrazoLegal | undefined {
  const tipoObjeto = normalizeUpper(params.tipoObjeto);

  if (modalidade === "CONCORRENCIA_TECNICA_PRECO" || modalidade === "CONCORRENCIA_MELHOR_TECNICA") {
    return undefined;
  }

  if (tipoObjeto === "OBRA" || tipoObjeto === "SERVICO_ENG") {
    return "ENGENHARIA";
  }

  if (tipoObjeto === "PRODUTO") {
    return "BENS";
  }

  if (tipoObjeto === "SERVICO") {
    if (modalidade === "PREGAO_ELETRONICO" || modalidade === "PREGAO_PRESENCIAL") {
      return "SERVICOS_COMUNS";
    }
    if (modalidade === "CONCORRENCIA_MENOR_PRECO") {
      return "SERVICOS_ESPECIAIS";
    }
    return "SERVICOS_COMUNS";
  }

  if (modalidade === "PREGAO_ELETRONICO" || modalidade === "PREGAO_PRESENCIAL") {
    return "BENS";
  }

  return undefined;
}

export function identificarRegraPrazoLegal(params: ResolveRegraPrazoParams): RegraPrazoLegal {
  const modalidade = normalizeModalidadePrazo(params);
  const tipoObjeto = mapTipoObjetoPrazo(params, modalidade);

  const regraComTipo = PRAZOS_ART_55.find((item) => item.modalidade === modalidade && item.tipoObjeto === tipoObjeto);
  if (regraComTipo) return regraComTipo;

  const regraSemTipo = PRAZOS_ART_55.find((item) => item.modalidade === modalidade && item.tipoObjeto === undefined);
  if (regraSemTipo) return regraSemTipo;

  const regraFallback = PRAZOS_ART_55.find((item) => item.modalidade === modalidade);
  if (regraFallback) return regraFallback;

  return PRAZOS_ART_55[0];
}

export function calcularPrazoLegalMinimo(params: CalculatePrazoLegalParams): PrazoLegalCalculado {
  const regraAplicada = identificarRegraPrazoLegal(params);
  const diasUteisLegais = regraAplicada.diasUteisMinimos;
  const acrescimoMunicipal = Math.max(Number(params.acrescimoMunicipal ?? 0), 0);
  const acrescimoCanais = params.publicarNoDou || params.publicarEmJornal ? 1 : 0;
  const diasUteisTotais = diasUteisLegais + acrescimoMunicipal + acrescimoCanais;
  const publicacao = startOfDay(params.dataPublicacaoPNCP);

  if (diasUteisTotais <= 0) {
    return {
      dataMinima: publicacao,
      dataInicioContagem: publicacao,
      regraAplicada,
      diasUteisLegais,
      diasUteisTotais,
      acrescimoMunicipal,
      acrescimoCanais,
    };
  }

  const dataInicioContagem = getNextBusinessDay(publicacao, params.feriadosLocais);
  const dataMinima = addBusinessDays(dataInicioContagem, diasUteisTotais - 1, params.feriadosLocais);

  return {
    dataMinima,
    dataInicioContagem,
    regraAplicada,
    diasUteisLegais,
    diasUteisTotais,
    acrescimoMunicipal,
    acrescimoCanais,
  };
}
