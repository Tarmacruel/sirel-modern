import { existsSync, readFileSync } from "node:fs";

import {
  desc,
  eq,
  inArray,
} from "drizzle-orm";

import { requireDb } from "../db/client.js";
import {
  auditoriaValoresLicitacao,
  contratos,
  contratosPncp,
  fornecedores,
  licitacaoAtaSyncRuns,
  importacaoBllItensEspecificados,
  importacaoBllLotes,
  importacaoBllProcessos,
  importacaoPncpContratacoes,
  importacaoPncpContratos,
  importacaoPncpItensContratacao,
  itensProcesso,
  itensProcessoValores,
  lotes,
  processos,
} from "../db/schema.js";
import { PNCP_CONFIG } from "./pncp/config.js";
import { PNCPClientTeixeira } from "./pncp/pncp-client-teixeira.js";

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringValue(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function normalizeCompareText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeCompare(value: unknown) {
  return normalizeCompareText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function textSimilarity(left: unknown, right: unknown) {
  const a = new Set(tokenizeCompare(left));
  const b = new Set(tokenizeCompare(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function digitsOnly(value: unknown) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return digits || null;
}

function normalizeLotKey(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits) return String(Number(digits));
  return raw.toLowerCase();
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const parsed = toStringValue(value);
    if (parsed) return parsed;
  }
  return null;
}

function toDateOnly(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function diffDays(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  return Math.round(
    (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
  );
}

function roundMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 10000;
}

function normalizeLoteStatus(value: unknown) {
  const normalized = normalizeCompareText(value);
  if (!normalized) return "NAO_IDENTIFICADO";
  if (normalized.includes("homolog")) return "HOMOLOGADO";
  if (normalized.includes("fracass")) return "FRACASSADO";
  if (normalized.includes("desert")) return "DESERTO";
  if (normalized.includes("cancel")) return "CANCELADO";
  return String(value ?? "").trim().toUpperCase() || "NAO_IDENTIFICADO";
}

function parsePncpControl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{14})-\d+-(\d+)\/(\d{4})(?:-(\d+))?$/);
  if (!match) return null;
  return {
    cnpj: match[1],
    sequencial: Number(match[2]),
    ano: Number(match[3]),
  };
}

function derivePncpSearchUrl(controlId: string) {
  return `https://pncp.gov.br/app/contratos?q=${encodeURIComponent(controlId)}`;
}

function derivePncpTermsApiUrl(
  contractId: string,
  fallbackYear?: number | null,
  fallbackSequencial?: number | null,
  fallbackCnpj?: string | null,
) {
  const parsed = parsePncpControl(contractId);
  const ano = parsed?.ano ?? (fallbackYear ?? null);
  const sequencial = parsed?.sequencial ?? (fallbackSequencial ?? null);
  const cnpj =
    parsed?.cnpj ?? digitsOnly(fallbackCnpj) ?? PNCP_CONFIG.TEIXEIRA_FREITAS.cnpj;
  if (!ano || !sequencial || !cnpj) return null;
  return `${PNCP_CONFIG.API_BASE_PNCP}/v1/orgaos/${cnpj}/contratos/${ano}/${sequencial}/termos`;
}

function collectObjects(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectObjects(item));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      record,
      ...Object.values(record).flatMap((item) => collectObjects(item)),
    ];
  }
  return [];
}

function pickFirstMatchingUrl(
  values: unknown,
  matcher: (key: string, value: string) => boolean,
) {
  for (const record of collectObjects(values)) {
    for (const [key, rawValue] of Object.entries(record)) {
      const value = String(rawValue ?? "").trim();
      if (!value.startsWith("http")) continue;
      if (matcher(key.toLowerCase(), value)) return value;
    }
  }
  return null;
}

function pickFirstMatchingNumber(values: unknown, keys: string[]) {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  for (const record of collectObjects(values)) {
    for (const [key, rawValue] of Object.entries(record)) {
      if (!lowerKeys.has(key.toLowerCase())) continue;
      const parsed = toNumber(rawValue);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

type BuiltItemValue = {
  itemProcessoId: number;
  numeroItem: number;
  numeroLote: string | null;
  valorEstimadoUnitario: number | null;
  valorEstimadoTotal: number | null;
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
  origemAlteracao: string;
  statusResumo: string;
};

type BuiltItemValueMergeSource = Partial<BuiltItemValue>;

type ResultadoItemLike = {
  itemHomologado?: boolean | null;
  itemDeserto?: boolean | null;
  itemFracassado?: boolean | null;
  fornecedorVencedorId?: number | null;
  fornecedorVencedorNome?: string | null;
  fornecedorVencedorCnpj?: string | null;
  valorLanceVencedorUnitario?: unknown;
  valorLanceVencedorTotal?: unknown;
  statusResumo?: string | null;
};

type AtaParsedLotItem = {
  item_numero?: string | null;
  descricao?: string | null;
  quantidade?: number | null;
  valor_unitario?: number | null;
  valor_total?: number | null;
  valor_unitario_estimado?: number | null;
};

type AtaParsedLotParticipant = {
  section?: string | null;
  ranking?: number | null;
  razao_social?: string | null;
  documento?: string | null;
  oferta_inicial?: number | null;
  oferta_final?: number | null;
};

type AtaParsedLot = {
  numero_lote: number;
  status?: string | null;
  titulo?: string | null;
  itens?: AtaParsedLotItem[];
  participantes?: AtaParsedLotParticipant[];
  vencedor?: string | null;
  cnpj_vencedor?: string | null;
  melhor_lance?: number | null;
  motivo_falha?: string | null;
};

type AtaParsedPayload = {
  lotes?: AtaParsedLot[];
};

type AtaFallbackProcessItem = {
  id: number;
  numeroItem: number;
  loteId: number | null;
  loteNumero: string | number | null;
  descricao: string;
  quantidade: unknown;
  unidade: string;
  valorUnitarioEstimado: unknown;
  valorTotalEstimado: unknown;
};

function computeUnitPrice(totalValue: number | null, quantity: unknown) {
  if (totalValue === null) return null;
  const quantityNumber = toNumber(quantity);
  if (!quantityNumber || quantityNumber <= 0) return null;
  return totalValue / quantityNumber;
}

function buildAwardEconomyMetrics(
  valorEstimadoTotal: number | null,
  valorLanceVencedorTotal: number | null,
) {
  const economiaObtida =
    valorEstimadoTotal !== null && valorLanceVencedorTotal !== null
      ? roundMoney(valorEstimadoTotal - valorLanceVencedorTotal)
      : null;
  const percentualDesconto =
    valorEstimadoTotal !== null &&
    valorEstimadoTotal > 0 &&
    valorLanceVencedorTotal !== null
      ? roundPercent(
          ((valorEstimadoTotal - valorLanceVencedorTotal) / valorEstimadoTotal) *
            100,
        )
      : null;

  return {
    economiaObtida,
    percentualDesconto,
  };
}

export function hasAwardedResult(row: ResultadoItemLike) {
  if (row.itemFracassado || row.itemDeserto) return false;

  const fornecedorNome = String(row.fornecedorVencedorNome ?? "").trim();
  const fornecedorDocumento = String(row.fornecedorVencedorCnpj ?? "").trim();
  if (row.itemHomologado) return true;
  if (row.fornecedorVencedorId !== null && row.fornecedorVencedorId !== undefined) {
    return true;
  }
  return Boolean(fornecedorNome || fornecedorDocumento);
}

export function buildResultadoItemStatus(
  row: ResultadoItemLike,
  fallback = "SEM RESULTADO",
) {
  if (row.itemHomologado) return "HOMOLOGADO";
  if (row.itemFracassado) return "FRACASSADO";
  if (row.itemDeserto) return "DESERTO";
  if (hasAwardedResult(row)) {
    const explicitStatus = normalizeLoteStatus(row.statusResumo);
    return explicitStatus !== "NAO_IDENTIFICADO" ? explicitStatus : "ADJUDICADO";
  }
  return fallback;
}

function matchAtaLotToItem(
  lot: AtaParsedLot,
  items: AtaFallbackProcessItem[],
): {
  matchedItem: AtaFallbackProcessItem | null;
  score: number;
} {
  const parsedItems = Array.isArray(lot.itens) ? lot.itens : [];
  const primaryParsedItem = parsedItems[0] ?? null;
  const lotKey = normalizeLotKey(lot.numero_lote);
  const referenceTexts = [primaryParsedItem?.descricao, lot.titulo].filter(
    Boolean,
  );
  const directLotItems = lotKey
    ? items.filter((item) => normalizeLotKey(item.loteNumero) === lotKey)
    : [];

  if (directLotItems.length === 1) {
    return {
      matchedItem: directLotItems[0],
      score: 1,
    };
  }

  if (lotKey !== null) {
    const exactLotNumberItem =
      items.find((item) => String(item.numeroItem) === lotKey) ?? null;
    if (exactLotNumberItem) {
      return {
        matchedItem: exactLotNumberItem,
        score: 0.99,
      };
    }
  }

  const parsedItemNumero = Number(primaryParsedItem?.item_numero ?? 0);
  if (parsedItemNumero > 0) {
    const exactItem =
      items.find((item) => item.numeroItem === parsedItemNumero) ?? null;
    const exactItemTextScore = exactItem
      ? Math.max(
          ...referenceTexts.map((value) => textSimilarity(value, exactItem.descricao)),
          0,
        )
      : 0;
    const canTrustExactItemNumber =
      Boolean(exactItem) &&
      (normalizeLotKey(exactItem?.loteNumero) === lotKey ||
        parsedItemNumero === Number(lot.numero_lote) ||
        exactItemTextScore >= 0.75);

    if (exactItem && canTrustExactItemNumber) {
      return {
        matchedItem: exactItem,
        score: 0.98,
      };
    }
  }

  const candidates = items
    .map((item) => {
      const textScore = Math.max(
        ...referenceTexts.map((value) => textSimilarity(value, item.descricao)),
        0,
      );
      const lotBonus =
        normalizeLotKey(item.loteNumero) === lotKey && item.loteNumero !== null
          ? 0.1
          : 0;
      const score = Math.min(1, textScore + lotBonus);
      return score > 0 ? { item, score } : null;
    })
    .filter((entry): entry is { item: AtaFallbackProcessItem; score: number } =>
      Boolean(entry),
    )
    .sort(
      (left, right) =>
        right.score - left.score || left.item.numeroItem - right.item.numeroItem,
    );

  const best = candidates[0] ?? null;
  const second = candidates[1] ?? null;
  const lotNumberCandidate =
    lotKey !== null
      ? candidates.find(
          (candidate) =>
            String(candidate.item.numeroItem) === lotKey && candidate.score >= 0.65,
        ) ?? null
      : null;

  if (lotNumberCandidate) {
    return {
      matchedItem: lotNumberCandidate.item,
      score: Math.max(lotNumberCandidate.score, 0.97),
    };
  }

  if (best && best.score >= 0.65 && best.score - (second?.score ?? 0) >= 0.15) {
    return {
      matchedItem: best.item,
      score: best.score,
    };
  }

  return {
    matchedItem: null,
    score: best?.score ?? 0,
  };
}

function buildBaseItemValue(params: {
  item: {
    id: number;
    numeroItem: number;
    loteNumero: string | number | null;
    valorUnitarioEstimado: unknown;
    valorTotalEstimado: unknown;
  };
  dataHomologacao: string | null;
  origemAlteracao: string;
}) {
  return {
    itemProcessoId: params.item.id,
    numeroItem: params.item.numeroItem,
    numeroLote: firstString(params.item.loteNumero),
    valorEstimadoUnitario: roundMoney(firstNumber(params.item.valorUnitarioEstimado)),
    valorEstimadoTotal: roundMoney(firstNumber(params.item.valorTotalEstimado)),
    valorLanceVencedorUnitario: null,
    valorLanceVencedorTotal: null,
    percentualDesconto: null,
    economiaObtida: null,
    fornecedorVencedorId: null,
    fornecedorVencedorNome: null,
    fornecedorVencedorCnpj: null,
    itemHomologado: false,
    itemDeserto: false,
    itemFracassado: false,
    motivoFracasso: null,
    dataHomologacao: params.dataHomologacao,
    origemAlteracao: params.origemAlteracao,
    statusResumo: "NAO_IDENTIFICADO",
  } satisfies BuiltItemValue;
}

function findAtaWinnerParticipant(lot: AtaParsedLot) {
  const participants = Array.isArray(lot.participantes) ? lot.participantes : [];
  const classificados = participants
    .filter(
      (participant) =>
        normalizeCompareText(participant.section) === "classificacao",
    )
    .sort(
      (left, right) =>
        (firstNumber(left.ranking, 9999) ?? 9999) -
          (firstNumber(right.ranking, 9999) ?? 9999) ||
        (firstNumber(
          left.oferta_final,
          left.oferta_inicial,
          Number.MAX_SAFE_INTEGER,
        ) ?? Number.MAX_SAFE_INTEGER) -
          (firstNumber(
            right.oferta_final,
            right.oferta_inicial,
            Number.MAX_SAFE_INTEGER,
          ) ?? Number.MAX_SAFE_INTEGER),
    );

  return classificados[0] ?? null;
}

function buildAtaLotReferenceTotal(lot: AtaParsedLot) {
  const primaryItem = Array.isArray(lot.itens) ? (lot.itens[0] ?? null) : null;
  return firstNumber(
    lot.melhor_lance,
    primaryItem?.valor_total,
    primaryItem?.valor_unitario_estimado,
    primaryItem?.valor_unitario,
  );
}

export function mergeBuiltItemValueSources(params: {
  base: BuiltItemValue;
  ataFallback?: BuiltItemValueMergeSource | null;
  previous?: BuiltItemValueMergeSource | null;
}) {
  const merged: BuiltItemValue = { ...params.base };
  let origin = params.base.origemAlteracao;

  const mergeFrom = (candidate?: BuiltItemValueMergeSource | null) => {
    if (!candidate) return;

    let used = false;

    const fillNumber = (
      key:
        | "valorEstimadoUnitario"
        | "valorEstimadoTotal"
        | "valorLanceVencedorUnitario"
        | "valorLanceVencedorTotal"
        | "percentualDesconto"
        | "economiaObtida",
    ) => {
      const value = candidate[key];
      if (merged[key] === null && value !== null && value !== undefined) {
        merged[key] = value;
        used = true;
      }
    };

    const fillString = (
      key:
        | "numeroLote"
        | "fornecedorVencedorNome"
        | "fornecedorVencedorCnpj"
        | "motivoFracasso"
        | "dataHomologacao",
    ) => {
      const value = candidate[key];
      if (!merged[key] && value) {
        merged[key] = value;
        used = true;
      }
    };

    fillString("numeroLote");
    fillNumber("valorEstimadoUnitario");
    fillNumber("valorEstimadoTotal");
    fillNumber("valorLanceVencedorUnitario");
    fillNumber("valorLanceVencedorTotal");
    fillNumber("percentualDesconto");
    fillNumber("economiaObtida");
    fillString("fornecedorVencedorNome");
    fillString("fornecedorVencedorCnpj");
    fillString("motivoFracasso");
    fillString("dataHomologacao");

    if (
      (merged.fornecedorVencedorId === null ||
        merged.fornecedorVencedorId === undefined) &&
      candidate.fornecedorVencedorId !== null &&
      candidate.fornecedorVencedorId !== undefined
    ) {
      merged.fornecedorVencedorId = candidate.fornecedorVencedorId;
      used = true;
    }

    if (
      !merged.itemHomologado &&
      !merged.itemFracassado &&
      !merged.itemDeserto &&
      (candidate.itemHomologado || candidate.itemFracassado || candidate.itemDeserto)
    ) {
      merged.itemHomologado = Boolean(candidate.itemHomologado);
      merged.itemFracassado = Boolean(candidate.itemFracassado);
      merged.itemDeserto = Boolean(candidate.itemDeserto);
      if (candidate.motivoFracasso) {
        merged.motivoFracasso = candidate.motivoFracasso;
      }
      if (candidate.dataHomologacao) {
        merged.dataHomologacao = candidate.dataHomologacao;
      }
      used = true;
    }

    if (
      (!merged.statusResumo || merged.statusResumo === "NAO_IDENTIFICADO") &&
      candidate.statusResumo
    ) {
      merged.statusResumo = candidate.statusResumo;
      used = true;
    }

    if (used && candidate.origemAlteracao) {
      origin = candidate.origemAlteracao;
    }
  };

  mergeFrom(params.ataFallback ?? null);
  mergeFrom(params.previous ?? null);
  merged.origemAlteracao = origin;

  return merged;
}

async function loadAtaFallbackItemValues(params: {
  processoId: number;
  internalItems: Array<{
    id: number;
    numeroItem: number;
    loteId: number | null;
    loteNumero: string | number | null;
    descricao: string;
    quantidade: unknown;
    unidade: string;
    valorUnitarioEstimado: unknown;
    valorTotalEstimado: unknown;
  }>;
  supplierRows: Array<{
    id: number;
    razaoSocial: string;
    cnpj: string;
  }>;
  dataHomologacao: string | null;
  processoHomologado: boolean;
  origemAlteracao: string;
}) {
  const db = requireDb();
  const runs = await db
    .select({
      id: licitacaoAtaSyncRuns.id,
      status: licitacaoAtaSyncRuns.status,
      parsedJsonPath: licitacaoAtaSyncRuns.parsedJsonPath,
    })
    .from(licitacaoAtaSyncRuns)
    .where(eq(licitacaoAtaSyncRuns.processoId, params.processoId))
    .orderBy(
      desc(licitacaoAtaSyncRuns.aplicadoEm),
      desc(licitacaoAtaSyncRuns.atualizadoEm),
      desc(licitacaoAtaSyncRuns.id),
    )
    .limit(20);

  const selectedRun =
    runs.find((row) => row.status === "APPLIED" && row.parsedJsonPath) ??
    runs.find((row) => row.parsedJsonPath) ??
    null;

  if (!selectedRun?.parsedJsonPath || !existsSync(selectedRun.parsedJsonPath)) {
    return new Map<number, BuiltItemValueMergeSource>();
  }

  let payload: AtaParsedPayload | null = null;
  try {
    payload = JSON.parse(
      readFileSync(selectedRun.parsedJsonPath, "utf-8"),
    ) as AtaParsedPayload;
  } catch {
    return new Map<number, BuiltItemValueMergeSource>();
  }

  const suppliersByCnpj = new Map(
    params.supplierRows
      .map((row) => [digitsOnly(row.cnpj), row] as const)
      .filter(
        (entry): entry is readonly [string, (typeof params.supplierRows)[number]] =>
          Boolean(entry[0]),
      ),
  );
  const suppliersByName = new Map(
    params.supplierRows.map((row) => [
      normalizeCompareText(row.razaoSocial),
      row,
    ] as const),
  );
  const fallbackEntries = new Map<
    number,
    { score: number; row: BuiltItemValueMergeSource }
  >();

  for (const lot of Array.isArray(payload?.lotes) ? payload!.lotes! : []) {
    const match = matchAtaLotToItem(lot, params.internalItems);
    if (!match.matchedItem) {
      continue;
    }

    const winnerParticipant = findAtaWinnerParticipant(lot);
    const winnerName = firstString(
      lot.vencedor,
      winnerParticipant?.razao_social,
    );
    const winnerDocument = digitsOnly(
      firstString(lot.cnpj_vencedor, winnerParticipant?.documento),
    );
    const internalSupplier =
      (winnerDocument ? suppliersByCnpj.get(winnerDocument) : null) ??
      (winnerName
        ? suppliersByName.get(normalizeCompareText(winnerName))
        : null) ??
      null;
    const normalizedStatus = normalizeCompareText(lot.status);
    const itemDeserto = normalizedStatus.includes("desert");
    const itemFracassado =
      normalizedStatus.includes("fracass") ||
      normalizedStatus.includes("cancel");
    const hasWinnerSupplier =
      Boolean(internalSupplier?.id) ||
      Boolean(String(winnerName ?? "").trim()) ||
      Boolean(String(winnerDocument ?? "").trim());
    const awardedResult = !itemFracassado && !itemDeserto && hasWinnerSupplier;
    const valorLanceVencedorTotal = awardedResult
      ? roundMoney(buildAtaLotReferenceTotal(lot))
      : null;
    const quantidadeReferencia = firstNumber(
      match.matchedItem.quantidade,
      lot.itens?.[0]?.quantidade,
    );
    const valorEstimadoTotal = roundMoney(
      firstNumber(
        match.matchedItem.valorTotalEstimado,
        quantidadeReferencia !== null
          ? (() => {
              const valorUnitarioEstimado = firstNumber(
                match.matchedItem.valorUnitarioEstimado,
                lot.itens?.[0]?.valor_unitario_estimado,
              );
              return valorUnitarioEstimado !== null
                ? valorUnitarioEstimado * quantidadeReferencia
                : null;
            })()
          : null,
      ),
    );
    const valorLanceVencedorUnitario = awardedResult
      ? roundMoney(
          computeUnitPrice(
            valorLanceVencedorTotal,
            quantidadeReferencia,
          ),
        )
      : null;
    const { economiaObtida, percentualDesconto } = awardedResult
      ? buildAwardEconomyMetrics(valorEstimadoTotal, valorLanceVencedorTotal)
      : { economiaObtida: null, percentualDesconto: null };
    const itemHomologado =
      params.processoHomologado &&
      !itemDeserto &&
      !itemFracassado &&
      awardedResult;
    const statusResumo = buildResultadoItemStatus(
      {
        itemHomologado,
        itemDeserto,
        itemFracassado,
        fornecedorVencedorId: internalSupplier?.id ?? null,
        fornecedorVencedorNome:
          internalSupplier?.razaoSocial ?? winnerName ?? null,
        fornecedorVencedorCnpj: internalSupplier?.cnpj ?? winnerDocument ?? null,
        valorLanceVencedorTotal,
        statusResumo: lot.status ?? null,
      },
      normalizeLoteStatus(lot.status),
    );

    const current = fallbackEntries.get(match.matchedItem.id);
    if (current && current.score >= match.score) {
      continue;
    }

    fallbackEntries.set(match.matchedItem.id, {
      score: match.score,
      row: {
        numeroLote: String(lot.numero_lote),
        valorLanceVencedorUnitario,
        valorLanceVencedorTotal,
        percentualDesconto,
        economiaObtida,
        fornecedorVencedorId: internalSupplier?.id ?? null,
        fornecedorVencedorNome:
          internalSupplier?.razaoSocial ?? winnerName ?? null,
        fornecedorVencedorCnpj: internalSupplier?.cnpj ?? winnerDocument ?? null,
        itemHomologado,
        itemDeserto,
        itemFracassado,
        motivoFracasso:
          itemFracassado || itemDeserto
            ? firstString(lot.motivo_falha, lot.status)
            : null,
        dataHomologacao: itemHomologado ? params.dataHomologacao : null,
        origemAlteracao: `${params.origemAlteracao}:ATA_FALLBACK`,
        statusResumo,
      },
    });
  }

  return new Map(
    [...fallbackEntries.entries()].map(([itemId, entry]) => [itemId, entry.row]),
  );
}

async function buildItemValuesFromStoredImports(
  processoId: number,
  origemAlteracao: string,
) {
  const db = requireDb();

  const [processoRow, importedProcess, internalItems, supplierRows] =
    await Promise.all([
      db
        .select({
          id: processos.id,
          dataEncerramento: processos.dataEncerramento,
          dataPublicacao: processos.dataPublicacao,
          homologado: processos.homologado,
        })
        .from(processos)
        .where(eq(processos.id, processoId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          id: importacaoBllProcessos.id,
        })
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.processoInternoId, processoId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          id: itensProcesso.id,
          numeroItem: itensProcesso.numeroItem,
          loteId: itensProcesso.loteId,
          loteNumero: lotes.numeroLote,
          descricao: itensProcesso.descricao,
          quantidade: itensProcesso.quantidade,
          unidade: itensProcesso.unidade,
          valorUnitarioEstimado: itensProcesso.valorUnitarioEstimado,
          valorTotalEstimado: itensProcesso.valorTotalEstimado,
        })
        .from(itensProcesso)
        .leftJoin(lotes, eq(lotes.id, itensProcesso.loteId))
        .where(eq(itensProcesso.processoId, processoId)),
      db.select().from(fornecedores),
    ]);

  if (!processoRow || !internalItems.length) {
    return [] as BuiltItemValue[];
  }

  const homologationDate =
    toDateOnly(processoRow.dataEncerramento) ??
    (processoRow.homologado ? toDateOnly(processoRow.dataPublicacao) : null);
  const baseRows = internalItems.map((item) =>
    buildBaseItemValue({
      item,
      dataHomologacao: homologationDate,
      origemAlteracao,
    }),
  );
  const ataFallbackByItemId = await loadAtaFallbackItemValues({
    processoId,
    internalItems,
    supplierRows: supplierRows.map((row) => ({
      id: row.id,
      razaoSocial: row.razaoSocial,
      cnpj: row.cnpj,
    })),
    dataHomologacao: homologationDate,
    processoHomologado: Boolean(processoRow.homologado),
    origemAlteracao,
  });

  if (!importedProcess) {
    return baseRows.map((row) =>
      mergeBuiltItemValueSources({
        base: row,
        ataFallback: ataFallbackByItemId.get(row.itemProcessoId) ?? null,
      }),
    );
  }

  const [importedLots, importedSpecifiedItems] = await Promise.all([
    db
      .select()
      .from(importacaoBllLotes)
      .where(eq(importacaoBllLotes.processoImportadoId, importedProcess.id)),
    db
      .select()
      .from(importacaoBllItensEspecificados)
      .where(
        eq(importacaoBllItensEspecificados.processoImportadoId, importedProcess.id),
      ),
  ]);

  const suppliersByCnpj = new Map(
    supplierRows
      .map((row) => [digitsOnly(row.cnpj), row] as const)
      .filter(
        (entry): entry is readonly [string, (typeof supplierRows)[number]] =>
          Boolean(entry[0]),
      ),
  );
  const suppliersByName = new Map(
    supplierRows.map((row) => [normalizeCompareText(row.razaoSocial), row] as const),
  );
  const lotsByNumber = new Map<string, (typeof importedLots)[number]>();
  for (const row of importedLots) {
    const lotKey = normalizeLotKey(row.numero);
    if (!lotKey) continue;
    lotsByNumber.set(lotKey, row);
  }
  const specifiedByLotNumber = new Map<
    string,
    Array<(typeof importedSpecifiedItems)[number]>
  >();

  for (const row of importedSpecifiedItems) {
    const lotNumberRaw =
      importedLots.find((item) => item.id === row.loteImportadoId)?.numero ?? null;
    const lotNumber = normalizeLotKey(lotNumberRaw);
    if (!lotNumber) continue;
    const bucket = specifiedByLotNumber.get(lotNumber) ?? [];
    bucket.push(row);
    specifiedByLotNumber.set(lotNumber, bucket);
  }
  const lotAllocationByNumber = new Map<
    string,
    {
      totalReferenciaItens: number;
      fatorHomologado: number | null;
      quantidadeItens: number;
    }
  >();

  for (const [lotNumber, rows] of specifiedByLotNumber.entries()) {
    const lot = lotsByNumber.get(lotNumber) ?? null;
    const totalReferenciaItens = rows.reduce(
      (total, current) => total + (firstNumber(current.subtotalReferencia, 0) ?? 0),
      0,
    );
    const totalHomologadoLote = firstNumber(lot?.valorHomologado);
    lotAllocationByNumber.set(lotNumber, {
      totalReferenciaItens,
      fatorHomologado:
        totalHomologadoLote !== null && totalReferenciaItens > 0
          ? totalHomologadoLote / totalReferenciaItens
          : null,
      quantidadeItens: rows.length,
    });
  }

  return internalItems.map((item) => {
    const explicitLote = normalizeLotKey(item.loteNumero);
    const candidates = [explicitLote].filter(Boolean) as string[];
    const itemNumberCandidate = normalizeLotKey(item.numeroItem);
    if (!explicitLote && itemNumberCandidate) {
      candidates.push(itemNumberCandidate);
    }

    let matchedLot =
      candidates
        .map((candidate) => lotsByNumber.get(candidate))
        .find(Boolean) ?? null;

    if (!matchedLot && !explicitLote) {
      matchedLot =
        importedLots
          .map((lot) => ({
            lot,
            score: textSimilarity(item.descricao, lot.titulo),
          }))
          .filter((row) => row.score >= 0.72)
          .sort((left, right) => right.score - left.score)[0]?.lot ?? null;
    }

    const specifiedCandidates = matchedLot
      ? specifiedByLotNumber.get(normalizeLotKey(matchedLot.numero) ?? "") ?? []
      : [];
    const lotAllocation = matchedLot
      ? lotAllocationByNumber.get(normalizeLotKey(matchedLot.numero) ?? "") ?? null
      : null;
    const matchedSpecified =
      specifiedCandidates
        .map((row) => ({
          row,
          score: textSimilarity(
            item.descricao,
            row.especificacaoTecnica ?? row.descricaoResumida,
          ),
        }))
        .sort((left, right) => right.score - left.score)[0]?.row ?? null;

    const quantidade =
      firstNumber(item.quantidade, matchedSpecified?.quantidade, 0) ?? 0;
    const valorEstimadoTotal = roundMoney(
      firstNumber(
        matchedSpecified?.subtotalReferencia,
        matchedLot?.valorReferencia,
        quantidade > 0
          ? (() => {
              const unit = firstNumber(matchedSpecified?.valorReferenciaUnitario);
              return unit !== null ? unit * quantidade : null;
            })()
          : null,
        item.valorTotalEstimado,
      ),
    );
    const valorEstimadoUnitario = roundMoney(
      firstNumber(
        matchedSpecified?.valorReferenciaUnitario,
        quantidade > 0 && valorEstimadoTotal !== null
          ? valorEstimadoTotal / quantidade
          : null,
        item.valorUnitarioEstimado,
      ),
    );
    const valorLanceVencedorTotal = roundMoney(
      firstNumber(
        matchedSpecified?.subtotalHomologado,
        matchedSpecified?.subtotalReferencia !== null &&
          matchedSpecified?.subtotalReferencia !== undefined &&
          lotAllocation !== null &&
          lotAllocation.fatorHomologado !== null &&
          lotAllocation.quantidadeItens > 1
          ? firstNumber(matchedSpecified.subtotalReferencia, 0)! *
              lotAllocation.fatorHomologado
          : null,
        matchedLot?.valorHomologado,
      ),
    );
    const fornecedorVencedorNome = firstString(
      matchedSpecified?.fornecedorHomologado,
      matchedLot?.vencedor,
    );
    const fornecedorVencedorCnpj = digitsOnly(
      firstString(
        matchedSpecified?.dadosOriginais &&
          (matchedSpecified.dadosOriginais as Record<string, unknown>).cnpj,
      ),
    );
    const fornecedorInterno =
      (fornecedorVencedorCnpj
        ? suppliersByCnpj.get(fornecedorVencedorCnpj)
        : null) ??
      (fornecedorVencedorNome
        ? suppliersByName.get(normalizeCompareText(fornecedorVencedorNome))
        : null) ??
      null;
    const sourceStatusResumo = normalizeLoteStatus(matchedLot?.faseAtual);
    const itemHomologado = sourceStatusResumo === "HOMOLOGADO";
    const itemDeserto = sourceStatusResumo === "DESERTO";
    const itemFracassado = sourceStatusResumo === "FRACASSADO";
    const hasWinnerSupplier =
      Boolean(fornecedorInterno?.id) ||
      Boolean(String(fornecedorVencedorNome ?? "").trim()) ||
      Boolean(String(fornecedorVencedorCnpj ?? "").trim());
    const awardedResult = !itemFracassado && !itemDeserto && hasWinnerSupplier;
    const valorLanceVencedorUnitario = awardedResult
      ? roundMoney(
          firstNumber(
            matchedSpecified?.valorHomologadoUnitario,
            quantidade > 0 && valorLanceVencedorTotal !== null
              ? valorLanceVencedorTotal / quantidade
              : null,
          ),
        )
      : null;
    const { economiaObtida, percentualDesconto } = awardedResult
      ? buildAwardEconomyMetrics(valorEstimadoTotal, valorLanceVencedorTotal)
      : { economiaObtida: null, percentualDesconto: null };
    const statusResumo = buildResultadoItemStatus(
      {
        itemHomologado,
        itemDeserto,
        itemFracassado,
        fornecedorVencedorId: fornecedorInterno?.id ?? null,
        fornecedorVencedorNome:
          fornecedorInterno?.razaoSocial ?? fornecedorVencedorNome ?? null,
        fornecedorVencedorCnpj:
          fornecedorInterno?.cnpj ?? fornecedorVencedorCnpj ?? null,
        valorLanceVencedorUnitario,
        valorLanceVencedorTotal,
        statusResumo: sourceStatusResumo,
      },
      sourceStatusResumo,
    );

    const builtRow = {
      itemProcessoId: item.id,
      numeroItem: item.numeroItem,
      numeroLote: firstString(matchedLot?.numero, explicitLote),
      valorEstimadoUnitario,
      valorEstimadoTotal,
      valorLanceVencedorUnitario,
      valorLanceVencedorTotal: awardedResult ? valorLanceVencedorTotal : null,
      percentualDesconto,
      economiaObtida,
      fornecedorVencedorId: fornecedorInterno?.id ?? null,
      fornecedorVencedorNome:
        fornecedorInterno?.razaoSocial ?? fornecedorVencedorNome ?? null,
      fornecedorVencedorCnpj:
        fornecedorInterno?.cnpj ?? fornecedorVencedorCnpj ?? null,
      itemHomologado,
      itemDeserto,
      itemFracassado,
      motivoFracasso:
        itemFracassado || itemDeserto
          ? firstString(matchedLot?.faseAtual)
          : null,
      dataHomologacao: homologationDate,
      origemAlteracao,
      statusResumo,
    } satisfies BuiltItemValue;

    return mergeBuiltItemValueSources({
      base: builtRow,
      ataFallback: ataFallbackByItemId.get(item.id) ?? null,
    });
  });
}

export async function syncProcessItemValuesFromStoredImports(params: {
  processoId: number;
  userId?: number | null;
  justification?: string | null;
  origin?: string;
}) {
  const db = requireDb();
  const origin = params.origin ?? "DOSSIE_REFRESH";
  const builtRows = await buildItemValuesFromStoredImports(params.processoId, origin);
  if (!builtRows.length) {
    return {
      totalItens: 0,
      atualizados: 0,
      homologados: 0,
      fracassados: 0,
      desertos: 0,
    };
  }

  const existingRows = await db
    .select()
    .from(itensProcessoValores)
    .where(
      inArray(
        itensProcessoValores.itemProcessoId,
        builtRows.map((row) => row.itemProcessoId),
      ),
    );
  const currentByItemId = new Map(
    existingRows.map((row) => [row.itemProcessoId, row]),
  );
  const processItems = await db
    .select({
      id: itensProcesso.id,
      valorUnitarioEstimado: itensProcesso.valorUnitarioEstimado,
      valorTotalEstimado: itensProcesso.valorTotalEstimado,
    })
    .from(itensProcesso)
    .where(
      inArray(
        itensProcesso.id,
        builtRows.map((row) => row.itemProcessoId),
      ),
    );
  const processItemById = new Map(processItems.map((row) => [row.id, row]));
  const mergedRows = builtRows.map((row) => {
    const previous = currentByItemId.get(row.itemProcessoId) ?? null;
    const shouldPreservePreviousAwardData = !row.itemFracassado && !row.itemDeserto;
    return mergeBuiltItemValueSources({
      base: row,
      previous: previous
        ? {
            numeroLote: previous.numeroLote,
            valorEstimadoUnitario: toNumber(previous.valorEstimadoUnitario),
            valorEstimadoTotal: toNumber(previous.valorEstimadoTotal),
            valorLanceVencedorUnitario: shouldPreservePreviousAwardData
              ? toNumber(previous.valorLanceVencedorUnitario)
              : undefined,
            valorLanceVencedorTotal: shouldPreservePreviousAwardData
              ? toNumber(previous.valorLanceVencedorTotal)
              : undefined,
            percentualDesconto: shouldPreservePreviousAwardData
              ? toNumber(previous.percentualDesconto)
              : undefined,
            economiaObtida: shouldPreservePreviousAwardData
              ? toNumber(previous.economiaObtida)
              : undefined,
            fornecedorVencedorId: shouldPreservePreviousAwardData
              ? previous.fornecedorVencedorId
              : undefined,
            fornecedorVencedorNome: shouldPreservePreviousAwardData
              ? previous.fornecedorVencedorNome
              : undefined,
            fornecedorVencedorCnpj: shouldPreservePreviousAwardData
              ? previous.fornecedorVencedorCnpj
              : undefined,
            itemHomologado: previous.itemHomologado,
            itemDeserto: previous.itemDeserto,
            itemFracassado: previous.itemFracassado,
            motivoFracasso: previous.motivoFracasso,
            dataHomologacao: toDateOnly(previous.dataHomologacao),
            origemAlteracao: previous.origemAlteracao ?? undefined,
            statusResumo: previous.itemHomologado
              ? "HOMOLOGADO"
              : previous.itemFracassado
                ? "FRACASSADO"
                : previous.itemDeserto
                  ? "DESERTO"
                  : "NAO_IDENTIFICADO",
          }
        : null,
    });
  });

  let atualizados = 0;

  await db.transaction(async (tx) => {
    for (const row of mergedRows) {
      const previous = currentByItemId.get(row.itemProcessoId) ?? null;
      const previousEstimated = toNumber(previous?.valorEstimadoTotal);
      const previousWinner = toNumber(previous?.valorLanceVencedorTotal);

      await tx
        .insert(itensProcessoValores)
        .values({
          itemProcessoId: row.itemProcessoId,
          valorEstimadoUnitario:
            row.valorEstimadoUnitario !== null
              ? String(row.valorEstimadoUnitario)
              : null,
          valorEstimadoTotal:
            row.valorEstimadoTotal !== null ? String(row.valorEstimadoTotal) : null,
          valorLanceVencedorUnitario:
            row.valorLanceVencedorUnitario !== null
              ? String(row.valorLanceVencedorUnitario)
              : null,
          valorLanceVencedorTotal:
            row.valorLanceVencedorTotal !== null
              ? String(row.valorLanceVencedorTotal)
              : null,
          percentualDesconto:
            row.percentualDesconto !== null ? String(row.percentualDesconto) : null,
          economiaObtida:
            row.economiaObtida !== null ? String(row.economiaObtida) : null,
          fornecedorVencedorId: row.fornecedorVencedorId,
          fornecedorVencedorNome: row.fornecedorVencedorNome,
          fornecedorVencedorCnpj: row.fornecedorVencedorCnpj,
          itemHomologado: row.itemHomologado,
          itemDeserto: row.itemDeserto,
          itemFracassado: row.itemFracassado,
          motivoFracasso: row.motivoFracasso,
          dataHomologacao: row.dataHomologacao,
          numeroLote: row.numeroLote,
          origemAlteracao: row.origemAlteracao,
          atualizadoEm: new Date(),
        })
        .onConflictDoUpdate({
          target: [itensProcessoValores.itemProcessoId],
          set: {
            valorEstimadoUnitario:
              row.valorEstimadoUnitario !== null
                ? String(row.valorEstimadoUnitario)
                : null,
            valorEstimadoTotal:
              row.valorEstimadoTotal !== null
                ? String(row.valorEstimadoTotal)
                : null,
            valorLanceVencedorUnitario:
              row.valorLanceVencedorUnitario !== null
                ? String(row.valorLanceVencedorUnitario)
                : null,
            valorLanceVencedorTotal:
              row.valorLanceVencedorTotal !== null
                ? String(row.valorLanceVencedorTotal)
                : null,
            percentualDesconto:
              row.percentualDesconto !== null
                ? String(row.percentualDesconto)
                : null,
            economiaObtida:
              row.economiaObtida !== null ? String(row.economiaObtida) : null,
            fornecedorVencedorId: row.fornecedorVencedorId,
            fornecedorVencedorNome: row.fornecedorVencedorNome,
            fornecedorVencedorCnpj: row.fornecedorVencedorCnpj,
            itemHomologado: row.itemHomologado,
            itemDeserto: row.itemDeserto,
            itemFracassado: row.itemFracassado,
            motivoFracasso: row.motivoFracasso,
            dataHomologacao: row.dataHomologacao,
            numeroLote: row.numeroLote,
            origemAlteracao: row.origemAlteracao,
            atualizadoEm: new Date(),
          },
        });

      const processItem = processItemById.get(row.itemProcessoId);
      const currentEstimatedUnit = toNumber(processItem?.valorUnitarioEstimado);
      const currentEstimatedTotal = toNumber(processItem?.valorTotalEstimado);
      if (
        row.valorEstimadoUnitario !== null &&
        row.valorEstimadoTotal !== null &&
        (currentEstimatedUnit !== row.valorEstimadoUnitario ||
          currentEstimatedTotal !== row.valorEstimadoTotal)
      ) {
        await tx
          .update(itensProcesso)
          .set({
            valorUnitarioEstimado: String(row.valorEstimadoUnitario),
            valorTotalEstimado: String(row.valorEstimadoTotal),
            atualizadoEm: new Date(),
          })
          .where(eq(itensProcesso.id, row.itemProcessoId));
      }

      if (
        previousEstimated !== row.valorEstimadoTotal ||
        previousWinner !== row.valorLanceVencedorTotal
      ) {
        atualizados += 1;
        await tx.insert(auditoriaValoresLicitacao).values({
          itemProcessoId: row.itemProcessoId,
          valorEstimadoAnterior:
            previousEstimated !== null ? String(previousEstimated) : null,
          valorEstimadoNovo:
            row.valorEstimadoTotal !== null ? String(row.valorEstimadoTotal) : null,
          valorLanceAnterior:
            previousWinner !== null ? String(previousWinner) : null,
          valorLanceNovo:
            row.valorLanceVencedorTotal !== null
              ? String(row.valorLanceVencedorTotal)
              : null,
          origemAlteracao: origin,
          usuarioResponsavel: params.userId ?? null,
          justificativa:
            params.justification ??
            "Atualização automática dos valores da licitação a partir da base BLL.",
        });
      }
    }
  });

  return {
    totalItens: mergedRows.length,
    atualizados,
    homologados: mergedRows.filter((row) => row.itemHomologado).length,
    fracassados: mergedRows.filter((row) => row.itemFracassado).length,
    desertos: mergedRows.filter((row) => row.itemDeserto).length,
  };
}

function buildLinkedItemsBySupplier(
  linkedItems: Array<{
    itemProcessoId: number;
    numeroItem: number;
    numeroLote: string | null;
    descricao: string;
    unidade: string;
    quantidade: unknown;
    fornecedorVencedorNome: string | null;
    fornecedorVencedorCnpj: string | null;
    valorLanceVencedorTotal: unknown;
    valorEstimadoTotal: unknown;
  }>,
  supplierName: string | null,
  supplierCnpj: string | null,
) {
  const normalizedName = normalizeCompareText(supplierName);
  const digits = digitsOnly(supplierCnpj);
  return linkedItems
    .filter((item) => {
      if (digits && digitsOnly(item.fornecedorVencedorCnpj) === digits) {
        return true;
      }
      return (
        normalizedName &&
        normalizeCompareText(item.fornecedorVencedorNome) === normalizedName
      );
    })
    .map((item) => ({
      itemProcessoId: item.itemProcessoId,
      numeroItem: item.numeroItem,
      numeroLote: item.numeroLote,
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade: toNumber(item.quantidade),
      valorVencedor: toNumber(item.valorLanceVencedorTotal),
      valorEstimado: toNumber(item.valorEstimadoTotal),
    }));
}

export async function syncPncpContractsForProcess(params: {
  processoId: number;
  origin?: string;
  fetchLiveDetails?: boolean;
}) {
  const db = requireDb();
  const origin = params.origin ?? "DOSSIE_REFRESH";
  const importedContracts = await db
    .select()
    .from(importacaoPncpContratos)
    .where(eq(importacaoPncpContratos.processoInternoId, params.processoId))
    .orderBy(
      desc(importacaoPncpContratos.dataAssinatura),
      desc(importacaoPncpContratos.id),
    );

  if (!importedContracts.length) {
    await db
      .delete(contratosPncp)
      .where(eq(contratosPncp.processoId, params.processoId));
    return { atualizados: 0, total: 0 };
  }

  const [supplierRows, linkedItems] = await Promise.all([
    db.select().from(fornecedores),
    db
      .select({
        itemProcessoId: itensProcessoValores.itemProcessoId,
        numeroItem: itensProcesso.numeroItem,
        numeroLote: itensProcessoValores.numeroLote,
        descricao: itensProcesso.descricao,
        unidade: itensProcesso.unidade,
        quantidade: itensProcesso.quantidade,
        fornecedorVencedorNome: itensProcessoValores.fornecedorVencedorNome,
        fornecedorVencedorCnpj: itensProcessoValores.fornecedorVencedorCnpj,
        valorLanceVencedorTotal: itensProcessoValores.valorLanceVencedorTotal,
        valorEstimadoTotal: itensProcessoValores.valorEstimadoTotal,
      })
      .from(itensProcessoValores)
      .innerJoin(
        itensProcesso,
        eq(itensProcesso.id, itensProcessoValores.itemProcessoId),
      )
      .where(eq(itensProcesso.processoId, params.processoId)),
  ]);

  const suppliersByCnpj = new Map(
    supplierRows
      .map((row) => [digitsOnly(row.cnpj), row] as const)
      .filter(
        (entry): entry is readonly [string, (typeof supplierRows)[number]] =>
          Boolean(entry[0]),
      ),
  );
  const suppliersByName = new Map(
    supplierRows.map((row) => [normalizeCompareText(row.razaoSocial), row] as const),
  );
  const rawPurchaseIds = importedContracts
    .map((row) =>
      firstString(
        row.dadosOriginais &&
          (row.dadosOriginais as Record<string, unknown>).numeroControlePncpCompra,
        row.dadosOriginais &&
          (row.dadosOriginais as Record<string, unknown>).numeroControlePNCPCompra,
      ),
    )
    .filter((value): value is string => Boolean(value));
  const importedPurchases = rawPurchaseIds.length
    ? await db
        .select()
        .from(importacaoPncpContratacoes)
        .where(
          inArray(importacaoPncpContratacoes.numeroControlePncp, rawPurchaseIds),
        )
    : [];
  const purchaseByControl = new Map(
    importedPurchases.map((row) => [row.numeroControlePncp, row] as const),
  );
  const purchaseItems = importedPurchases.length
    ? await db
        .select()
        .from(importacaoPncpItensContratacao)
        .where(
          inArray(
            importacaoPncpItensContratacao.contratacaoId,
            importedPurchases.map((row) => row.id),
          ),
        )
    : [];
  const itemsByPurchaseId = new Map<
    number,
    Array<(typeof purchaseItems)[number]>
  >();
  for (const row of purchaseItems) {
    const bucket = itemsByPurchaseId.get(row.contratacaoId) ?? [];
    bucket.push(row);
    itemsByPurchaseId.set(row.contratacaoId, bucket);
  }

  const pncpClient = params.fetchLiveDetails ? new PNCPClientTeixeira() : null;
  let atualizados = 0;

  await db.transaction(async (tx) => {
    await tx
      .delete(contratosPncp)
      .where(eq(contratosPncp.processoId, params.processoId));

    for (const imported of importedContracts) {
      const raw = (imported.dadosOriginais ?? {}) as Record<string, unknown>;
      const contractId = imported.idContratoPncp;
      const supplierName = firstString(
        imported.fornecedorNome,
        raw.nomeRazaoSocialFornecedor,
      );
      const supplierCnpj = digitsOnly(
        firstString(imported.fornecedorDocumento, raw.niFornecedor),
      );
      const internalSupplier =
        (supplierCnpj ? suppliersByCnpj.get(supplierCnpj) : null) ??
        (supplierName
          ? suppliersByName.get(normalizeCompareText(supplierName))
          : null) ??
        null;
      const contractYear =
        Number(raw.anoContrato ?? parsePncpControl(contractId)?.ano ?? 0) || null;
      const parsedControl = parsePncpControl(contractId);
      const apiUrl = derivePncpTermsApiUrl(
        contractId,
        contractYear,
        parsedControl?.sequencial ?? null,
        typeof raw.orgaoEntidade === "object" && raw.orgaoEntidade
          ? firstString((raw.orgaoEntidade as Record<string, unknown>).cnpj)
          : null,
      );
      let liveTerms: unknown = null;
      if (pncpClient && parsedControl) {
        try {
          const response = await pncpClient.fetchTermosContrato(
            parsedControl.ano,
            parsedControl.sequencial,
            parsedControl.cnpj,
          );
          liveTerms = response.data;
        } catch {
          liveTerms = null;
        }
      }

      const contratoSearchUrl =
        imported.urlContrato ??
        pickFirstMatchingUrl(liveTerms, (key) => key.includes("url")) ??
        derivePncpSearchUrl(contractId);
      const documentoContratoUrl =
        pickFirstMatchingUrl(
          liveTerms ?? raw,
          (key, value) =>
            key.includes("contrato") ||
            key.includes("termo") ||
            value.toLowerCase().includes("contrato"),
        ) ?? imported.urlContrato;
      const documentoEmpenhoUrl = pickFirstMatchingUrl(
        liveTerms ?? raw,
        (key, value) =>
          key.includes("empenho") || value.toLowerCase().includes("empenho"),
      );
      const linkedPurchaseControl = firstString(
        raw.numeroControlePncpCompra,
        raw.numeroControlePNCPCompra,
      );
      const linkedPurchase = linkedPurchaseControl
        ? purchaseByControl.get(linkedPurchaseControl) ?? null
        : null;
      const linkedPurchaseItems = linkedPurchase
        ? (itemsByPurchaseId.get(linkedPurchase.id) ?? [])
            .filter((item) => {
              if (supplierCnpj && digitsOnly(item.fornecedorDocumento) === supplierCnpj) {
                return true;
              }
              if (supplierName) {
                return (
                  normalizeCompareText(item.fornecedorNome) ===
                  normalizeCompareText(supplierName)
                );
              }
              return false;
            })
            .map((item) => ({
              numeroItem: item.numeroItem,
              descricao: item.descricao,
              unidade: item.unidade,
              quantidade: toNumber(item.quantidade),
              valorUnitario: toNumber(item.valorUnitario),
              valorTotal: toNumber(item.valorTotal),
            }))
        : [];
      const linkedInternalItems = buildLinkedItemsBySupplier(
        linkedItems,
        supplierName,
        supplierCnpj,
      );
      const startDate = toDateOnly(imported.dataInicioVigencia);
      const endDate = toDateOnly(imported.dataFimVigencia);
      const valorEmpenhado = roundMoney(
        pickFirstMatchingNumber(liveTerms ?? raw, [
          "valorEmpenhado",
          "valor_empenhado",
        ]),
      );
      const valorLiquidado = roundMoney(
        pickFirstMatchingNumber(liveTerms ?? raw, [
          "valorLiquidado",
          "valor_liquidado",
        ]),
      );
      const valorPago = roundMoney(
        pickFirstMatchingNumber(liveTerms ?? raw, ["valorPago", "valor_pago"]),
      );

      await tx.insert(contratosPncp).values({
        processoId: params.processoId,
        pncpContractId: contractId,
        pncpProcessId: firstString(linkedPurchaseControl, raw.processo),
        pncpUrl: contratoSearchUrl,
        pncpApiUrl: apiUrl,
        numeroContrato: imported.numeroContrato,
        anoContrato: contractYear,
        objetoContrato: imported.objeto,
        valorTotalContrato:
          imported.valorTotal !== null ? String(imported.valorTotal) : null,
        valorEmpenhado:
          valorEmpenhado !== null ? String(valorEmpenhado) : null,
        valorLiquidado:
          valorLiquidado !== null ? String(valorLiquidado) : null,
        valorPago: valorPago !== null ? String(valorPago) : null,
        dataAssinatura: toDateOnly(imported.dataAssinatura),
        dataInicioVigencia: startDate,
        dataFimVigencia: endDate,
        diasVigencia: diffDays(startDate, endDate),
        fornecedorId: internalSupplier?.id ?? null,
        fornecedorNome: internalSupplier?.razaoSocial ?? supplierName,
        fornecedorCnpj: internalSupplier?.cnpj ?? supplierCnpj,
        statusContrato: firstString(imported.situacao, raw.status),
        itensVinculados: [...linkedPurchaseItems, ...linkedInternalItems],
        urlDocumentoContrato: documentoContratoUrl,
        urlDocumentoEmpenho: documentoEmpenhoUrl,
        ultimaSincronizacaoPncp: new Date(),
        dadosCompletosPncp: {
          origem: origin,
          importado: raw,
          termos: liveTerms,
        },
        atualizadoEm: new Date(),
      });

      atualizados += 1;
    }
  });

  return {
    total: importedContracts.length,
    atualizados,
  };
}

export async function calculateResumoFinanceiroProcesso(processoId: number) {
  const db = requireDb();
  const [itemRows, processRow, internalContractRows, pncpContractRows, lastSync] =
    await Promise.all([
      db
        .select({
          itemId: itensProcesso.id,
          itemHomologado: itensProcessoValores.itemHomologado,
          itemDeserto: itensProcessoValores.itemDeserto,
          itemFracassado: itensProcessoValores.itemFracassado,
          fornecedorVencedorId: itensProcessoValores.fornecedorVencedorId,
          fornecedorVencedorNome: itensProcessoValores.fornecedorVencedorNome,
          fornecedorVencedorCnpj: itensProcessoValores.fornecedorVencedorCnpj,
          valorEstimadoTotal: itensProcessoValores.valorEstimadoTotal,
          valorLanceVencedorTotal: itensProcessoValores.valorLanceVencedorTotal,
        })
        .from(itensProcesso)
        .leftJoin(
          itensProcessoValores,
          eq(itensProcessoValores.itemProcessoId, itensProcesso.id),
        )
        .where(eq(itensProcesso.processoId, processoId)),
      db
        .select({
          valorEstimado: processos.valorEstimado,
          valorHomologado: processos.valorHomologado,
        })
        .from(processos)
        .where(eq(processos.id, processoId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({
          valorContrato: contratos.valorContrato,
        })
        .from(contratos)
        .where(eq(contratos.processoId, processoId)),
      db
        .select({
          valorContrato: contratosPncp.valorTotalContrato,
        })
        .from(contratosPncp)
        .where(eq(contratosPncp.processoId, processoId)),
      db
        .select({
          atualizadoEm: itensProcessoValores.atualizadoEm,
        })
        .from(itensProcessoValores)
        .innerJoin(
          itensProcesso,
          eq(itensProcesso.id, itensProcessoValores.itemProcessoId),
        )
        .where(eq(itensProcesso.processoId, processoId))
        .orderBy(desc(itensProcessoValores.atualizadoEm))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

  const totalItens = itemRows.length;
  const itensHomologados = itemRows.filter((row) => row.itemHomologado).length;
  const itensFracassados = itemRows.filter((row) => row.itemFracassado).length;
  const itensDesertos = itemRows.filter((row) => row.itemDeserto).length;
  const awardedItemRows = itemRows.filter((row) => hasAwardedResult(row));
  const valorEstimadoTotal =
    itemRows.reduce((total, row) => total + (toNumber(row.valorEstimadoTotal) ?? 0), 0) ||
    (toNumber(processRow?.valorEstimado) ?? 0);
  const valorContratadoTotal =
    internalContractRows.reduce(
      (total, row) => total + (toNumber(row.valorContrato) ?? 0),
      0,
    ) +
    pncpContractRows.reduce(
      (total, row) => total + (toNumber(row.valorContrato) ?? 0),
      0,
    );
  const valorEstimadoEconomiaBase =
    awardedItemRows.reduce(
      (total, row) => total + (toNumber(row.valorEstimadoTotal) ?? 0),
      0,
    ) || (awardedItemRows.length ? 0 : toNumber(processRow?.valorEstimado) ?? 0);
  const valorVencedorTotal =
    awardedItemRows.reduce(
      (total, row) => total + (toNumber(row.valorLanceVencedorTotal) ?? 0),
      0,
    ) || (awardedItemRows.length ? 0 : toNumber(processRow?.valorHomologado) ?? 0);
  const economiaTotal =
    roundMoney(valorEstimadoEconomiaBase - valorVencedorTotal) ?? 0;
  const percentualEconomia =
    valorEstimadoEconomiaBase > 0
      ? roundPercent((economiaTotal / valorEstimadoEconomiaBase) * 100)
      : null;

  return {
    valorEstimadoTotal,
    valorContratadoTotal,
    valorVencedorTotal,
    economiaTotal,
    percentualEconomia,
    itensHomologados,
    itensFracassados,
    itensDesertos,
    totalItens,
    percentualHomologacao:
      totalItens > 0 ? roundPercent((itensHomologados / totalItens) * 100) : null,
    ultimaSincronizacaoFinanceira: toDateOnly(lastSync?.atualizadoEm),
  };
}

export async function refreshDossieAutonomoProcesso(params: {
  processoId: number;
  userId?: number | null;
  justification?: string | null;
  includeLivePncp?: boolean;
}) {
  const values = await syncProcessItemValuesFromStoredImports({
    processoId: params.processoId,
    userId: params.userId,
    justification: params.justification,
    origin: "DOSSIE_REFRESH",
  });
  const pncp = await syncPncpContractsForProcess({
    processoId: params.processoId,
    origin: "DOSSIE_REFRESH",
    fetchLiveDetails: params.includeLivePncp ?? true,
  });
  const resumo = await calculateResumoFinanceiroProcesso(params.processoId);
  return {
    values,
    pncp,
    resumo,
  };
}
