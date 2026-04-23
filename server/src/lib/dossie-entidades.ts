import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";

import type {
  DossieAuditChange,
  DossieFornecedorDetail,
  DossieFornecedorDetailInput,
  DossieFilterOption,
  DossieInsight,
  DossieItemDetail,
  DossieItemDetailInput,
  DossieMultiSeriePoint,
  DossieScatterPoint,
  DossieSerieTemporalPoint,
  DossieStatusOption,
  DossieTimelineEvent,
} from "@sirel/shared/schemas/dossie";

import { requireDb } from "../db/client.js";
import {
  auditoriaLog,
  catalogoItens,
  contratoItens,
  contratos,
  contratosPncp,
  cotacoes,
  fornecedores,
  itensProcesso,
  itensProcessoValores,
  lancesLicitacao,
  licitacoes,
  licitantes,
  lotes,
  modalidades,
  processos,
  propostasLicitacao,
  secretarias,
  statusProcesso,
  users,
  workflowProcesso,
} from "../db/schema.js";
import {
  buildResultadoItemStatus,
  hasAwardedResult,
} from "./dossie-autonomia.js";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateValue(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeDocumentKey(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw || /^AUTO_/i.test(raw)) return "";
  const digits = normalizeDigits(raw);
  return digits.length === 11 || digits.length === 14 ? digits : "";
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const supplierNameNoiseTokens = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "empresa",
  "epp",
  "eireli",
  "ltda",
  "ltda.",
  "me",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "por",
  "sa",
  "s.a",
  "s/a",
  "sem",
  "sociedade",
  "uma",
  "um",
]);

function tokenizeSupplierName(value: string | null | undefined) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !supplierNameNoiseTokens.has(token));
}

function tokenIntersectionCount(leftTokens: string[], rightTokens: string[]) {
  if (!leftTokens.length || !rightTokens.length) return 0;
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let total = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) total += 1;
  }
  return total;
}

function tokenSimilarity(leftTokens: string[], rightTokens: string[]) {
  if (!leftTokens.length || !rightTokens.length) return 0;
  const intersection = tokenIntersectionCount(leftTokens, rightTokens);
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function supplierNamesLikelySame(
  leftName: string | null | undefined,
  rightName: string | null | undefined,
) {
  const leftNormalized = normalizeText(leftName);
  const rightNormalized = normalizeText(rightName);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;
  if (
    leftNormalized.includes(rightNormalized) ||
    rightNormalized.includes(leftNormalized)
  ) {
    return true;
  }

  const leftTokens = tokenizeSupplierName(leftName);
  const rightTokens = tokenizeSupplierName(rightName);
  const similarity = tokenSimilarity(leftTokens, rightTokens);
  const sharedTokens = tokenIntersectionCount(leftTokens, rightTokens);
  const leftAnchors = leftTokens.slice(0, 2);
  const rightAnchors = rightTokens.slice(0, 2);
  const sharedAnchor =
    leftAnchors.some((token) => rightTokens.includes(token)) ||
    rightAnchors.some((token) => leftTokens.includes(token));
  const sharedLongToken = leftTokens.some(
    (token) => token.length >= 5 && rightTokens.includes(token),
  );

  if (similarity >= 0.8) return true;
  if (sharedAnchor && sharedLongToken && sharedTokens >= 3 && similarity >= 0.5) {
    return true;
  }
  if (sharedLongToken && sharedTokens >= 4 && similarity >= 0.56) {
    return true;
  }
  return false;
}

function buildSupplierLookupTokens(value: string | null | undefined) {
  const tokens = tokenizeSupplierName(value).filter((token) => token.length >= 4);
  const longest = [...tokens].sort((left, right) => right.length - left.length);
  return Array.from(
    new Set([tokens[0], longest[0], tokens[1]].filter(Boolean) as string[]),
  ).slice(0, 2);
}

function buildMonthKey(value: string | null | undefined) {
  if (!value) return null;
  const base = new Date(value);
  if (Number.isNaN(base.getTime())) return null;
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthLabel(key: string) {
  const [year, month] = key.split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildYearKey(value: string | null | undefined) {
  if (!value) return null;
  const base = new Date(value);
  if (Number.isNaN(base.getTime())) return null;
  return String(base.getUTCFullYear());
}

function buildDateTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const base = new Date(value);
  if (Number.isNaN(base.getTime())) return null;
  return base.getTime();
}

function compareNullableDatesDesc(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const leftTime = buildDateTimestamp(left) ?? 0;
  const rightTime = buildDateTimestamp(right) ?? 0;
  return rightTime - leftTime;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentage(part: number, total: number) {
  if (!total) return null;
  return (part / total) * 100;
}

function distinctCount(values: Array<number | string | null | undefined>) {
  return new Set(
    values.filter((value) => value !== null && value !== undefined),
  ).size;
}

function pushInsight(list: DossieInsight[], insight: DossieInsight | null) {
  if (insight) {
    list.push(insight);
  }
}

function mapAuditChanges(
  rows: Array<{
    id: number;
    acao: "CREATE" | "UPDATE" | "DELETE";
    descricao: string | null;
    dadosAnteriores: Record<string, unknown> | null;
    dadosNovos: Record<string, unknown> | null;
    criadoEm: Date | string | null;
    usuario: string | null;
  }>,
): DossieAuditChange[] {
  return rows.map((row) => {
    const previous = row.dadosAnteriores ?? {};
    const next = row.dadosNovos ?? {};
    const changedFields = Array.from(
      new Set([...Object.keys(previous), ...Object.keys(next)]),
    ).filter(
      (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
    );

    return {
      id: row.id,
      acao: row.acao,
      descricao: row.descricao,
      usuario: row.usuario,
      criadoEm: toDateValue(row.criadoEm),
      camposAlterados: changedFields,
    };
  });
}

function buildStatusLabel(row: {
  itemHomologado?: boolean | null;
  itemDeserto?: boolean | null;
  itemFracassado?: boolean | null;
  fornecedorVencedorId?: number | null;
  fornecedorVencedorNome?: string | null;
  fornecedorVencedorCnpj?: string | null;
  licitacaoStatus?: string | null;
}) {
  if (row.itemHomologado) return "Homologado";
  if (row.itemFracassado) return "Fracassado";
  if (row.itemDeserto) return "Deserto";
  if (row.licitacaoStatus) return row.licitacaoStatus;
  return "Em análise";
}

function buildStatusLabelEnhanced(row: {
  itemHomologado?: boolean | null;
  itemDeserto?: boolean | null;
  itemFracassado?: boolean | null;
  fornecedorVencedorId?: number | null;
  fornecedorVencedorNome?: string | null;
  fornecedorVencedorCnpj?: string | null;
  licitacaoStatus?: string | null;
}) {
  const status = buildResultadoItemStatus(
    {
      itemHomologado: row.itemHomologado,
      itemDeserto: row.itemDeserto,
      itemFracassado: row.itemFracassado,
      fornecedorVencedorId: row.fornecedorVencedorId,
      fornecedorVencedorNome: row.fornecedorVencedorNome,
      fornecedorVencedorCnpj: row.fornecedorVencedorCnpj,
    },
    "EM ANALISE",
  );

  if (status !== "EM ANALISE") {
    return status[0] + status.slice(1).toLowerCase();
  }
  if (row.licitacaoStatus) return row.licitacaoStatus;
  return "Em analise";
}

function statusMatches(
  filter: string | undefined,
  values: Array<string | null | undefined>,
) {
  if (!filter) return true;
  const normalizedFilter = normalizeText(filter);
  return values.some((value) =>
    normalizeText(value).includes(normalizedFilter),
  );
}

function dateInRange(
  value: string | null | undefined,
  start: string | undefined,
  end: string | undefined,
) {
  if (!value) return !start && !end;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (start) {
    const startDate = new Date(`${start}T00:00:00`);
    if (date < startDate) return false;
  }
  if (end) {
    const endDate = new Date(`${end}T23:59:59`);
    if (date > endDate) return false;
  }
  return true;
}

function buildSeriesPoints(entries: Map<string, number>): DossieSerieTemporalPoint[] {
  return Array.from(entries.entries())
    .sort((left, right) => left[0].localeCompare(right[0], "pt-BR"))
    .map(([key, value]) => ({
      chave: key,
      label: key,
      valor: Number(value.toFixed(2)),
    }));
}

function buildMonthlySeries(entries: Map<string, number>): DossieSerieTemporalPoint[] {
  return Array.from(entries.entries())
    .sort((left, right) => left[0].localeCompare(right[0], "pt-BR"))
    .map(([key, value]) => ({
      chave: key,
      label: buildMonthLabel(key),
      valor: Number(value.toFixed(2)),
    }));
}

function topSeries(
  rows: Array<{ label: string; value: number }>,
  limit = 10,
): DossieSerieTemporalPoint[] {
  return rows
    .sort(
      (left, right) =>
        right.value - left.value ||
        left.label.localeCompare(right.label, "pt-BR"),
    )
    .slice(0, limit)
    .map((row) => ({
      chave: row.label,
      label: row.label,
      valor: Number(row.value.toFixed(2)),
    }));
}

function itemCodeFromId(id: number) {
  return `ITM-${new Date().getFullYear()}-${String(id).padStart(5, "0")}`;
}

function pncpSyntheticContractId(id: number) {
  return 900000000 + id;
}

export async function buildItemDossieDetail(
  input: DossieItemDetailInput,
): Promise<DossieItemDetail> {
  const db = requireDb();
  const filters = input.filters ?? {};

  const [item] = await db
    .select({
      id: catalogoItens.id,
      descricao: catalogoItens.descricao,
      unidadePadrao: catalogoItens.unidadePadrao,
      valorReferencia: catalogoItens.valorReferencia,
      ativo: catalogoItens.ativo,
      criadoEm: catalogoItens.criadoEm,
      atualizadoEm: catalogoItens.atualizadoEm,
    })
    .from(catalogoItens)
    .where(eq(catalogoItens.id, input.itemId))
    .limit(1);

  if (!item) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Item não encontrado para gerar o dossiê.",
    });
  }

  const [processRows, quoteRows, proposalRows, contractRows] = await Promise.all([
    db
      .select({
        itemProcessoId: itensProcesso.id,
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroAdministrativo: processos.numeroAdministrativo,
        numeroEdital: processos.numeroEdital,
        objetoProcesso: processos.objeto,
        dataEntradaLicitacao: processos.dataEntradaLicitacao,
        dataAbertura: processos.dataAbertura,
        secretariaId: secretarias.id,
        secretaria: secretarias.nome,
        modalidadeId: modalidades.id,
        modalidade: modalidades.nome,
        criterioJulgamento: processos.criterioJulgamento,
        statusProcesso: statusProcesso.nome,
        etapaAtual: workflowProcesso.etapaAtual,
        loteNumero: lotes.numeroLote,
        numeroItem: itensProcesso.numeroItem,
        descricaoItem: itensProcesso.descricao,
        quantidade: itensProcesso.quantidade,
        unidade: itensProcesso.unidade,
        valorUnitarioEstimadoBase: itensProcesso.valorUnitarioEstimado,
        valorTotalEstimadoBase: itensProcesso.valorTotalEstimado,
        valorEstimadoUnitario: itensProcessoValores.valorEstimadoUnitario,
        valorEstimadoTotal: itensProcessoValores.valorEstimadoTotal,
        valorLanceVencedorUnitario: itensProcessoValores.valorLanceVencedorUnitario,
        valorLanceVencedorTotal: itensProcessoValores.valorLanceVencedorTotal,
        economiaObtida: itensProcessoValores.economiaObtida,
        percentualDesconto: itensProcessoValores.percentualDesconto,
        fornecedorVencedorId: itensProcessoValores.fornecedorVencedorId,
        fornecedorVencedorNome: itensProcessoValores.fornecedorVencedorNome,
        fornecedorVencedorCnpj: itensProcessoValores.fornecedorVencedorCnpj,
        itemHomologado: itensProcessoValores.itemHomologado,
        itemDeserto: itensProcessoValores.itemDeserto,
        itemFracassado: itensProcessoValores.itemFracassado,
        dataHomologacaoItem: itensProcessoValores.dataHomologacao,
        licitacaoStatus: licitacoes.statusLicitacao,
        dataJulgamento: licitacoes.dataJulgamento,
        dataHomologacaoLicitacao: licitacoes.dataHomologacao,
      })
      .from(itensProcesso)
      .innerJoin(processos, eq(processos.id, itensProcesso.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(statusProcesso, eq(statusProcesso.id, processos.statusId))
      .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
      .leftJoin(lotes, eq(lotes.id, itensProcesso.loteId))
      .leftJoin(
        itensProcessoValores,
        eq(itensProcessoValores.itemProcessoId, itensProcesso.id),
      )
      .leftJoin(licitacoes, eq(licitacoes.processoId, processos.id))
      .where(eq(itensProcesso.catalogoItemId, input.itemId))
      .orderBy(desc(processos.atualizadoEm), desc(itensProcesso.id)),
    db
      .select({
        cotacaoId: cotacoes.id,
        itemProcessoId: itensProcesso.id,
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroEdital: processos.numeroEdital,
        secretariaId: secretarias.id,
        secretaria: secretarias.nome,
        modalidadeId: modalidades.id,
        modalidade: modalidades.nome,
        fornecedorId: fornecedores.id,
        fornecedorNome: fornecedores.razaoSocial,
        documento: fornecedores.cnpj,
        valorUnitario: cotacoes.valorUnitario,
        valorTotal: cotacoes.valorTotal,
        dataCotacao: cotacoes.dataCotacao,
        status: cotacoes.status,
      })
      .from(cotacoes)
      .innerJoin(itensProcesso, eq(itensProcesso.id, cotacoes.itemId))
      .innerJoin(processos, eq(processos.id, cotacoes.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .innerJoin(fornecedores, eq(fornecedores.id, cotacoes.fornecedorId))
      .where(eq(itensProcesso.catalogoItemId, input.itemId))
      .orderBy(desc(cotacoes.dataCotacao), desc(cotacoes.id)),
    db
      .select({
        propostaId: propostasLicitacao.id,
        licitanteId: licitantes.id,
        licitacaoId: licitantes.licitacaoId,
        itemProcessoId: itensProcesso.id,
        processoId: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroEdital: processos.numeroEdital,
        secretariaId: secretarias.id,
        secretaria: secretarias.nome,
        modalidadeId: modalidades.id,
        modalidade: modalidades.nome,
        loteNumero: lotes.numeroLote,
        fornecedorId: fornecedores.id,
        fornecedorNome: fornecedores.razaoSocial,
        documento: fornecedores.cnpj,
        valorUnitarioProposto: propostasLicitacao.valorUnitarioProposto,
        valorTotalProposto: propostasLicitacao.valorTotalProposto,
        dataProposta: propostasLicitacao.dataProposta,
        classificacao: propostasLicitacao.classificacao,
        situacao: propostasLicitacao.situacao,
        statusHabilitacao: licitantes.statusHabilitacao,
        valorEstimadoUnitario: itensProcessoValores.valorEstimadoUnitario,
        valorEstimadoBase: itensProcesso.valorUnitarioEstimado,
      })
      .from(propostasLicitacao)
      .innerJoin(licitantes, eq(licitantes.id, propostasLicitacao.licitanteId))
      .innerJoin(fornecedores, eq(fornecedores.id, licitantes.fornecedorId))
      .innerJoin(itensProcesso, eq(itensProcesso.id, propostasLicitacao.itemId))
      .innerJoin(processos, eq(processos.id, itensProcesso.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(lotes, eq(lotes.id, itensProcesso.loteId))
      .leftJoin(
        itensProcessoValores,
        eq(itensProcessoValores.itemProcessoId, itensProcesso.id),
      )
      .where(eq(itensProcesso.catalogoItemId, input.itemId))
      .orderBy(desc(propostasLicitacao.dataProposta), desc(propostasLicitacao.id)),
    db
      .select({
        contratoId: contratos.id,
        contratoItemId: contratoItens.id,
        numeroContrato: contratos.numeroContrato,
        processoId: processos.id,
        processoNumeroSirel: processos.numeroSirel,
        processoNumeroAdministrativo: processos.numeroAdministrativo,
        secretariaId: secretarias.id,
        secretaria: secretarias.nome,
        modalidadeId: modalidades.id,
        modalidade: modalidades.nome,
        fornecedorId: fornecedores.id,
        fornecedorNome: fornecedores.razaoSocial,
        documento: fornecedores.cnpj,
        quantidadeContratada: contratoItens.quantidadeContratada,
        quantidadeConsumida: contratoItens.quantidadeConsumida,
        valorUnitario: contratoItens.valorUnitario,
        vigenciaInicio: contratos.dataVigenciaInicio,
        vigenciaFim: contratos.dataVigenciaFim,
        dataAssinatura: contratos.dataAssinatura,
        status: contratos.status,
      })
      .from(contratoItens)
      .innerJoin(contratos, eq(contratos.id, contratoItens.contratoId))
      .innerJoin(processos, eq(processos.id, contratos.processoId))
      .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
      .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
      .leftJoin(fornecedores, eq(fornecedores.id, contratos.fornecedorId))
      .where(eq(contratoItens.catalogoItemId, input.itemId))
      .orderBy(desc(contratos.dataAssinatura), desc(contratos.id)),
  ]);

  const proposalIds = proposalRows.map((row) => row.propostaId);
  const lanceRows = proposalIds.length
    ? await db
        .select({
          propostaId: lancesLicitacao.propostaId,
          valorLance: lancesLicitacao.valorLance,
          dataLance: lancesLicitacao.dataLance,
        })
        .from(lancesLicitacao)
        .where(inArray(lancesLicitacao.propostaId, proposalIds))
        .orderBy(desc(lancesLicitacao.dataLance), desc(lancesLicitacao.id))
    : [];

  const finalBidByProposal = new Map<
    number,
    { value: number | null; date: string | null }
  >();
  for (const row of proposalRows) {
    finalBidByProposal.set(row.propostaId, {
      value: toNumberOrNull(row.valorUnitarioProposto),
      date: toDateValue(row.dataProposta),
    });
  }
  for (const row of lanceRows) {
    const current = finalBidByProposal.get(row.propostaId);
    const nextValue = toNumberOrNull(row.valorLance);
    if (
      nextValue !== null &&
      (!current || current.value === null || nextValue <= current.value)
    ) {
      finalBidByProposal.set(row.propostaId, {
        value: nextValue,
        date: toDateValue(row.dataLance),
      });
    }
  }

  const supplierScopedItemProcessIds = new Set<number>();
  const supplierScopedProcessIds = new Set<number>();
  if (filters.fornecedorId) {
    for (const row of processRows) {
      if (row.fornecedorVencedorId === filters.fornecedorId) {
        supplierScopedItemProcessIds.add(row.itemProcessoId);
        supplierScopedProcessIds.add(row.processoId);
      }
    }
    for (const row of quoteRows) {
      if (row.fornecedorId === filters.fornecedorId) {
        supplierScopedItemProcessIds.add(row.itemProcessoId);
        supplierScopedProcessIds.add(row.processoId);
      }
    }
    for (const row of proposalRows) {
      if (row.fornecedorId === filters.fornecedorId) {
        supplierScopedItemProcessIds.add(row.itemProcessoId);
        supplierScopedProcessIds.add(row.processoId);
      }
    }
    for (const row of contractRows) {
      if (row.fornecedorId === filters.fornecedorId) {
        supplierScopedProcessIds.add(row.processoId);
      }
    }
  }

  const contractProcessIds = filters.contratoId
    ? new Set(
        contractRows
          .filter((row) => row.contratoId === filters.contratoId)
          .map((row) => row.processoId),
      )
    : null;

  const proposalRowsFiltered = proposalRows.filter((row) => {
    const referenceDate =
      finalBidByProposal.get(row.propostaId)?.date ?? toDateValue(row.dataProposta);
    if (!dateInRange(referenceDate, filters.periodoInicio, filters.periodoFim)) {
      return false;
    }
    if (filters.modalidadeId && row.modalidadeId !== filters.modalidadeId) return false;
    if (filters.secretariaId && row.secretariaId !== filters.secretariaId) return false;
    if (filters.processoId && row.processoId !== filters.processoId) return false;
    if (filters.fornecedorId && row.fornecedorId !== filters.fornecedorId) return false;
    if (contractProcessIds && !contractProcessIds.has(row.processoId)) return false;
    if (!statusMatches(filters.status, [row.situacao, row.statusHabilitacao])) {
      return false;
    }
    return true;
  });

  const quoteRowsFiltered = quoteRows.filter((row) => {
    if (!dateInRange(toDateValue(row.dataCotacao), filters.periodoInicio, filters.periodoFim)) {
      return false;
    }
    if (filters.modalidadeId && row.modalidadeId !== filters.modalidadeId) return false;
    if (filters.secretariaId && row.secretariaId !== filters.secretariaId) return false;
    if (filters.processoId && row.processoId !== filters.processoId) return false;
    if (filters.fornecedorId && row.fornecedorId !== filters.fornecedorId) return false;
    if (contractProcessIds && !contractProcessIds.has(row.processoId)) return false;
    if (!statusMatches(filters.status, [row.status])) return false;
    return true;
  });

  const contractRowsFiltered = contractRows.filter((row) => {
    const referenceDate = toDateValue(row.dataAssinatura) ?? toDateValue(row.vigenciaInicio);
    if (!dateInRange(referenceDate, filters.periodoInicio, filters.periodoFim)) {
      return false;
    }
    if (filters.modalidadeId && row.modalidadeId !== filters.modalidadeId) return false;
    if (filters.secretariaId && row.secretariaId !== filters.secretariaId) return false;
    if (filters.processoId && row.processoId !== filters.processoId) return false;
    if (filters.contratoId && row.contratoId !== filters.contratoId) return false;
    if (filters.fornecedorId && row.fornecedorId !== filters.fornecedorId) return false;
    if (!statusMatches(filters.status, [row.status])) return false;
    return true;
  });

  const processRowsFiltered = processRows.filter((row) => {
    const referenceDate =
      toDateValue(row.dataHomologacaoItem) ??
      toDateValue(row.dataHomologacaoLicitacao) ??
      toDateValue(row.dataJulgamento) ??
      toDateValue(row.dataAbertura) ??
      toDateValue(row.dataEntradaLicitacao);
    if (!dateInRange(referenceDate, filters.periodoInicio, filters.periodoFim)) {
      return false;
    }
    if (filters.modalidadeId && row.modalidadeId !== filters.modalidadeId) return false;
    if (filters.secretariaId && row.secretariaId !== filters.secretariaId) return false;
    if (filters.processoId && row.processoId !== filters.processoId) return false;
    if (contractProcessIds && !contractProcessIds.has(row.processoId)) return false;
    if (
      filters.fornecedorId &&
      !supplierScopedItemProcessIds.has(row.itemProcessoId) &&
      !supplierScopedProcessIds.has(row.processoId)
    ) {
      return false;
    }
    if (
      !statusMatches(filters.status, [
        row.statusProcesso,
        row.etapaAtual,
        row.licitacaoStatus,
        buildStatusLabelEnhanced(row),
      ])
    ) {
      return false;
    }
    return true;
  });

  const proposalsByItemProcessId = new Map<number, typeof proposalRowsFiltered>();
  for (const row of proposalRowsFiltered) {
    const existing = proposalsByItemProcessId.get(row.itemProcessoId) ?? [];
    existing.push(row);
    proposalsByItemProcessId.set(row.itemProcessoId, existing);
  }

  const processosRows = processRowsFiltered.map((row) => ({
    itemProcessoId: row.itemProcessoId,
    processoId: row.processoId,
    numeroSirel: row.numeroSirel,
    numeroAdministrativo: row.numeroAdministrativo,
    objetoProcesso: row.objetoProcesso,
    secretariaId: row.secretariaId,
    secretaria: row.secretaria,
    modalidadeId: row.modalidadeId,
    modalidade: row.modalidade,
    status: row.statusProcesso,
    etapaAtual: row.etapaAtual,
    dataReferencia:
      toDateValue(row.dataHomologacaoItem) ??
      toDateValue(row.dataHomologacaoLicitacao) ??
      toDateValue(row.dataJulgamento) ??
      toDateValue(row.dataAbertura) ??
      toDateValue(row.dataEntradaLicitacao),
    quantidadePrevista: toNumber(row.quantidade),
    unidade: row.unidade,
    valorEstimado:
      toNumberOrNull(row.valorEstimadoTotal) ??
      toNumberOrNull(row.valorTotalEstimadoBase),
    valorHomologado: toNumberOrNull(row.valorLanceVencedorTotal),
  }));

  const licitacoesRows = processRowsFiltered.map((row) => {
    const relatedProposals = proposalsByItemProcessId.get(row.itemProcessoId) ?? [];
    const bestProposalValue = relatedProposals.length
      ? Math.min(
          ...relatedProposals.map(
            (proposal) =>
              finalBidByProposal.get(proposal.propostaId)?.value ??
              toNumber(proposal.valorUnitarioProposto),
          ),
        )
      : null;
    const estimatedUnit =
      toNumberOrNull(row.valorEstimadoUnitario) ??
      toNumberOrNull(row.valorUnitarioEstimadoBase);
    const winnerUnit = hasAwardedResult(row)
      ? toNumberOrNull(row.valorLanceVencedorUnitario)
      : null;
    const economyAbsolute =
      estimatedUnit !== null && winnerUnit !== null ? estimatedUnit - winnerUnit : null;
    const economyPercentual =
      estimatedUnit !== null && winnerUnit !== null && estimatedUnit > 0
        ? ((estimatedUnit - winnerUnit) / estimatedUnit) * 100
        : null;

    return {
      itemProcessoId: row.itemProcessoId,
      processoId: row.processoId,
      numeroSirel: row.numeroSirel,
      edital: row.numeroEdital,
      modalidadeId: row.modalidadeId,
      modalidade: row.modalidade,
      criterioJulgamento: row.criterioJulgamento,
      loteNumero: row.loteNumero,
      itemNumero: row.numeroItem,
      quantidadeLicitada: toNumber(row.quantidade),
      unidade: row.unidade,
      valorEstimadoUnitario: estimatedUnit,
      melhorValorOfertado:
        bestProposalValue ?? winnerUnit ?? toNumberOrNull(row.valorLanceVencedorUnitario),
      fornecedorVencedorId: row.fornecedorVencedorId,
      fornecedorVencedor: row.fornecedorVencedorNome,
      valorVencedor: winnerUnit,
      economiaAbsoluta:
        economyAbsolute === null ? null : Number(economyAbsolute.toFixed(2)),
      economiaPercentual:
        economyPercentual === null ? null : Number(economyPercentual.toFixed(2)),
      statusItem: buildStatusLabelEnhanced(row),
      dataResultado:
        toDateValue(row.dataHomologacaoItem) ??
        toDateValue(row.dataHomologacaoLicitacao) ??
        toDateValue(row.dataJulgamento),
    };
  });

  const contratosRows = contractRowsFiltered.map((row) => {
    const quantidadeContratada = toNumber(row.quantidadeContratada);
    const quantidadeConsumida = toNumber(row.quantidadeConsumida);
    const saldoRemanescente = Math.max(0, quantidadeContratada - quantidadeConsumida);
    const valorUnitario = toNumberOrNull(row.valorUnitario);
    return {
      contratoId: row.contratoId,
      numeroContrato: row.numeroContrato,
      fornecedorId: row.fornecedorId,
      fornecedorNome: row.fornecedorNome ?? "Fornecedor não informado",
      processoId: row.processoId,
      processoNumeroSirel: row.processoNumeroSirel,
      quantidadeContratada,
      quantidadeConsumida,
      saldoRemanescente: Number(saldoRemanescente.toFixed(3)),
      valorUnitario,
      valorTotalItem:
        valorUnitario !== null
          ? Number((valorUnitario * quantidadeContratada).toFixed(2))
          : null,
      vigenciaInicio: toDateValue(row.vigenciaInicio),
      vigenciaFim: toDateValue(row.vigenciaFim),
      status: row.status,
    };
  });

  const supplierMap = new Map<
    string,
    {
      fornecedorId: number | null;
      fornecedorNome: string;
      documento: string | null;
      participationKeys: Set<string>;
      vitoriaKeys: Set<string>;
      offeredValues: number[];
      offeredTimeline: Array<{ value: number; date: string | null }>;
      winnerTimeline: Array<{ value: number; date: string | null }>;
      origins: Map<string, number>;
    }
  >();

  const ensureSupplierEntry = (
    fornecedorId: number | null,
    fornecedorNome: string | null | undefined,
    documento: string | null | undefined,
  ) => {
    const key =
      fornecedorId !== null && fornecedorId !== undefined
        ? `id:${fornecedorId}`
        : `${normalizeDigits(documento)}|${normalizeText(fornecedorNome)}`;
    const existing = supplierMap.get(key);
    if (existing) return existing;
    const created = {
      fornecedorId: fornecedorId ?? null,
      fornecedorNome: fornecedorNome?.trim() || "Fornecedor não identificado",
      documento: documento ?? null,
      participationKeys: new Set<string>(),
      vitoriaKeys: new Set<string>(),
      offeredValues: [] as number[],
      offeredTimeline: [] as Array<{ value: number; date: string | null }>,
      winnerTimeline: [] as Array<{ value: number; date: string | null }>,
      origins: new Map<string, number>(),
    };
    supplierMap.set(key, created);
    return created;
  };

  for (const row of quoteRowsFiltered) {
    const entry = ensureSupplierEntry(row.fornecedorId, row.fornecedorNome, row.documento);
    entry.participationKeys.add(`Q-${row.itemProcessoId}-${row.processoId}`);
    entry.origins.set("Cotação", (entry.origins.get("Cotação") ?? 0) + 1);
    const value = toNumberOrNull(row.valorUnitario);
    if (value !== null) {
      entry.offeredValues.push(value);
      entry.offeredTimeline.push({ value, date: toDateValue(row.dataCotacao) });
    }
  }

  for (const row of proposalRowsFiltered) {
    const entry = ensureSupplierEntry(row.fornecedorId, row.fornecedorNome, row.documento);
    entry.participationKeys.add(`P-${row.itemProcessoId}-${row.processoId}`);
    entry.origins.set("Licitação", (entry.origins.get("Licitação") ?? 0) + 1);
    const value =
      finalBidByProposal.get(row.propostaId)?.value ??
      toNumberOrNull(row.valorUnitarioProposto);
    if (value !== null) {
      entry.offeredValues.push(value);
      entry.offeredTimeline.push({
        value,
        date: finalBidByProposal.get(row.propostaId)?.date ?? toDateValue(row.dataProposta),
      });
    }
  }

  for (const row of licitacoesRows) {
    if (!row.fornecedorVencedor && !row.fornecedorVencedorId) continue;
    const sourceRow = processRowsFiltered.find(
      (candidate) => candidate.itemProcessoId === row.itemProcessoId,
    );
    const entry = ensureSupplierEntry(
      row.fornecedorVencedorId,
      row.fornecedorVencedor,
      sourceRow?.fornecedorVencedorCnpj,
    );
    entry.vitoriaKeys.add(`V-${row.itemProcessoId}-${row.processoId}`);
    entry.origins.set("Vitória", (entry.origins.get("Vitória") ?? 0) + 1);
    if (row.valorVencedor !== null) {
      entry.winnerTimeline.push({ value: row.valorVencedor, date: row.dataResultado });
      if (!entry.offeredValues.length) {
        entry.offeredValues.push(row.valorVencedor);
      }
    }
  }

  const fornecedoresRows = Array.from(supplierMap.values())
    .map((row) => {
      const lastOffer = row.offeredTimeline.sort((left, right) =>
        compareNullableDatesDesc(left.date, right.date),
      )[0];
      const lastWinner = row.winnerTimeline.sort((left, right) =>
        compareNullableDatesDesc(left.date, right.date),
      )[0];
      const originPrincipal =
        Array.from(row.origins.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ??
        "Relacionamento";

      return {
        fornecedorId: row.fornecedorId,
        fornecedorNome: row.fornecedorNome,
        documento: row.documento,
        participacoes: row.participationKeys.size,
        vitorias: row.vitoriaKeys.size,
        menorValorOfertado: row.offeredValues.length ? Math.min(...row.offeredValues) : null,
        maiorValorOfertado: row.offeredValues.length ? Math.max(...row.offeredValues) : null,
        valorMedioOfertado:
          row.offeredValues.length ? Number(average(row.offeredValues)!.toFixed(2)) : null,
        ultimoValorOfertado: lastOffer ? Number(lastOffer.value.toFixed(2)) : null,
        ultimoValorVencedor: lastWinner ? Number(lastWinner.value.toFixed(2)) : null,
        taxaVitoria:
          row.participationKeys.size > 0
            ? Number(((row.vitoriaKeys.size / row.participationKeys.size) * 100).toFixed(2))
            : null,
        origemPrincipal: originPrincipal,
      };
    })
    .sort(
      (left, right) =>
        right.vitorias - left.vitorias ||
        right.participacoes - left.participacoes ||
        left.fornecedorNome.localeCompare(right.fornecedorNome, "pt-BR"),
    );

  const evolucaoPrecos = [
    ...processRowsFiltered.map((row) => ({
      data:
        toDateValue(row.dataHomologacaoItem) ??
        toDateValue(row.dataHomologacaoLicitacao) ??
        toDateValue(row.dataJulgamento) ??
        toDateValue(row.dataAbertura) ??
        toDateValue(row.dataEntradaLicitacao) ??
        toDateValue(item.atualizadoEm) ??
        new Date().toISOString(),
      processoId: row.processoId,
      processoNumeroSirel: row.numeroSirel,
      fornecedorId: row.fornecedorVencedorId,
      fornecedorNome: row.fornecedorVencedorNome,
      modalidadeId: row.modalidadeId,
      modalidade: row.modalidade,
      secretariaId: row.secretariaId,
      secretaria: row.secretaria,
      valorEstimado:
        toNumberOrNull(row.valorEstimadoUnitario) ??
        toNumberOrNull(row.valorUnitarioEstimadoBase),
      valorVencedor: toNumberOrNull(row.valorLanceVencedorUnitario),
      valorContratado: null,
    })),
    ...contractRowsFiltered.map((row) => ({
      data:
        toDateValue(row.dataAssinatura) ??
        toDateValue(row.vigenciaInicio) ??
        new Date().toISOString(),
      processoId: row.processoId,
      processoNumeroSirel: row.processoNumeroSirel,
      fornecedorId: row.fornecedorId,
      fornecedorNome: row.fornecedorNome,
      modalidadeId: row.modalidadeId,
      modalidade: row.modalidade,
      secretariaId: row.secretariaId,
      secretaria: row.secretaria,
      valorEstimado: null,
      valorVencedor: null,
      valorContratado: toNumberOrNull(row.valorUnitario),
    })),
  ].sort((left, right) => compareNullableDatesDesc(right.data, left.data));

  const allHistoricalUnitValues = [
    ...quoteRowsFiltered
      .map((row) => toNumberOrNull(row.valorUnitario))
      .filter((row): row is number => row !== null),
    ...proposalRowsFiltered
      .map(
        (row) =>
          finalBidByProposal.get(row.propostaId)?.value ??
          toNumberOrNull(row.valorUnitarioProposto),
      )
      .filter((row): row is number => row !== null),
    ...licitacoesRows
      .map((row) => row.valorVencedor)
      .filter((row): row is number => row !== null),
    ...contratosRows
      .map((row) => row.valorUnitario)
      .filter((row): row is number => row !== null),
  ];

  const totalValorContratado = contratosRows.reduce(
    (total, row) => total + toNumber(row.valorTotalItem),
    0,
  );
  const contratosOrdenados = [...contratosRows].sort((left, right) =>
    compareNullableDatesDesc(left.vigenciaInicio ?? null, right.vigenciaInicio ?? null),
  );
  const totalHomologados = licitacoesRows.filter((row) =>
    normalizeText(row.statusItem).includes("homolog"),
  ).length;

  const modalidadeCount = new Map<string, number>();
  for (const row of processRowsFiltered) {
    modalidadeCount.set(
      row.modalidade ?? "Não informado",
      (modalidadeCount.get(row.modalidade ?? "Não informado") ?? 0) + 1,
    );
  }
  const statusCount = new Map<string, number>();
  for (const row of licitacoesRows) {
    statusCount.set(row.statusItem, (statusCount.get(row.statusItem) ?? 0) + 1);
  }

  const recurringCount = new Map<string, number>();
  const seriePrecosMap = new Map<string, { valorA: number[]; valorB: number[]; valorC: number[] }>();
  for (const row of evolucaoPrecos) {
    const monthKey = buildMonthKey(row.data);
    if (!monthKey) continue;
    recurringCount.set(monthKey, (recurringCount.get(monthKey) ?? 0) + 1);
    const current = seriePrecosMap.get(monthKey) ?? { valorA: [], valorB: [], valorC: [] };
    if (row.valorEstimado !== null) current.valorA.push(row.valorEstimado);
    if (row.valorVencedor !== null) current.valorB.push(row.valorVencedor);
    if (row.valorContratado !== null) current.valorC.push(row.valorContratado);
    seriePrecosMap.set(monthKey, current);
  }

  const seriePrecos: DossieMultiSeriePoint[] = Array.from(seriePrecosMap.entries())
    .sort((left, right) => left[0].localeCompare(right[0], "pt-BR"))
    .map(([key, value]) => ({
      chave: key,
      label: buildMonthLabel(key),
      valorA: Number((average(value.valorA) ?? 0).toFixed(2)),
      valorB: Number((average(value.valorB) ?? 0).toFixed(2)),
      valorC: Number((average(value.valorC) ?? 0).toFixed(2)),
    }));

  const insights: DossieInsight[] = [];
  if (processosRows.length >= 5) {
    pushInsight(insights, {
      id: "item-recorrente",
      categoria: "Recorrência",
      titulo: "Item com alta recorrência",
      descricao: `O item apareceu em ${processosRows.length} processos filtrados, indicando demanda recorrente.`,
      severidade: "info",
    });
  }
  if (fornecedoresRows.length <= 2 && licitacoesRows.length >= 3) {
    pushInsight(insights, {
      id: "baixa-competitividade",
      categoria: "Competitividade",
      titulo: "Baixa competitividade detectada",
      descricao: "Poucos fornecedores concentram as participações conhecidas para este item.",
      severidade: "warning",
    });
  }
  if (allHistoricalUnitValues.length >= 3) {
    const minValue = Math.min(...allHistoricalUnitValues);
    const maxValue = Math.max(...allHistoricalUnitValues);
    if (minValue > 0 && ((maxValue - minValue) / minValue) * 100 >= 35) {
      pushInsight(insights, {
        id: "dispersao-precos",
        categoria: "Preço",
        titulo: "Grande dispersão de preços",
        descricao: "A variação histórica entre o menor e o maior valor unitário sugere necessidade de acompanhamento gerencial.",
        severidade: "critical",
      });
    }
  }
  const fracassos = licitacoesRows.filter((row) =>
    ["fracassado", "deserto"].some((token) => normalizeText(row.statusItem).includes(token)),
  ).length;
  if (fracassos >= 2) {
    pushInsight(insights, {
      id: "insucesso-repetido",
      categoria: "Risco",
      titulo: "Histórico de insucessos na disputa",
      descricao: `Foram identificados ${fracassos} registros de fracasso ou deserto para o item.`,
      severidade: "warning",
    });
  }
  if (totalValorContratado >= 100000) {
    pushInsight(insights, {
      id: "impacto-contratual",
      categoria: "Contrato",
      titulo: "Forte impacto contratual",
      descricao: `O item já acumula ${totalValorContratado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em contratos filtrados.`,
      severidade: "info",
    });
  }

  const aliases = Array.from(
    new Set(
      processRows
        .map((row) => row.descricaoItem?.trim())
        .filter(
          (row): row is string =>
            Boolean(row) && normalizeText(row) !== normalizeText(item.descricao),
        ),
    ),
  ).slice(0, 8);

  const contractItemIds = contractRows.map((row) => row.contratoItemId);
  const auditConditions = [
    and(eq(auditoriaLog.tabela, "catalogo_itens"), eq(auditoriaLog.registroId, item.id)),
    ...(contractItemIds.length
      ? [
          and(
            eq(auditoriaLog.tabela, "contrato_itens"),
            inArray(auditoriaLog.registroId, contractItemIds),
          ),
        ]
      : []),
  ];
  const auditWhere =
    auditConditions.length === 1 ? auditConditions[0] : or(...auditConditions);
  const auditRows = await db
    .select({
      id: auditoriaLog.id,
      acao: auditoriaLog.acao,
      descricao: auditoriaLog.descricao,
      dadosAnteriores: auditoriaLog.dadosAnteriores,
      dadosNovos: auditoriaLog.dadosNovos,
      criadoEm: auditoriaLog.criadoEm,
      usuario: users.name,
    })
    .from(auditoriaLog)
    .leftJoin(users, eq(users.id, auditoriaLog.usuarioId))
    .where(auditWhere)
    .orderBy(desc(auditoriaLog.criadoEm))
    .limit(20);

  const auditTrail = mapAuditChanges(
    auditRows.map((row) => ({
      ...row,
      dadosAnteriores: (row.dadosAnteriores as Record<string, unknown> | null) ?? null,
      dadosNovos: (row.dadosNovos as Record<string, unknown> | null) ?? null,
    })),
  );

  const vinculosCriticos: string[] = [];
  if (processRows.length && !contractRows.length) {
    vinculosCriticos.push("O item já apareceu em processos, mas ainda não possui contrato itemizado vinculado.");
  }
  if (
    contractRows.some(
      (row) => toNumber(row.quantidadeConsumida) > toNumber(row.quantidadeContratada),
    )
  ) {
    vinculosCriticos.push("Existem contratos com consumo acima da quantidade contratada para este item.");
  }
  if (aliases.length >= 3) {
    vinculosCriticos.push("Há múltiplas descrições operacionais para o mesmo item, o que sugere necessidade de padronização.");
  }

  const itemFilterModalidades: DossieFilterOption[] = Array.from(
    new Map<number, DossieFilterOption>(
      processRows
        .filter((row) => row.modalidadeId && row.modalidade)
        .map((row) => [
          row.modalidadeId!,
          { id: row.modalidadeId!, label: row.modalidade!, subtitle: null },
        ]),
    ).values(),
  );
  const itemFilterSecretarias: DossieFilterOption[] = Array.from(
    new Map<number, DossieFilterOption>(
      processRows.map((row) => [
        row.secretariaId,
        { id: row.secretariaId, label: row.secretaria, subtitle: null },
      ]),
    ).values(),
  );
  const itemFilterProcessos: DossieFilterOption[] = Array.from(
    new Map<number, DossieFilterOption>(
      processRows.map((row) => [
        row.processoId,
        {
          id: row.processoId,
          label: row.numeroSirel,
          subtitle: row.numeroAdministrativo ?? row.objetoProcesso,
        },
      ]),
    ).values(),
  );
  const itemFilterContratos: DossieFilterOption[] = Array.from(
    new Map<number, DossieFilterOption>(
      contractRows.map((row) => [
        row.contratoId,
        {
          id: row.contratoId,
          label: row.numeroContrato,
          subtitle: row.processoNumeroSirel,
        },
      ]),
    ).values(),
  );
  const itemFilterFornecedores: DossieFilterOption[] = fornecedoresRows
    .filter((row) => row.fornecedorId !== null)
    .map((row) => ({
      id: row.fornecedorId!,
      label: row.fornecedorNome,
      subtitle: row.documento,
    }));
  const itemStatusOptions: DossieStatusOption[] = Array.from(statusCount.keys()).map(
    (value) => ({ codigo: value, nome: value }),
  );
  const usuariosSensiveis: string[] = Array.from(
    new Set(
      auditTrail.map((row) => row.usuario).filter((row): row is string => Boolean(row)),
    ),
  );

  return {
    identificacao: {
      id: item.id,
      codigoInterno: itemCodeFromId(item.id),
      descricaoResumida: item.descricao,
      descricaoCompleta:
        processRows
          .map((row) => row.descricaoItem)
          .sort((left, right) => (right?.length ?? 0) - (left?.length ?? 0))[0] ??
        item.descricao,
      unidadeMedida: item.unidadePadrao,
      categoria: null,
      grupo: null,
      familia: null,
      status: item.ativo ? "Ativo" : "Inativo",
      criadoEm: toDateValue(item.criadoEm),
      atualizadoEm: toDateValue(item.atualizadoEm),
      observacoes: null,
      aliases,
    },
    resumo: {
      totalProcessos: distinctCount(processosRows.map((row) => row.processoId)),
      totalLicitacoes: distinctCount(licitacoesRows.map((row) => row.processoId)),
      totalContratos: distinctCount(contratosRows.map((row) => row.contratoId)),
      quantidadeTotalContratada: Number(
        contratosRows.reduce((total, row) => total + row.quantidadeContratada, 0).toFixed(3),
      ),
      valorTotalContratado: Number(totalValorContratado.toFixed(2)),
      valorMedioContratado:
        contratosRows.length && contratosRows.some((row) => row.valorUnitario !== null)
          ? Number(
              average(
                contratosRows
                  .map((row) => row.valorUnitario)
                  .filter((row): row is number => row !== null),
              )!.toFixed(2),
            )
          : null,
      menorValorUnitarioHistorico: allHistoricalUnitValues.length ? Math.min(...allHistoricalUnitValues) : null,
      maiorValorUnitarioHistorico: allHistoricalUnitValues.length ? Math.max(...allHistoricalUnitValues) : null,
      ultimoValorContratado: contratosOrdenados[0]?.valorUnitario ?? null,
      totalFornecedoresDistintos: fornecedoresRows.length,
      totalFornecedoresVencedores: fornecedoresRows.filter((row) => row.vitorias > 0).length,
      taxaSucessoMediaContratacao:
        licitacoesRows.length > 0 ? Number(((totalHomologados / licitacoesRows.length) * 100).toFixed(2)) : null,
      totalAparicoes: processosRows.length,
      valorEstimadoAcumulado: Number(
        processosRows.reduce((total, row) => total + toNumber(row.valorEstimado), 0).toFixed(2),
      ),
      valorHomologadoAcumulado: Number(
        processosRows.reduce((total, row) => total + toNumber(row.valorHomologado), 0).toFixed(2),
      ),
    },
    filtrosDisponiveis: {
      modalidades: itemFilterModalidades,
      secretarias: itemFilterSecretarias,
      processos: itemFilterProcessos,
      contratos: itemFilterContratos,
      fornecedores: itemFilterFornecedores,
      status: itemStatusOptions,
    },
    processos: processosRows,
    licitacoes: licitacoesRows,
    contratos: contratosRows,
    fornecedores: fornecedoresRows,
    evolucaoPrecos,
    insights,
    charts: {
      seriePrecos,
      fornecedores: topSeries(
        fornecedoresRows.map((row) => ({
          label: row.fornecedorNome,
          value: row.valorMedioOfertado ?? 0,
        })),
      ),
      modalidades: buildSeriesPoints(modalidadeCount),
      status: buildSeriesPoints(statusCount),
      recorrencia: buildMonthlySeries(recurringCount),
      dispersao: evolucaoPrecos.flatMap((row, index) => {
        const time = buildDateTimestamp(row.data);
        const points: DossieScatterPoint[] = [];
        if (time === null) return points;
        if (row.valorEstimado !== null) {
          points.push({
            id: `estimado-${index}`,
            label: row.processoNumeroSirel ?? "Estimado",
            eixoX: time,
            eixoY: row.valorEstimado,
            serie: "Estimado",
            descricao: row.fornecedorNome ?? row.modalidade ?? null,
          });
        }
        if (row.valorVencedor !== null) {
          points.push({
            id: `vencedor-${index}`,
            label: row.processoNumeroSirel ?? "Vencedor",
            eixoX: time,
            eixoY: row.valorVencedor,
            serie: "Vencedor",
            descricao: row.fornecedorNome ?? row.modalidade ?? null,
          });
        }
        if (row.valorContratado !== null) {
          points.push({
            id: `contratado-${index}`,
            label: row.processoNumeroSirel ?? "Contratado",
            eixoX: time,
            eixoY: row.valorContratado,
            serie: "Contratado",
            descricao: row.fornecedorNome ?? row.modalidade ?? null,
          });
        }
        return points;
      }),
    },
    auditoria: {
      ultimaAtualizacaoCadastro: toDateValue(item.atualizadoEm),
      usuariosSensiveis,
      mudancasRelevantes: auditTrail,
      vinculosCriticos,
    },
  };
  throw new TRPCError({
    code: "NOT_IMPLEMENTED",
    message: "Dossiê do item ainda não implementado.",
  });
}

export async function buildFornecedorDossieDetail(
  input: DossieFornecedorDetailInput,
): Promise<DossieFornecedorDetail> {
  const db = requireDb();
  const filters = input.filters ?? {};

  const [supplier] = await db
    .select({
      id: fornecedores.id,
      razaoSocial: fornecedores.razaoSocial,
      cnpj: fornecedores.cnpj,
      email: fornecedores.email,
      telefone: fornecedores.telefone,
      cidade: fornecedores.cidade,
      estado: fornecedores.estado,
      ativo: fornecedores.ativo,
      criadoEm: fornecedores.criadoEm,
      atualizadoEm: fornecedores.atualizadoEm,
    })
    .from(fornecedores)
    .where(eq(fornecedores.id, input.fornecedorId))
    .limit(1);

  if (!supplier) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Fornecedor não encontrado para gerar o dossiê.",
    });
  }

  const supplierDocumentKey = normalizeDocumentKey(supplier.cnpj);
  const supplierLookupTokens = buildSupplierLookupTokens(supplier.razaoSocial);
  const identityLookupClauses = [
    ...(supplierDocumentKey
      ? [ilike(fornecedores.cnpj, `%${supplierDocumentKey}%`)]
      : []),
    ...supplierLookupTokens.map((token) => ilike(fornecedores.razaoSocial, `%${token}%`)),
  ];

  const supplierIdentityCandidates = identityLookupClauses.length
    ? await db
        .select({
          id: fornecedores.id,
          razaoSocial: fornecedores.razaoSocial,
          cnpj: fornecedores.cnpj,
        })
        .from(fornecedores)
        .where(or(...identityLookupClauses))
        .limit(200)
    : [];

  const supplierIdentityRows = [
    supplier,
    ...supplierIdentityCandidates.filter(
      (candidate) =>
        candidate.id !== supplier.id &&
        ((supplierDocumentKey &&
          normalizeDocumentKey(candidate.cnpj) === supplierDocumentKey) ||
          supplierNamesLikelySame(candidate.razaoSocial, supplier.razaoSocial)),
    ),
  ];

  const supplierIdentityIds = Array.from(
    new Set(supplierIdentityRows.map((row) => row.id)),
  );
  const supplierIdentityIdSet = new Set(supplierIdentityIds);
  const supplierIdentityNames = Array.from(
    new Set(
      supplierIdentityRows
        .map((row) => row.razaoSocial?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const supplierIdentityDocumentKeys = Array.from(
    new Set(
      supplierIdentityRows
        .map((row) => normalizeDocumentKey(row.cnpj))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const supplierIdentityDocumentSet = new Set(supplierIdentityDocumentKeys);
  const supplierIdentityLookupTokens = Array.from(
    new Set(
      supplierIdentityNames.flatMap((value) => buildSupplierLookupTokens(value)),
    ),
  ).slice(0, 2);
  const supplierIdentityCount = supplierIdentityIds.length;

  const winnerIdentityClauses = [
    inArray(itensProcessoValores.fornecedorVencedorId, supplierIdentityIds),
    ...supplierIdentityDocumentKeys.map((value) =>
      ilike(itensProcessoValores.fornecedorVencedorCnpj, `%${value}%`),
    ),
    ...supplierIdentityLookupTokens.map((token) =>
      ilike(itensProcessoValores.fornecedorVencedorNome, `%${token}%`),
    ),
  ];

  const [
    participationRows,
    proposalRows,
    quoteRows,
    winnerRowsCandidate,
    contractRows,
    pncpRows,
  ] =
    await Promise.all([
      db
        .select({
          licitanteId: licitantes.id,
          licitacaoId: licitantes.licitacaoId,
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          objetoProcesso: processos.objeto,
          secretariaId: secretarias.id,
          secretaria: secretarias.nome,
          modalidadeId: modalidades.id,
          modalidade: modalidades.nome,
          dataCadastro: licitantes.dataCadastro,
          dataAbertura: processos.dataAbertura,
          licitacaoStatus: licitacoes.statusLicitacao,
          statusHabilitacao: licitantes.statusHabilitacao,
          ativo: licitantes.ativo,
        })
        .from(licitantes)
        .innerJoin(licitacoes, eq(licitacoes.id, licitantes.licitacaoId))
        .innerJoin(processos, eq(processos.id, licitacoes.processoId))
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .where(inArray(licitantes.fornecedorId, supplierIdentityIds))
        .orderBy(desc(licitantes.dataCadastro), desc(licitantes.id)),
      db
        .select({
          propostaId: propostasLicitacao.id,
          licitanteId: licitantes.id,
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          objetoProcesso: processos.objeto,
          numeroEdital: processos.numeroEdital,
          secretariaId: secretarias.id,
          secretaria: secretarias.nome,
          modalidadeId: modalidades.id,
          modalidade: modalidades.nome,
          licitacaoId: licitantes.licitacaoId,
          itemProcessoId: itensProcesso.id,
          itemCatalogoId: itensProcesso.catalogoItemId,
          itemLabel: catalogoItens.descricao,
          itemDescricao: itensProcesso.descricao,
          loteNumero: lotes.numeroLote,
          quantidade: itensProcesso.quantidade,
          unidade: itensProcesso.unidade,
          valorEstimadoUnitario: itensProcessoValores.valorEstimadoUnitario,
          valorEstimadoBase: itensProcesso.valorUnitarioEstimado,
          valorUnitarioProposto: propostasLicitacao.valorUnitarioProposto,
          valorTotalProposto: propostasLicitacao.valorTotalProposto,
          dataProposta: propostasLicitacao.dataProposta,
          classificacao: propostasLicitacao.classificacao,
          situacao: propostasLicitacao.situacao,
        })
        .from(propostasLicitacao)
        .innerJoin(licitantes, eq(licitantes.id, propostasLicitacao.licitanteId))
        .innerJoin(itensProcesso, eq(itensProcesso.id, propostasLicitacao.itemId))
        .innerJoin(processos, eq(processos.id, itensProcesso.processoId))
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .leftJoin(lotes, eq(lotes.id, itensProcesso.loteId))
        .leftJoin(catalogoItens, eq(catalogoItens.id, itensProcesso.catalogoItemId))
        .leftJoin(
          itensProcessoValores,
          eq(itensProcessoValores.itemProcessoId, itensProcesso.id),
        )
        .where(inArray(licitantes.fornecedorId, supplierIdentityIds))
        .orderBy(desc(propostasLicitacao.dataProposta), desc(propostasLicitacao.id)),
      db
        .select({
          cotacaoId: cotacoes.id,
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          objetoProcesso: processos.objeto,
          numeroEdital: processos.numeroEdital,
          secretariaId: secretarias.id,
          secretaria: secretarias.nome,
          modalidadeId: modalidades.id,
          modalidade: modalidades.nome,
          itemProcessoId: itensProcesso.id,
          itemCatalogoId: itensProcesso.catalogoItemId,
          itemLabel: catalogoItens.descricao,
          itemDescricao: itensProcesso.descricao,
          quantidade: itensProcesso.quantidade,
          valorUnitario: cotacoes.valorUnitario,
          valorTotal: cotacoes.valorTotal,
          dataCotacao: cotacoes.dataCotacao,
          status: cotacoes.status,
        })
        .from(cotacoes)
        .innerJoin(processos, eq(processos.id, cotacoes.processoId))
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .leftJoin(itensProcesso, eq(itensProcesso.id, cotacoes.itemId))
        .leftJoin(catalogoItens, eq(catalogoItens.id, itensProcesso.catalogoItemId))
        .where(inArray(cotacoes.fornecedorId, supplierIdentityIds))
        .orderBy(desc(cotacoes.dataCotacao), desc(cotacoes.id)),
      db
        .select({
          fornecedorVencedorId: itensProcessoValores.fornecedorVencedorId,
          fornecedorVencedorNome: itensProcessoValores.fornecedorVencedorNome,
          fornecedorVencedorCnpj: itensProcessoValores.fornecedorVencedorCnpj,
          itemProcessoId: itensProcesso.id,
          itemCatalogoId: itensProcesso.catalogoItemId,
          itemLabel: catalogoItens.descricao,
          itemDescricao: itensProcesso.descricao,
          loteNumero: lotes.numeroLote,
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          numeroEdital: processos.numeroEdital,
          secretariaId: secretarias.id,
          secretaria: secretarias.nome,
          modalidadeId: modalidades.id,
          modalidade: modalidades.nome,
          quantidade: itensProcesso.quantidade,
          unidade: itensProcesso.unidade,
          valorVencedorUnitario: itensProcessoValores.valorLanceVencedorUnitario,
          valorVencedorTotal: itensProcessoValores.valorLanceVencedorTotal,
          dataResultado: itensProcessoValores.dataHomologacao,
          itemHomologado: itensProcessoValores.itemHomologado,
          itemFracassado: itensProcessoValores.itemFracassado,
          itemDeserto: itensProcessoValores.itemDeserto,
          licitacaoStatus: licitacoes.statusLicitacao,
        })
        .from(itensProcessoValores)
        .innerJoin(itensProcesso, eq(itensProcesso.id, itensProcessoValores.itemProcessoId))
        .innerJoin(processos, eq(processos.id, itensProcesso.processoId))
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .leftJoin(lotes, eq(lotes.id, itensProcesso.loteId))
        .leftJoin(catalogoItens, eq(catalogoItens.id, itensProcesso.catalogoItemId))
        .leftJoin(licitacoes, eq(licitacoes.processoId, processos.id))
        .where(or(...winnerIdentityClauses))
        .orderBy(desc(itensProcessoValores.dataHomologacao), desc(itensProcessoValores.id)),
      db
        .select({
          contratoId: contratos.id,
          numeroContrato: contratos.numeroContrato,
          processoId: processos.id,
          processoNumeroSirel: processos.numeroSirel,
          objeto: contratos.objeto,
          secretariaId: secretarias.id,
          secretaria: secretarias.nome,
          modalidadeId: modalidades.id,
          modalidade: modalidades.nome,
          dataAssinatura: contratos.dataAssinatura,
          vigenciaInicio: contratos.dataVigenciaInicio,
          vigenciaFim: contratos.dataVigenciaFim,
          status: contratos.status,
          valorTotalContrato: contratos.valorContrato,
          contratoItemId: contratoItens.id,
          itemCatalogoId: contratoItens.catalogoItemId,
          itemLabel: catalogoItens.descricao,
          quantidadeContratada: contratoItens.quantidadeContratada,
          quantidadeConsumida: contratoItens.quantidadeConsumida,
          valorUnitario: contratoItens.valorUnitario,
        })
        .from(contratos)
        .innerJoin(processos, eq(processos.id, contratos.processoId))
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .leftJoin(contratoItens, eq(contratoItens.contratoId, contratos.id))
        .leftJoin(catalogoItens, eq(catalogoItens.id, contratoItens.catalogoItemId))
        .where(inArray(contratos.fornecedorId, supplierIdentityIds))
        .orderBy(desc(contratos.dataAssinatura), desc(contratos.id)),
      db
        .select({
          id: contratosPncp.id,
          syntheticId: contratosPncp.id,
          processoId: processos.id,
          processoNumeroSirel: processos.numeroSirel,
          secretariaId: secretarias.id,
          secretaria: secretarias.nome,
          modalidadeId: modalidades.id,
          modalidade: modalidades.nome,
          numeroContrato: contratosPncp.numeroContrato,
          objeto: contratosPncp.objetoContrato,
          valorTotalContrato: contratosPncp.valorTotalContrato,
          dataAssinatura: contratosPncp.dataAssinatura,
          vigenciaInicio: contratosPncp.dataInicioVigencia,
          vigenciaFim: contratosPncp.dataFimVigencia,
          status: contratosPncp.statusContrato,
          fornecedorId: contratosPncp.fornecedorId,
          fornecedorCnpj: contratosPncp.fornecedorCnpj,
          pncpUrl: contratosPncp.pncpUrl,
          itensVinculados: contratosPncp.itensVinculados,
        })
        .from(contratosPncp)
        .innerJoin(processos, eq(processos.id, contratosPncp.processoId))
        .innerJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .where(
          or(
            inArray(contratosPncp.fornecedorId, supplierIdentityIds),
            ...supplierIdentityDocumentKeys.map((value) =>
              ilike(contratosPncp.fornecedorCnpj, `%${value}%`),
            ),
          ),
        )
        .orderBy(desc(contratosPncp.dataAssinatura), desc(contratosPncp.id)),
    ]);

  const proposalIds = proposalRows.map((row) => row.propostaId);
  const lanceRows = proposalIds.length
    ? await db
        .select({
          propostaId: lancesLicitacao.propostaId,
          valorLance: lancesLicitacao.valorLance,
          dataLance: lancesLicitacao.dataLance,
        })
        .from(lancesLicitacao)
        .where(inArray(lancesLicitacao.propostaId, proposalIds))
        .orderBy(desc(lancesLicitacao.dataLance), desc(lancesLicitacao.id))
    : [];

  const finalBidByProposal = new Map<
    number,
    { value: number | null; date: string | null }
  >();
  for (const row of proposalRows) {
    finalBidByProposal.set(row.propostaId, {
      value: toNumberOrNull(row.valorUnitarioProposto),
      date: toDateValue(row.dataProposta),
    });
  }
  for (const row of lanceRows) {
    const current = finalBidByProposal.get(row.propostaId);
    const nextValue = toNumberOrNull(row.valorLance);
    if (
      nextValue !== null &&
      (!current || current.value === null || nextValue <= current.value)
    ) {
      finalBidByProposal.set(row.propostaId, {
        value: nextValue,
        date: toDateValue(row.dataLance),
      });
    }
  }

  const winnerRows = winnerRowsCandidate.filter((row) => {
    if (
      row.fornecedorVencedorId !== null &&
      row.fornecedorVencedorId !== undefined &&
      supplierIdentityIdSet.has(row.fornecedorVencedorId)
    ) {
      return true;
    }
    const winnerDocumentKey = normalizeDocumentKey(row.fornecedorVencedorCnpj);
    if (winnerDocumentKey && supplierIdentityDocumentSet.has(winnerDocumentKey)) {
      return true;
    }
    if (!row.fornecedorVencedorNome) return false;
    return supplierIdentityNames.some((name) =>
      supplierNamesLikelySame(row.fornecedorVencedorNome, name),
    );
  });

  const pncpRowsFilteredSource = pncpRows.filter((row) => {
    if (
      row.fornecedorId !== null &&
      row.fornecedorId !== undefined &&
      supplierIdentityIdSet.has(row.fornecedorId)
    ) {
      return true;
    }
    const pncpDocumentKey = normalizeDocumentKey(row.fornecedorCnpj);
    return pncpDocumentKey ? supplierIdentityDocumentSet.has(pncpDocumentKey) : false;
  });

  const itemScopedProcessIds = new Set<number>();
  if (filters.itemId) {
    for (const row of proposalRows) {
      if (row.itemCatalogoId === filters.itemId) itemScopedProcessIds.add(row.processoId);
    }
    for (const row of quoteRows) {
      if (row.itemCatalogoId === filters.itemId) itemScopedProcessIds.add(row.processoId);
    }
    for (const row of winnerRows) {
      if (row.itemCatalogoId === filters.itemId) itemScopedProcessIds.add(row.processoId);
    }
    for (const row of contractRows) {
      if (row.itemCatalogoId === filters.itemId) itemScopedProcessIds.add(row.processoId);
    }
    for (const row of pncpRowsFilteredSource) {
      const itens = Array.isArray(row.itensVinculados) ? row.itensVinculados : [];
      if (itens.some((value) => normalizeText(String(value)).includes(String(filters.itemId)))) {
        itemScopedProcessIds.add(row.processoId);
      }
    }
  }

  const contractScopedProcessIds = filters.contratoId
    ? new Set(
        [
          ...contractRows
            .filter((row) => row.contratoId === filters.contratoId)
            .map((row) => row.processoId),
          ...pncpRowsFilteredSource
            .filter((row) => pncpSyntheticContractId(row.syntheticId) === filters.contratoId)
            .map((row) => row.processoId),
        ],
      )
    : null;

  const participationRowsFiltered = participationRows.filter((row) => {
    const referenceDate = toDateValue(row.dataCadastro) ?? toDateValue(row.dataAbertura);
    if (!dateInRange(referenceDate, filters.periodoInicio, filters.periodoFim)) return false;
    if (filters.modalidadeId && row.modalidadeId !== filters.modalidadeId) return false;
    if (filters.secretariaId && row.secretariaId !== filters.secretariaId) return false;
    if (filters.processoId && row.processoId !== filters.processoId) return false;
    if (contractScopedProcessIds && !contractScopedProcessIds.has(row.processoId)) return false;
    if (filters.itemId && !itemScopedProcessIds.has(row.processoId)) return false;
    if (!statusMatches(filters.status, [row.statusHabilitacao, row.licitacaoStatus])) return false;
    return true;
  });

  const proposalRowsFiltered = proposalRows.filter((row) => {
    const referenceDate =
      finalBidByProposal.get(row.propostaId)?.date ?? toDateValue(row.dataProposta);
    if (!dateInRange(referenceDate, filters.periodoInicio, filters.periodoFim)) return false;
    if (filters.modalidadeId && row.modalidadeId !== filters.modalidadeId) return false;
    if (filters.secretariaId && row.secretariaId !== filters.secretariaId) return false;
    if (filters.processoId && row.processoId !== filters.processoId) return false;
    if (filters.itemId && row.itemCatalogoId !== filters.itemId) return false;
    if (contractScopedProcessIds && !contractScopedProcessIds.has(row.processoId)) return false;
    if (!statusMatches(filters.status, [row.situacao])) return false;
    return true;
  });

  const quoteRowsFiltered = quoteRows.filter((row) => {
    if (!dateInRange(toDateValue(row.dataCotacao), filters.periodoInicio, filters.periodoFim)) {
      return false;
    }
    if (filters.modalidadeId && row.modalidadeId !== filters.modalidadeId) return false;
    if (filters.secretariaId && row.secretariaId !== filters.secretariaId) return false;
    if (filters.processoId && row.processoId !== filters.processoId) return false;
    if (filters.itemId && row.itemCatalogoId !== filters.itemId) return false;
    if (contractScopedProcessIds && !contractScopedProcessIds.has(row.processoId)) return false;
    if (!statusMatches(filters.status, [row.status])) return false;
    return true;
  });

  const winnerRowsFiltered = winnerRows.filter((row) => {
    const referenceDate = toDateValue(row.dataResultado) ?? toDateValue(supplier.atualizadoEm);
    if (!dateInRange(referenceDate, filters.periodoInicio, filters.periodoFim)) return false;
    if (filters.modalidadeId && row.modalidadeId !== filters.modalidadeId) return false;
    if (filters.secretariaId && row.secretariaId !== filters.secretariaId) return false;
    if (filters.processoId && row.processoId !== filters.processoId) return false;
    if (filters.itemId && row.itemCatalogoId !== filters.itemId) return false;
    if (contractScopedProcessIds && !contractScopedProcessIds.has(row.processoId)) return false;
    if (!statusMatches(filters.status, [buildStatusLabelEnhanced(row), row.licitacaoStatus])) return false;
    return true;
  });

  const contractRowsFiltered = contractRows.filter((row) => {
    const referenceDate = toDateValue(row.dataAssinatura) ?? toDateValue(row.vigenciaInicio);
    if (!dateInRange(referenceDate, filters.periodoInicio, filters.periodoFim)) return false;
    if (filters.modalidadeId && row.modalidadeId !== filters.modalidadeId) return false;
    if (filters.secretariaId && row.secretariaId !== filters.secretariaId) return false;
    if (filters.processoId && row.processoId !== filters.processoId) return false;
    if (filters.contratoId && row.contratoId !== filters.contratoId) return false;
    if (filters.itemId && row.itemCatalogoId !== filters.itemId) return false;
    if (!statusMatches(filters.status, [row.status])) return false;
    return true;
  });

  const pncpRowsFiltered = pncpRowsFilteredSource.filter((row) => {
    const referenceDate = toDateValue(row.dataAssinatura) ?? toDateValue(row.vigenciaInicio);
    if (!dateInRange(referenceDate, filters.periodoInicio, filters.periodoFim)) return false;
    if (filters.modalidadeId && row.modalidadeId !== filters.modalidadeId) return false;
    if (filters.secretariaId && row.secretariaId !== filters.secretariaId) return false;
    if (filters.processoId && row.processoId !== filters.processoId) return false;
    if (
      filters.contratoId &&
      pncpSyntheticContractId(row.syntheticId) !== filters.contratoId
    ) {
      return false;
    }
    if (filters.itemId) {
      const itens = Array.isArray(row.itensVinculados) ? row.itensVinculados : [];
      if (!itens.length) return false;
    }
    if (!statusMatches(filters.status, [row.status])) return false;
    return true;
  });

  const participationMap = new Map<
    number,
    {
      processoId: number;
      numeroSirel: string;
      objetoProcesso: string;
      modalidadeId: number | null;
      modalidade: string | null;
      secretariaId: number;
      secretaria: string;
      referenceDate: string | null;
      hasQuote: boolean;
      hasParticipation: boolean;
      hasWinner: boolean;
      totalOffered: number;
      classifications: number[];
      statuses: string[];
    }
  >();

  const ensureParticipation = (
    processoId: number,
    payload: {
      numeroSirel: string;
      objetoProcesso: string;
      modalidadeId: number | null;
      modalidade: string | null;
      secretariaId: number;
      secretaria: string;
      referenceDate: string | null;
    },
  ) => {
    const existing = participationMap.get(processoId);
    if (existing) return existing;
    const created = {
      processoId,
      numeroSirel: payload.numeroSirel,
      objetoProcesso: payload.objetoProcesso,
      modalidadeId: payload.modalidadeId,
      modalidade: payload.modalidade,
      secretariaId: payload.secretariaId,
      secretaria: payload.secretaria,
      referenceDate: payload.referenceDate,
      hasQuote: false,
      hasParticipation: false,
      hasWinner: false,
      totalOffered: 0,
      classifications: [] as number[],
      statuses: [] as string[],
    };
    participationMap.set(processoId, created);
    return created;
  };

  for (const row of participationRowsFiltered) {
    const entry = ensureParticipation(row.processoId, {
      numeroSirel: row.numeroSirel,
      objetoProcesso: row.objetoProcesso,
      modalidadeId: row.modalidadeId,
      modalidade: row.modalidade,
      secretariaId: row.secretariaId,
      secretaria: row.secretaria,
      referenceDate: toDateValue(row.dataCadastro) ?? toDateValue(row.dataAbertura),
    });
    entry.hasParticipation = true;
    entry.statuses.push(row.statusHabilitacao, row.licitacaoStatus);
  }

  for (const row of quoteRowsFiltered) {
    const entry = ensureParticipation(row.processoId, {
      numeroSirel: row.numeroSirel,
      objetoProcesso: row.objetoProcesso,
      modalidadeId: row.modalidadeId,
      modalidade: row.modalidade,
      secretariaId: row.secretariaId,
      secretaria: row.secretaria,
      referenceDate: toDateValue(row.dataCotacao),
    });
    entry.hasQuote = true;
    entry.totalOffered += toNumber(row.valorTotal);
    entry.statuses.push(row.status);
  }

  for (const row of proposalRowsFiltered) {
    const entry = ensureParticipation(row.processoId, {
      numeroSirel: row.numeroSirel,
      objetoProcesso: row.objetoProcesso,
      modalidadeId: row.modalidadeId,
      modalidade: row.modalidade,
      secretariaId: row.secretariaId,
      secretaria: row.secretaria,
      referenceDate:
        finalBidByProposal.get(row.propostaId)?.date ?? toDateValue(row.dataProposta),
    });
    entry.hasParticipation = true;
    entry.totalOffered += toNumber(row.valorTotalProposto);
    if (row.classificacao !== null && row.classificacao !== undefined) {
      entry.classifications.push(row.classificacao);
    }
    entry.statuses.push(row.situacao);
  }

  for (const row of winnerRowsFiltered) {
    const entry = ensureParticipation(row.processoId, {
      numeroSirel: row.numeroSirel,
      objetoProcesso: row.itemDescricao ?? row.numeroSirel,
      modalidadeId: row.modalidadeId,
      modalidade: row.modalidade,
      secretariaId: row.secretariaId,
      secretaria: row.secretaria,
      referenceDate: toDateValue(row.dataResultado),
    });
    entry.hasWinner = true;
    entry.statuses.push(buildStatusLabelEnhanced(row));
  }

  const participacoes = Array.from(participationMap.values())
    .map((row) => ({
      processoId: row.processoId,
      numeroSirel: row.numeroSirel,
      objetoProcesso: row.objetoProcesso,
      modalidadeId: row.modalidadeId,
      modalidade: row.modalidade,
      dataReferencia: row.referenceDate,
      papel: row.hasWinner ? "Vencedor" : row.hasParticipation ? "Participante" : "Cotado",
      tipoParticipacao:
        row.hasQuote && row.hasParticipation
          ? "Cotado e participou"
          : row.hasParticipation
            ? "Participou"
            : "Apenas cotado",
      valorGlobalOfertado: row.totalOffered ? Number(row.totalOffered.toFixed(2)) : null,
      melhorClassificacao: row.classifications.length ? Math.min(...row.classifications) : null,
      statusFornecedor: row.statuses.find(Boolean) ?? null,
      secretariaId: row.secretariaId,
      secretaria: row.secretaria,
    }))
    .sort((left, right) => compareNullableDatesDesc(left.dataReferencia, right.dataReferencia));

  const ofertas = [
    ...quoteRowsFiltered.map((row) => ({
      id: `cotacao-${row.cotacaoId}`,
      tipoRegistro: "Cotação",
      processoId: row.processoId,
      numeroSirel: row.numeroSirel,
      edital: row.numeroEdital,
      itemId: row.itemProcessoId,
      itemCatalogoId: row.itemCatalogoId,
      itemLabel: row.itemLabel ?? row.itemDescricao ?? "Cotação sem item catalogado",
      loteNumero: null,
      valorEstimado: null,
      valorOfertadoInicial: toNumberOrNull(row.valorUnitario),
      valorFinal: toNumberOrNull(row.valorUnitario),
      diferencaPercentualEstimado: null,
      classificacao: null,
      resultado: row.status,
      dataReferencia: toDateValue(row.dataCotacao),
    })),
    ...proposalRowsFiltered.map((row) => {
      const estimated =
        toNumberOrNull(row.valorEstimadoUnitario) ?? toNumberOrNull(row.valorEstimadoBase);
      const finalValue =
        finalBidByProposal.get(row.propostaId)?.value ??
        toNumberOrNull(row.valorUnitarioProposto);
      return {
        id: `proposta-${row.propostaId}`,
        tipoRegistro: "Proposta/Lance",
        processoId: row.processoId,
        numeroSirel: row.numeroSirel,
        edital: row.numeroEdital,
        itemId: row.itemProcessoId,
        itemCatalogoId: row.itemCatalogoId,
        itemLabel: row.itemLabel ?? row.itemDescricao ?? `Item ${row.itemProcessoId}`,
        loteNumero: row.loteNumero,
        valorEstimado: estimated,
        valorOfertadoInicial: toNumberOrNull(row.valorUnitarioProposto),
        valorFinal: finalValue,
        diferencaPercentualEstimado:
          estimated !== null && finalValue !== null && estimated > 0
            ? Number((((finalValue - estimated) / estimated) * 100).toFixed(2))
            : null,
        classificacao: row.classificacao,
        resultado: row.situacao,
        dataReferencia:
          finalBidByProposal.get(row.propostaId)?.date ?? toDateValue(row.dataProposta),
      };
    }),
  ].sort((left, right) => compareNullableDatesDesc(left.dataReferencia, right.dataReferencia));

  const vitorias = winnerRowsFiltered
    .map((row) => ({
      processoId: row.processoId,
      numeroSirel: row.numeroSirel,
      edital: row.numeroEdital,
      itemProcessoId: row.itemProcessoId,
      itemCatalogoId: row.itemCatalogoId,
      itemLabel: row.itemLabel ?? row.itemDescricao ?? `Item ${row.itemProcessoId}`,
      loteNumero: row.loteNumero,
      quantidade: toNumber(row.quantidade),
      unidade: row.unidade,
      valorVencedorUnitario: toNumberOrNull(row.valorVencedorUnitario),
      valorTotalVencido: toNumberOrNull(row.valorVencedorTotal),
      dataResultado: toDateValue(row.dataResultado),
      statusPosterior: buildStatusLabelEnhanced(row),
    }))
    .sort((left, right) => compareNullableDatesDesc(left.dataResultado, right.dataResultado));

  const internalContractMap = new Map<
    number,
    {
      contratoId: number;
      numeroContrato: string;
      processoId: number | null;
      processoNumeroSirel: string | null;
      objetoResumido: string;
      valorTotalContrato: number | null;
      valorAtribuidoFornecedor: number;
      vigenciaInicio: string | null;
      vigenciaFim: string | null;
      status: string;
      totalItensSet: Set<string>;
      saldo: number;
    }
  >();

  for (const row of contractRowsFiltered) {
    const existing =
      internalContractMap.get(row.contratoId) ??
      {
        contratoId: row.contratoId,
        numeroContrato: row.numeroContrato,
        processoId: row.processoId,
        processoNumeroSirel: row.processoNumeroSirel,
        objetoResumido: row.objeto,
        valorTotalContrato: toNumberOrNull(row.valorTotalContrato),
        valorAtribuidoFornecedor: 0,
        vigenciaInicio: toDateValue(row.vigenciaInicio),
        vigenciaFim: toDateValue(row.vigenciaFim),
        status: row.status,
        totalItensSet: new Set<string>(),
        saldo: 0,
      };
    if (row.itemCatalogoId || row.itemLabel) {
      existing.totalItensSet.add(String(row.itemCatalogoId ?? row.itemLabel));
    }
    const quantidadeContratada = toNumber(row.quantidadeContratada);
    const quantidadeConsumida = toNumber(row.quantidadeConsumida);
    const saldoAtual = Math.max(0, quantidadeContratada - quantidadeConsumida);
    existing.saldo += saldoAtual;
    existing.valorAtribuidoFornecedor +=
      quantidadeContratada * toNumber(row.valorUnitario);
    internalContractMap.set(row.contratoId, existing);
  }

  const contratosRows = [
    ...Array.from(internalContractMap.values()).map((row) => ({
      contratoId: row.contratoId,
      origem: "INTERNO" as const,
      numeroContrato: row.numeroContrato,
      processoId: row.processoId,
      processoNumeroSirel: row.processoNumeroSirel,
      objetoResumido: row.objetoResumido,
      valorTotalContrato: row.valorTotalContrato,
      valorAtribuidoFornecedor: Number(row.valorAtribuidoFornecedor.toFixed(2)),
      vigenciaInicio: row.vigenciaInicio,
      vigenciaFim: row.vigenciaFim,
      status: row.status,
      totalItens: row.totalItensSet.size,
      saldo: Number(row.saldo.toFixed(3)),
      pncpUrl: null,
    })),
    ...pncpRowsFiltered.map((row) => ({
      contratoId: pncpSyntheticContractId(row.syntheticId),
      origem: "PNCP" as const,
      numeroContrato: row.numeroContrato ?? `PNCP-${row.id}`,
      processoId: row.processoId,
      processoNumeroSirel: row.processoNumeroSirel,
      objetoResumido: row.objeto ?? "Contrato PNCP",
      valorTotalContrato: toNumberOrNull(row.valorTotalContrato),
      valorAtribuidoFornecedor: toNumberOrNull(row.valorTotalContrato),
      vigenciaInicio: toDateValue(row.vigenciaInicio),
      vigenciaFim: toDateValue(row.vigenciaFim),
      status: row.status ?? "SEM STATUS",
      totalItens: Array.isArray(row.itensVinculados) ? row.itensVinculados.length : 0,
      saldo: null,
      pncpUrl: row.pncpUrl,
    })),
  ].sort((left, right) =>
    compareNullableDatesDesc(left.vigenciaInicio ?? left.vigenciaFim, right.vigenciaInicio ?? right.vigenciaFim),
  );

  const itemMap = new Map<
    string,
    {
      itemCatalogoId: number | null;
      itemLabel: string;
      ofertado: number;
      vencido: number;
      offeredValues: number[];
      offerDates: Array<{ value: number; date: string | null }>;
      winnerDates: Array<{ value: number; date: string | null }>;
      valorVencidoTotal: number;
    }
  >();

  const ensureItemEntry = (itemCatalogoId: number | null, itemLabel: string) => {
    const key =
      itemCatalogoId !== null && itemCatalogoId !== undefined
        ? `id:${itemCatalogoId}`
        : normalizeText(itemLabel);
    const existing = itemMap.get(key);
    if (existing) return existing;
    const created = {
      itemCatalogoId: itemCatalogoId ?? null,
      itemLabel,
      ofertado: 0,
      vencido: 0,
      offeredValues: [] as number[],
      offerDates: [] as Array<{ value: number; date: string | null }>,
      winnerDates: [] as Array<{ value: number; date: string | null }>,
      valorVencidoTotal: 0,
    };
    itemMap.set(key, created);
    return created;
  };

  for (const row of quoteRowsFiltered) {
    const entry = ensureItemEntry(
      row.itemCatalogoId,
      row.itemLabel ?? row.itemDescricao ?? "Item não catalogado",
    );
    entry.ofertado += 1;
    const value = toNumberOrNull(row.valorUnitario);
    if (value !== null) {
      entry.offeredValues.push(value);
      entry.offerDates.push({ value, date: toDateValue(row.dataCotacao) });
    }
  }
  for (const row of proposalRowsFiltered) {
    const entry = ensureItemEntry(
      row.itemCatalogoId,
      row.itemLabel ?? row.itemDescricao ?? `Item ${row.itemProcessoId}`,
    );
    entry.ofertado += 1;
    const value =
      finalBidByProposal.get(row.propostaId)?.value ??
      toNumberOrNull(row.valorUnitarioProposto);
    if (value !== null) {
      entry.offeredValues.push(value);
      entry.offerDates.push({
        value,
        date: finalBidByProposal.get(row.propostaId)?.date ?? toDateValue(row.dataProposta),
      });
    }
  }
  for (const row of winnerRowsFiltered) {
    const entry = ensureItemEntry(
      row.itemCatalogoId,
      row.itemLabel ?? row.itemDescricao ?? `Item ${row.itemProcessoId}`,
    );
    entry.vencido += 1;
    const value = toNumberOrNull(row.valorVencedorUnitario);
    if (value !== null) {
      entry.winnerDates.push({ value, date: toDateValue(row.dataResultado) });
    }
    entry.valorVencidoTotal += toNumber(row.valorVencedorTotal);
  }

  const totalVitoriasFornecedor = Array.from(itemMap.values()).reduce(
    (total, row) => total + row.vencido,
    0,
  );
  const itens = Array.from(itemMap.values())
    .map((row) => {
      const lastOffer = row.offerDates.sort((left, right) =>
        compareNullableDatesDesc(left.date, right.date),
      )[0];
      const lastWinner = row.winnerDates.sort((left, right) =>
        compareNullableDatesDesc(left.date, right.date),
      )[0];
      return {
        itemCatalogoId: row.itemCatalogoId,
        itemLabel: row.itemLabel,
        ofertado: row.ofertado,
        vencido: row.vencido,
        menorPrecoOfertado: row.offeredValues.length ? Math.min(...row.offeredValues) : null,
        precoMedioOfertado:
          row.offeredValues.length ? Number(average(row.offeredValues)!.toFixed(2)) : null,
        ultimoPrecoOfertado: lastOffer ? Number(lastOffer.value.toFixed(2)) : null,
        ultimoPrecoVencedor: lastWinner ? Number(lastWinner.value.toFixed(2)) : null,
        participacaoVitoriasFornecedor:
          totalVitoriasFornecedor > 0
            ? Number(((row.vencido / totalVitoriasFornecedor) * 100).toFixed(2))
            : null,
      };
    })
    .sort(
      (left, right) =>
        right.vencido - left.vencido ||
        right.ofertado - left.ofertado ||
        left.itemLabel.localeCompare(right.itemLabel, "pt-BR"),
    );

  const auditRows = await db
    .select({
      id: auditoriaLog.id,
      acao: auditoriaLog.acao,
      descricao: auditoriaLog.descricao,
      dadosAnteriores: auditoriaLog.dadosAnteriores,
      dadosNovos: auditoriaLog.dadosNovos,
      criadoEm: auditoriaLog.criadoEm,
      usuario: users.name,
    })
    .from(auditoriaLog)
    .leftJoin(users, eq(users.id, auditoriaLog.usuarioId))
    .where(
      and(
        eq(auditoriaLog.tabela, "fornecedores"),
        eq(auditoriaLog.registroId, supplier.id),
      ),
    )
    .orderBy(desc(auditoriaLog.criadoEm))
    .limit(30);

  const auditTrail = mapAuditChanges(
    auditRows.map((row) => ({
      ...row,
      dadosAnteriores: (row.dadosAnteriores as Record<string, unknown> | null) ?? null,
      dadosNovos: (row.dadosNovos as Record<string, unknown> | null) ?? null,
    })),
  );

  const registroUnificado = auditRows.some((row) => {
    const descricao = normalizeText(row.descricao);
    const novos = (row.dadosNovos as Record<string, unknown> | null) ?? {};
    return (
      descricao.includes("unific") ||
      "mergeSummary" in novos ||
      "mergedIntoFornecedorId" in novos
    );
  });

  const allParticipationDates = [
    ...participationRowsFiltered.map((row) => toDateValue(row.dataCadastro) ?? toDateValue(row.dataAbertura)),
    ...proposalRowsFiltered.map(
      (row) =>
        finalBidByProposal.get(row.propostaId)?.date ?? toDateValue(row.dataProposta),
    ),
    ...quoteRowsFiltered.map((row) => toDateValue(row.dataCotacao)),
  ].filter((row): row is string => Boolean(row));

  const allVictoryDates = winnerRowsFiltered
    .map((row) => toDateValue(row.dataResultado))
    .filter((row): row is string => Boolean(row));
  const allContractValues = contratosRows
    .map((row) => row.valorAtribuidoFornecedor)
    .filter((row): row is number => row !== null);

  const timeline: DossieTimelineEvent[] = [
    {
      id: `cadastro-${supplier.id}`,
      tipo: "Cadastro",
      titulo: "Cadastro do fornecedor",
      descricao: "Registro inicial do fornecedor no SIREL.",
      data: toDateValue(supplier.criadoEm),
      href: "/cadastros",
    },
    ...(allParticipationDates.length
      ? [
          {
            id: "primeira-participacao",
            tipo: "Participação",
            titulo: "Primeira participação identificada",
            descricao: "Primeiro evento concorrencial encontrado para o fornecedor.",
            data: [...allParticipationDates].sort((left, right) => compareNullableDatesDesc(right, left))[0],
            href: null,
          },
        ]
      : []),
    ...(allVictoryDates.length
      ? [
          {
            id: "primeira-vitoria",
            tipo: "Vitória",
            titulo: "Primeira vitória registrada",
            descricao: "Primeiro resultado vencedor localizado para o fornecedor.",
            data: [...allVictoryDates].sort((left, right) => compareNullableDatesDesc(right, left))[0],
            href: null,
          },
        ]
      : []),
    ...contratosRows.slice(0, 10).map((row) => ({
      id: `contrato-${row.contratoId}`,
      tipo: "Contrato",
      titulo: `Contrato ${row.numeroContrato}`,
      descricao: row.objetoResumido,
      data: row.vigenciaInicio ?? row.vigenciaFim,
      href: row.origem === "PNCP" && row.pncpUrl ? row.pncpUrl : "/contratos",
    })),
    ...auditRows
      .filter((row) => normalizeText(row.descricao).includes("unific"))
      .slice(0, 5)
      .map((row) => ({
        id: `audit-${row.id}`,
        tipo: "Unificação",
        titulo: "Unificação cadastral",
        descricao: row.descricao ?? "Registro proveniente de unificação.",
        data: toDateValue(row.criadoEm),
        href: "/cadastros",
      })),
  ].sort((left, right) => compareNullableDatesDesc(right.data, left.data));

  const resumo = {
    totalProcessos: distinctCount(participacoes.map((row) => row.processoId)),
    totalLicitacoes: distinctCount([
      ...participationRowsFiltered.map((row) =>
        row.licitacaoId ? `licitacao:${row.licitacaoId}` : `processo:${row.processoId}`,
      ),
      ...proposalRowsFiltered.map((row) =>
        row.licitacaoId ? `licitacao:${row.licitacaoId}` : `processo:${row.processoId}`,
      ),
      ...winnerRowsFiltered.map((row) => `processo:${row.processoId}`),
    ]),
    totalVitorias: vitorias.length,
    taxaVitoria:
      participacoes.length > 0
        ? Number(
            (
              (distinctCount(winnerRowsFiltered.map((row) => row.processoId)) /
                participacoes.length) *
              100
            ).toFixed(2),
          )
        : null,
    valorTotalOfertado: Number(
      [
        ...quoteRowsFiltered.map((row) => toNumber(row.valorTotal)),
        ...proposalRowsFiltered.map((row) => toNumber(row.valorTotalProposto)),
      ]
        .reduce((total, value) => total + value, 0)
        .toFixed(2),
    ),
    valorTotalVencido: Number(
      winnerRowsFiltered.reduce((total, row) => total + toNumber(row.valorVencedorTotal), 0).toFixed(2),
    ),
    valorTotalContratado: Number(
      allContractValues.reduce((total, value) => total + value, 0).toFixed(2),
    ),
    totalContratos: contratosRows.length,
    ticketMedioContrato:
      allContractValues.length ? Number(average(allContractValues)!.toFixed(2)) : null,
    totalItensOfertados: distinctCount(itens.map((row) => row.itemCatalogoId ?? row.itemLabel)),
    totalItensVencidos: distinctCount(
      itens.filter((row) => row.vencido > 0).map((row) => row.itemCatalogoId ?? row.itemLabel),
    ),
    primeiroRegistroHistorico:
      [toDateValue(supplier.criadoEm), ...allParticipationDates, ...allVictoryDates]
        .filter((row): row is string => Boolean(row))
        .sort((left, right) => compareNullableDatesDesc(right, left))[0] ?? null,
    ultimaParticipacao:
      [...allParticipationDates].sort((left, right) => compareNullableDatesDesc(left, right))[0] ??
      null,
    ultimaVitoria:
      [...allVictoryDates].sort((left, right) => compareNullableDatesDesc(left, right))[0] ?? null,
  };

  const insights: DossieInsight[] = [];
  if (supplierIdentityCount > 1) {
    pushInsight(insights, {
      id: "variacoes-cadastrais-legado",
      categoria: "Cadastro",
      titulo: "Variações cadastrais reconciliadas",
      descricao: `O dossiê consolidou ${supplierIdentityCount} registros/variações compatíveis do mesmo fornecedor para recompor histórico importado.`,
      severidade: "warning",
    });
  }
  if (resumo.totalProcessos >= 8) {
    pushInsight(insights, {
      id: "fornecedor-recorrente",
      categoria: "Recorrência",
      titulo: "Fornecedor muito recorrente",
      descricao: `O fornecedor participou de ${resumo.totalProcessos} processos no recorte atual.`,
      severidade: "info",
    });
  }
  if ((resumo.taxaVitoria ?? 0) >= 35 && resumo.totalProcessos >= 5) {
    pushInsight(insights, {
      id: "alta-taxa-vitoria",
      categoria: "Desempenho",
      titulo: "Alta taxa de vitória",
      descricao: "A taxa de êxito do fornecedor está acima do padrão esperado para o recorte filtrado.",
      severidade: "info",
    });
  }
  if (resumo.totalProcessos >= 5 && (resumo.taxaVitoria ?? 0) <= 10) {
    pushInsight(insights, {
      id: "baixa-conversao",
      categoria: "Atenção",
      titulo: "Muitas participações sem êxito",
      descricao: "O fornecedor acumula participações com baixa conversão em vitórias.",
      severidade: "warning",
    });
  }
  const topItem = itens[0];
  if (topItem && (topItem.participacaoVitoriasFornecedor ?? 0) >= 60) {
    pushInsight(insights, {
      id: "concentracao-itens",
      categoria: "Portfólio",
      titulo: "Concentração em poucos itens",
      descricao: `${topItem.itemLabel} concentra ${topItem.participacaoVitoriasFornecedor?.toFixed(1).replace(".", ",")}% das vitórias do fornecedor.`,
      severidade: "warning",
    });
  }
  const vitoriasPorSecretaria = new Map<string, number>();
  for (const row of winnerRowsFiltered) {
    vitoriasPorSecretaria.set(
      row.secretaria,
      (vitoriasPorSecretaria.get(row.secretaria) ?? 0) + 1,
    );
  }
  const topSecretaria = Array.from(vitoriasPorSecretaria.entries()).sort((left, right) => right[1] - left[1])[0];
  if (topSecretaria && resumo.totalVitorias > 0 && (topSecretaria[1] / resumo.totalVitorias) * 100 >= 60) {
    pushInsight(insights, {
      id: "concentracao-secretaria",
      categoria: "Dependência",
      titulo: "Forte presença em secretaria específica",
      descricao: `${topSecretaria[0]} responde pela maior parte das vitórias do fornecedor no período filtrado.`,
      severidade: "warning",
    });
  }

  const participacoesSeriesMap = new Map<string, { participacoes: number; vitorias: number }>();
  for (const date of allParticipationDates) {
    const key = buildMonthKey(date);
    if (!key) continue;
    const current = participacoesSeriesMap.get(key) ?? { participacoes: 0, vitorias: 0 };
    current.participacoes += 1;
    participacoesSeriesMap.set(key, current);
  }
  for (const date of allVictoryDates) {
    const key = buildMonthKey(date);
    if (!key) continue;
    const current = participacoesSeriesMap.get(key) ?? { participacoes: 0, vitorias: 0 };
    current.vitorias += 1;
    participacoesSeriesMap.set(key, current);
  }

  const valorVencidoPorAno = new Map<string, number>();
  for (const row of winnerRowsFiltered) {
    const key = buildYearKey(toDateValue(row.dataResultado));
    if (!key) continue;
    valorVencidoPorAno.set(
      key,
      (valorVencidoPorAno.get(key) ?? 0) + toNumber(row.valorVencedorTotal),
    );
  }

  const modalidadesMap = new Map<string, number>();
  for (const row of participacoes) {
    modalidadesMap.set(row.modalidade ?? "Não informado", (modalidadesMap.get(row.modalidade ?? "Não informado") ?? 0) + 1);
  }

  const heatmapMap = new Map<string, number>();
  for (const row of winnerRowsFiltered) {
    const year = buildYearKey(toDateValue(row.dataResultado)) ?? "Sem ano";
    const key = `${row.secretaria}|||${year}`;
    heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + 1);
  }

  return {
    identificacao: {
      id: supplier.id,
      razaoSocial: supplier.razaoSocial,
      nomeFantasia: null,
      documento: supplier.cnpj,
      situacaoCadastralInterna: supplier.ativo ? "Regular" : "Inativo",
      email: supplier.email,
      telefone: supplier.telefone,
      endereco: null,
      municipio: supplier.cidade,
      uf: supplier.estado,
      criadoEm: toDateValue(supplier.criadoEm),
      atualizadoEm: toDateValue(supplier.atualizadoEm),
      observacoes: null,
      status: supplier.ativo ? "Ativo" : "Inativo",
      registroUnificado,
    },
    resumo,
    filtrosDisponiveis: {
      modalidades: Array.from(
        new Map(
          participacoes
            .filter((row) => row.modalidadeId && row.modalidade)
            .map((row) => [
              row.modalidadeId!,
              { id: row.modalidadeId!, label: row.modalidade!, subtitle: null },
            ]),
        ).values(),
      ),
      secretarias: Array.from(
        new Map(
          participacoes.map((row) => [
            row.secretariaId,
            { id: row.secretariaId, label: row.secretaria, subtitle: null },
          ]),
        ).values(),
      ),
      processos: Array.from(
        new Map(
          participacoes.map((row) => [
            row.processoId,
            { id: row.processoId, label: row.numeroSirel, subtitle: row.objetoProcesso },
          ]),
        ).values(),
      ),
      contratos: contratosRows.map((row) => ({
        id: row.contratoId,
        label: row.numeroContrato,
        subtitle: row.processoNumeroSirel,
      })),
      itens: itens
        .filter((row) => row.itemCatalogoId !== null)
        .map((row) => ({
          id: row.itemCatalogoId!,
          label: row.itemLabel,
          subtitle: null,
        })),
      status: Array.from(
        new Set([
          ...participacoes.map((row) => row.statusFornecedor).filter(Boolean),
          ...ofertas.map((row) => row.resultado).filter(Boolean),
          ...vitorias.map((row) => row.statusPosterior).filter(Boolean),
          ...contratosRows.map((row) => row.status).filter(Boolean),
        ]),
      ).map((value) => ({ codigo: value!, nome: value! })),
    },
    participacoes,
    ofertas,
    vitorias,
    contratos: contratosRows,
    itens,
    timeline,
    insights,
    charts: {
      participacoesVitorias: Array.from(participacoesSeriesMap.entries())
        .sort((left, right) => left[0].localeCompare(right[0], "pt-BR"))
        .map(([key, value]) => ({
          chave: key,
          label: buildMonthLabel(key),
          valorA: value.participacoes,
          valorB: value.vitorias,
        })),
      valorVencidoPorAno: buildSeriesPoints(valorVencidoPorAno),
      modalidades: buildSeriesPoints(modalidadesMap),
      topItens: topSeries(
        Array.from(itemMap.values()).map((row) => ({
          label: row.itemLabel,
          value: row.valorVencidoTotal || row.vencido || row.ofertado,
        })),
      ),
      funil: [
        { chave: "participacoes", label: "Participações", valor: participacoes.length },
        {
          chave: "propostas-validas",
          label: "Propostas válidas",
          valor: proposalRowsFiltered.filter((row) => normalizeText(row.situacao).includes("valid")).length,
        },
        {
          chave: "classificacoes",
          label: "Classificações",
          valor: proposalRowsFiltered.filter((row) => row.classificacao !== null && row.classificacao !== undefined).length,
        },
        { chave: "vitorias", label: "Vitórias", valor: vitorias.length },
        { chave: "contratos", label: "Contratos", valor: contratosRows.length },
      ],
      heatmapSecretaria: Array.from(heatmapMap.entries()).map(([key, valor]) => {
        const [linha, coluna] = key.split("|||");
        return { linha, coluna, valor };
      }),
    },
    auditoria: {
      ultimaAtualizacaoCadastro: toDateValue(supplier.atualizadoEm),
      trilha: auditTrail,
      observacoesCriticas: [
        ...(registroUnificado ? ["O cadastro atual decorre de processo de unificação de duplicidades."] : []),
        ...(supplierIdentityCount > 1
          ? [
              `O dossiê conciliou ${supplierIdentityCount} cadastros/variações legadas compatíveis para recompor vitórias e valores históricos do fornecedor.`,
            ]
          : []),
        ...(auditTrail.some((row) => row.camposAlterados.includes("ativo")) ? ["O status cadastral do fornecedor sofreu alterações relevantes."] : []),
      ],
    },
  };
  throw new TRPCError({
    code: "NOT_IMPLEMENTED",
    message: "Dossiê do fornecedor ainda não implementado.",
  });
}
