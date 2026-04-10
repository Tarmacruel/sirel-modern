import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";

import {
  contratos,
  cotacoes,
  fornecedores,
  itensProcesso,
  itensProcessoValores,
  licitacoes,
  licitantes,
  processos,
} from "../db/schema.js";
import {
  buildFornecedorLookupTokens,
  canonicalFornecedorId,
  fornecedorNamesLikelySame,
  fornecedorTokenSimilarity,
  loadFornecedorMergeAliasMap,
  normalizeFornecedorDocumentKey,
  normalizeFornecedorText,
  resolveFornecedorReference,
  tokenizeFornecedorNome,
  type FornecedorIdentityRecord,
} from "./fornecedor-identidade.js";

type SupplierTargetRow = {
  id: number;
  processoId: number;
  itemProcessoId: number;
  numeroItem: number;
  itemDescricao: string;
  dataHomologacao: Date | string | null;
  itemHomologado: boolean;
  itemFracassado: boolean;
  itemDeserto: boolean;
  fornecedorVencedorId: number | null;
  fornecedorVencedorNome: string | null;
  fornecedorVencedorCnpj: string | null;
  origemAlteracao: string | null;
  numeroSirel: string;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  objeto: string;
};

type SupplierResolutionCandidate = {
  supplier: FornecedorIdentityRecord;
  score: number;
  reasons: string[];
};

type EvaluatedFornecedorWinnerRow = SupplierTargetRow & {
  situacaoItem: string;
  preferredSupplierIds: number[];
  resolvedSupplier: FornecedorIdentityRecord | null;
  currentSupplier: FornecedorIdentityRecord | null;
  updateRequired: boolean;
  suggestionSupplier: FornecedorIdentityRecord | null;
  suggestionScore: number;
  suggestionConfidence: "ALTA" | "MEDIA" | "BAIXA" | "SEM_CORRESPONDENCIA";
  suggestionReasons: string[];
  pendingReasons: string[];
};

export interface FornecedorVencedorBackfillPreviewRow {
  id: number;
  processoId: number;
  itemProcessoId: number;
  numeroItem: number;
  itemDescricao: string;
  dataHomologacao: Date | string | null;
  situacaoItem: string;
  numeroSirel: string;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  objeto: string;
  fornecedorVencedorId: number | null;
  fornecedorVencedorNome: string | null;
  fornecedorVencedorCnpj: string | null;
  fornecedorAtualNome: string | null;
  fornecedorAtualCnpj: string | null;
  fornecedorSugeridoId: number | null;
  fornecedorSugeridoNome: string | null;
  fornecedorSugeridoCnpj: string | null;
  confidence: "ALTA" | "MEDIA" | "BAIXA" | "SEM_CORRESPONDENCIA";
  reasonSummary: string[];
  origemAlteracao: string | null;
};

export interface FornecedorVencedorBackfillPreviewInput {
  search?: string | null;
  onlyWithSuggestion?: boolean;
  processoId?: number;
  page?: number;
  pageSize?: number;
}

export interface FornecedorVencedorBackfillPreviewResult {
  generatedAt: Date;
  candidates: number;
  resolvableNow: number;
  pendingTotal: number;
  filteredTotal: number;
  absorbedSupplierIds: number;
  page: number;
  pageSize: number;
  totalPages: number;
  items: FornecedorVencedorBackfillPreviewRow[];
}

export interface FornecedorVencedorBackfillRunResult {
  generatedAt: Date;
  candidates: number;
  updated: number;
  nullIdRepairs: number;
  mergedIdRepairs: number;
  unresolved: number;
  absorbedSupplierIds: number;
  sampleUpdatedRows: Array<{
    id: number;
    processoId: number;
    numeroSirel: string;
    itemProcessoId: number;
    numeroItem: number;
    fornecedorVencedorId: number;
    fornecedorVencedorNome: string;
    fornecedorVencedorCnpj: string | null;
  }>;
}

export interface ConfirmFornecedorVencedorLinkInput {
  id: number;
  fornecedorId: number;
  reason?: string | null;
}

export interface ConfirmFornecedorVencedorLinkResult {
  id: number;
  processoId: number;
  numeroSirel: string;
  itemProcessoId: number;
  numeroItem: number;
  itemDescricao: string;
  fornecedorVencedorId: number;
  fornecedorVencedorNome: string;
  fornecedorVencedorCnpj: string | null;
  origemAlteracao: string | null;
  reason: string | null;
}

export interface ConfirmFornecedorVencedorLinksBatchInput {
  ids: number[];
  fornecedorId: number;
  reason?: string | null;
}

export interface ConfirmFornecedorVencedorLinksBatchResult {
  processoId: number;
  numeroSirel: string;
  fornecedorVencedorId: number;
  fornecedorVencedorNome: string;
  fornecedorVencedorCnpj: string | null;
  updatedCount: number;
  itemIds: number[];
  itemNumbers: number[];
  reason: string | null;
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function buildItemStatus(row: Pick<SupplierTargetRow, "itemHomologado" | "itemFracassado" | "itemDeserto">) {
  if (row.itemHomologado) return "Homologado";
  if (row.itemFracassado) return "Fracassado";
  if (row.itemDeserto) return "Deserto";
  return "Pendente";
}

function scoreFornecedorCandidate(params: {
  reference: {
    fornecedorId?: number | null;
    nome?: string | null;
    cnpj?: string | null;
  };
  candidate: FornecedorIdentityRecord;
  mergeMap: Map<number, number>;
  preferredSupplierIds: Set<number>;
}) {
  const canonicalId =
    canonicalFornecedorId(params.candidate.id, params.mergeMap) ?? params.candidate.id;
  const explicitCanonicalId = canonicalFornecedorId(
    params.reference.fornecedorId ?? null,
    params.mergeMap,
  );
  const referenceDocKey = normalizeFornecedorDocumentKey(params.reference.cnpj);
  const candidateDocKey = normalizeFornecedorDocumentKey(params.candidate.cnpj);
  const normalizedReferenceName = normalizeFornecedorText(params.reference.nome);
  const candidateName = normalizeFornecedorText(params.candidate.razaoSocial);
  const referenceTokens = tokenizeFornecedorNome(params.reference.nome);
  const candidateTokens = tokenizeFornecedorNome(params.candidate.razaoSocial);

  const reasons: string[] = [];
  let score = 0;

  if (explicitCanonicalId && canonicalId === explicitCanonicalId) {
    score += 140;
    reasons.push("ID legado já aponta para cadastro correlato.");
  }
  if (referenceDocKey && candidateDocKey && referenceDocKey === candidateDocKey) {
    score += 120;
    reasons.push("Documento compatível com o cadastro sugerido.");
  }
  if (normalizedReferenceName && candidateName === normalizedReferenceName) {
    score += 95;
    reasons.push("Razão social idêntica ao registro legado.");
  } else if (
    fornecedorNamesLikelySame(params.reference.nome, params.candidate.razaoSocial)
  ) {
    score += 70;
    score += Math.round(
      fornecedorTokenSimilarity(referenceTokens, candidateTokens) * 20,
    );
    reasons.push("Razão social muito semelhante ao vencedor importado.");
  }
  if (params.preferredSupplierIds.has(canonicalId)) {
    score += 15;
    reasons.push("Fornecedor já aparece no mesmo processo.");
  }
  if (params.candidate.ativo) {
    score += 2;
  }

  return { score, reasons };
}

function confidenceFromScore(score: number) {
  if (score >= 100) return "ALTA" as const;
  if (score >= 75) return "MEDIA" as const;
  if (score >= 40) return "BAIXA" as const;
  return "SEM_CORRESPONDENCIA" as const;
}

function shortlistSuppliersForReference(params: {
  reference: {
    fornecedorId?: number | null;
    nome?: string | null;
    cnpj?: string | null;
  };
  mergeMap: Map<number, number>;
  supplierById: Map<number, FornecedorIdentityRecord>;
  suppliersByDoc: Map<string, FornecedorIdentityRecord[]>;
  suppliersByToken: Map<string, FornecedorIdentityRecord[]>;
  preferredSupplierIds: Set<number>;
}) {
  const shortlisted = new Map<number, FornecedorIdentityRecord>();
  const pushCandidate = (supplier: FornecedorIdentityRecord | null | undefined) => {
    if (!supplier) return;
    const canonicalId =
      canonicalFornecedorId(supplier.id, params.mergeMap) ?? supplier.id;
    const canonicalSupplier = params.supplierById.get(canonicalId) ?? supplier;
    shortlisted.set(canonicalSupplier.id, canonicalSupplier);
  };

  const explicitCanonicalId = canonicalFornecedorId(
    params.reference.fornecedorId ?? null,
    params.mergeMap,
  );
  if (explicitCanonicalId) {
    pushCandidate(params.supplierById.get(explicitCanonicalId));
  }

  const referenceDocKey = normalizeFornecedorDocumentKey(params.reference.cnpj);
  if (referenceDocKey) {
    for (const supplier of params.suppliersByDoc.get(referenceDocKey) ?? []) {
      pushCandidate(supplier);
    }
  }

  for (const preferredId of params.preferredSupplierIds) {
    pushCandidate(params.supplierById.get(preferredId));
  }

  for (const token of buildFornecedorLookupTokens(params.reference.nome)) {
    for (const supplier of params.suppliersByToken.get(token) ?? []) {
      pushCandidate(supplier);
    }
  }

  return Array.from(shortlisted.values());
}

function buildPendingReasons(params: {
  row: SupplierTargetRow;
  preferredSupplierIds: Set<number>;
  suggestion: SupplierResolutionCandidate | null;
  currentSupplier: FornecedorIdentityRecord | null;
}) {
  const reasons: string[] = [];

  if (params.row.fornecedorVencedorId && !params.currentSupplier) {
    reasons.push("O ID legado do vencedor não existe mais no cadastro atual.");
  }
  if (!normalizeFornecedorDocumentKey(params.row.fornecedorVencedorCnpj)) {
    reasons.push("O registro legado não trouxe documento válido do vencedor.");
  }
  if (tokenizeFornecedorNome(params.row.fornecedorVencedorNome).length < 2) {
    reasons.push("A identificação textual do vencedor é curta ou genérica.");
  }
  if (!params.preferredSupplierIds.size) {
    reasons.push("O processo não possui fornecedores correlatos suficientes para inferência automática.");
  }
  if (params.suggestion) {
    reasons.push(...params.suggestion.reasons);
    reasons.push("A melhor correspondência ficou abaixo da faixa segura para atualização automática.");
  } else {
    reasons.push("Nenhum cadastro atingiu confiança mínima para vinculação automática.");
  }

  return Array.from(new Set(reasons)).slice(0, 4);
}

async function loadPreferredSupplierIdsByProcess(
  db: any,
  processIds: number[],
  mergeMap: Map<number, number>,
) {
  if (!processIds.length) {
    return new Map<number, Set<number>>();
  }

  const [cotacaoRows, licitanteRows, contratoRows] = await Promise.all([
    db
      .select({
        processoId: cotacoes.processoId,
        fornecedorId: cotacoes.fornecedorId,
      })
      .from(cotacoes)
      .where(inArray(cotacoes.processoId, processIds)),
    db
      .select({
        processoId: licitacoes.processoId,
        fornecedorId: licitantes.fornecedorId,
      })
      .from(licitantes)
      .innerJoin(licitacoes, eq(licitacoes.id, licitantes.licitacaoId))
      .where(inArray(licitacoes.processoId, processIds)),
    db
      .select({
        processoId: contratos.processoId,
        fornecedorId: contratos.fornecedorId,
      })
      .from(contratos)
      .where(inArray(contratos.processoId, processIds)),
  ]);

  const preferredIdsByProcess = new Map<number, Set<number>>();
  const pushPreferred = (processoId: number, fornecedorId: number | null) => {
    const canonicalId = canonicalFornecedorId(fornecedorId, mergeMap);
    if (!canonicalId) return;
    const bucket = preferredIdsByProcess.get(processoId) ?? new Set<number>();
    bucket.add(canonicalId);
    preferredIdsByProcess.set(processoId, bucket);
  };

  for (const row of cotacaoRows) pushPreferred(row.processoId, row.fornecedorId);
  for (const row of licitanteRows) pushPreferred(row.processoId, row.fornecedorId);
  for (const row of contratoRows) pushPreferred(row.processoId, row.fornecedorId);

  return preferredIdsByProcess;
}

async function evaluateFornecedorWinnerRows(db: any) {
  const generatedAt = new Date();
  const mergeMap = await loadFornecedorMergeAliasMap(db);
  const absorbedSupplierIds = Array.from(mergeMap.keys());

  const supplierRows = (await db
    .select({
      id: fornecedores.id,
      razaoSocial: fornecedores.razaoSocial,
      cnpj: fornecedores.cnpj,
      ativo: fornecedores.ativo,
      email: fornecedores.email,
      telefone: fornecedores.telefone,
      cidade: fornecedores.cidade,
      estado: fornecedores.estado,
    })
    .from(fornecedores)
    .orderBy(asc(fornecedores.id))) as FornecedorIdentityRecord[];

  const targetWhere = absorbedSupplierIds.length
    ? or(
        and(
          isNull(itensProcessoValores.fornecedorVencedorId),
          or(
            isNotNull(itensProcessoValores.fornecedorVencedorNome),
            isNotNull(itensProcessoValores.fornecedorVencedorCnpj),
          ),
        ),
        inArray(itensProcessoValores.fornecedorVencedorId, absorbedSupplierIds),
      )
    : and(
        isNull(itensProcessoValores.fornecedorVencedorId),
        or(
          isNotNull(itensProcessoValores.fornecedorVencedorNome),
          isNotNull(itensProcessoValores.fornecedorVencedorCnpj),
        ),
      );

  const targetRows = (await db
    .select({
      id: itensProcessoValores.id,
      processoId: itensProcesso.processoId,
      itemProcessoId: itensProcesso.id,
      numeroItem: itensProcesso.numeroItem,
      itemDescricao: itensProcesso.descricao,
      dataHomologacao: itensProcessoValores.dataHomologacao,
      itemHomologado: itensProcessoValores.itemHomologado,
      itemFracassado: itensProcessoValores.itemFracassado,
      itemDeserto: itensProcessoValores.itemDeserto,
      fornecedorVencedorId: itensProcessoValores.fornecedorVencedorId,
      fornecedorVencedorNome: itensProcessoValores.fornecedorVencedorNome,
      fornecedorVencedorCnpj: itensProcessoValores.fornecedorVencedorCnpj,
      origemAlteracao: itensProcessoValores.origemAlteracao,
      numeroSirel: processos.numeroSirel,
      numeroAdministrativo: processos.numeroAdministrativo,
      numeroEdital: processos.numeroEdital,
      objeto: processos.objeto,
    })
    .from(itensProcessoValores)
    .innerJoin(itensProcesso, eq(itensProcesso.id, itensProcessoValores.itemProcessoId))
    .innerJoin(processos, eq(processos.id, itensProcesso.processoId))
    .where(targetWhere)
    .orderBy(asc(processos.numeroSirel), asc(itensProcesso.numeroItem))) as SupplierTargetRow[];

  if (!targetRows.length) {
    return {
      generatedAt,
      absorbedSupplierIds,
      rows: [] as EvaluatedFornecedorWinnerRow[],
    };
  }

  const processIds = Array.from(new Set(targetRows.map((row) => row.processoId)));
  const preferredIdsByProcess = await loadPreferredSupplierIdsByProcess(
    db,
    processIds,
    mergeMap,
  );

  const supplierById = new Map(
    supplierRows.map((row) => [row.id, row as FornecedorIdentityRecord]),
  );
  const suppliersByDoc = new Map<string, FornecedorIdentityRecord[]>();
  const suppliersByToken = new Map<string, FornecedorIdentityRecord[]>();

  for (const supplier of supplierRows) {
    const docKey = normalizeFornecedorDocumentKey(supplier.cnpj);
    if (docKey) {
      const docBucket = suppliersByDoc.get(docKey) ?? [];
      docBucket.push(supplier);
      suppliersByDoc.set(docKey, docBucket);
    }

    for (const token of buildFornecedorLookupTokens(supplier.razaoSocial)) {
      const tokenBucket = suppliersByToken.get(token) ?? [];
      tokenBucket.push(supplier);
      suppliersByToken.set(token, tokenBucket);
    }
  }

  const evaluatedRows = targetRows.map((row) => {
    const preferredSupplierIds = preferredIdsByProcess.get(row.processoId) ?? new Set<number>();
    const currentCanonicalId = canonicalFornecedorId(
      row.fornecedorVencedorId,
      mergeMap,
    );
    const currentSupplier = currentCanonicalId
      ? supplierById.get(currentCanonicalId) ?? null
      : null;
    const resolvedSupplier =
      currentSupplier ??
      resolveFornecedorReference({
        reference: {
          fornecedorId: row.fornecedorVencedorId,
          nome: row.fornecedorVencedorNome,
          cnpj: row.fornecedorVencedorCnpj,
        },
        suppliers: supplierRows,
        mergeMap,
        preferredSupplierIds,
      });

    const updateRequired = Boolean(
      resolvedSupplier &&
        (row.fornecedorVencedorId !== resolvedSupplier.id ||
          row.fornecedorVencedorNome !== resolvedSupplier.razaoSocial ||
          row.fornecedorVencedorCnpj !== resolvedSupplier.cnpj),
    );

    let suggestionSupplier: FornecedorIdentityRecord | null = null;
    let suggestionScore = 0;
    let suggestionReasons: string[] = [];

    if (!resolvedSupplier) {
      const shortlistedSuppliers = shortlistSuppliersForReference({
        reference: {
          fornecedorId: row.fornecedorVencedorId,
          nome: row.fornecedorVencedorNome,
          cnpj: row.fornecedorVencedorCnpj,
        },
        mergeMap,
        supplierById,
        suppliersByDoc,
        suppliersByToken,
        preferredSupplierIds,
      });

      const rankedCandidates = shortlistedSuppliers
        .map((supplier) => ({
          supplier,
          ...scoreFornecedorCandidate({
            reference: {
              fornecedorId: row.fornecedorVencedorId,
              nome: row.fornecedorVencedorNome,
              cnpj: row.fornecedorVencedorCnpj,
            },
            candidate: supplier,
            mergeMap,
            preferredSupplierIds,
          }),
        }))
        .filter((candidate) => candidate.score >= 35)
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.supplier.razaoSocial.localeCompare(
              right.supplier.razaoSocial,
              "pt-BR",
            ),
        );

      suggestionSupplier = rankedCandidates[0]?.supplier ?? null;
      suggestionScore = rankedCandidates[0]?.score ?? 0;
      suggestionReasons = rankedCandidates[0]?.reasons ?? [];
    }

    const pendingReasons = buildPendingReasons({
      row,
      preferredSupplierIds,
      suggestion: suggestionSupplier
        ? {
            supplier: suggestionSupplier,
            score: suggestionScore,
            reasons: suggestionReasons,
          }
        : null,
      currentSupplier,
    });

    return {
      ...row,
      situacaoItem: buildItemStatus(row),
      preferredSupplierIds: Array.from(preferredSupplierIds),
      resolvedSupplier,
      currentSupplier,
      updateRequired,
      suggestionSupplier,
      suggestionScore,
      suggestionConfidence: confidenceFromScore(suggestionScore),
      suggestionReasons,
      pendingReasons,
    } satisfies EvaluatedFornecedorWinnerRow;
  });

  return {
    generatedAt,
    absorbedSupplierIds,
    rows: evaluatedRows,
  };
}

function filterPendingRows(
  rows: EvaluatedFornecedorWinnerRow[],
  input: Pick<
    FornecedorVencedorBackfillPreviewInput,
    "search" | "onlyWithSuggestion" | "processoId"
  >,
) {
  let pendingRows = rows.filter((row) => !row.resolvedSupplier);
  if (input.processoId) {
    pendingRows = pendingRows.filter((row) => row.processoId === input.processoId);
  }
  if (input.onlyWithSuggestion) {
    pendingRows = pendingRows.filter((row) => Boolean(row.suggestionSupplier));
  }
  const normalizedSearch = normalizeFornecedorText(input.search);
  if (!normalizedSearch) {
    return pendingRows;
  }

  return pendingRows.filter((row) =>
    normalizeFornecedorText(
      [
        row.numeroSirel,
        row.numeroAdministrativo,
        row.numeroEdital,
        row.objeto,
        row.itemDescricao,
        row.fornecedorVencedorNome,
        row.fornecedorVencedorCnpj,
        row.currentSupplier?.razaoSocial,
        row.suggestionSupplier?.razaoSocial,
        row.pendingReasons.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    ).includes(normalizedSearch),
  );
}

export async function previewFornecedorVencedorBackfill(
  db: any,
  input: FornecedorVencedorBackfillPreviewInput,
): Promise<FornecedorVencedorBackfillPreviewResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, input.pageSize ?? 10));
  const evaluation = await evaluateFornecedorWinnerRows(db);
  const pendingRows = filterPendingRows(evaluation.rows, input);
  const totalPages = Math.max(1, Math.ceil(pendingRows.length / pageSize));
  const pageItems = pendingRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    generatedAt: evaluation.generatedAt,
    candidates: evaluation.rows.length,
    resolvableNow: evaluation.rows.filter((row) => row.updateRequired).length,
    pendingTotal: evaluation.rows.filter((row) => !row.resolvedSupplier).length,
    filteredTotal: pendingRows.length,
    absorbedSupplierIds: evaluation.absorbedSupplierIds.length,
    page,
    pageSize,
    totalPages,
    items: pageItems.map((row) => ({
      id: row.id,
      processoId: row.processoId,
      itemProcessoId: row.itemProcessoId,
      numeroItem: row.numeroItem,
      itemDescricao: row.itemDescricao,
      dataHomologacao: row.dataHomologacao,
      situacaoItem: row.situacaoItem,
      numeroSirel: row.numeroSirel,
      numeroAdministrativo: row.numeroAdministrativo,
      numeroEdital: row.numeroEdital,
      objeto: row.objeto,
      fornecedorVencedorId: row.fornecedorVencedorId,
      fornecedorVencedorNome: row.fornecedorVencedorNome,
      fornecedorVencedorCnpj: row.fornecedorVencedorCnpj,
      fornecedorAtualNome: row.currentSupplier?.razaoSocial ?? null,
      fornecedorAtualCnpj: row.currentSupplier?.cnpj ?? null,
      fornecedorSugeridoId: row.suggestionSupplier?.id ?? null,
      fornecedorSugeridoNome: row.suggestionSupplier?.razaoSocial ?? null,
      fornecedorSugeridoCnpj: row.suggestionSupplier?.cnpj ?? null,
      confidence: row.suggestionConfidence,
      reasonSummary: row.pendingReasons,
      origemAlteracao: row.origemAlteracao,
    })),
  };
}

async function loadFornecedorForManualConfirm(db: any, fornecedorId: number) {
  const [supplier] = (await db
    .select({
      id: fornecedores.id,
      razaoSocial: fornecedores.razaoSocial,
      cnpj: fornecedores.cnpj,
    })
    .from(fornecedores)
    .where(eq(fornecedores.id, fornecedorId))
    .limit(1)) as Array<{
    id: number;
    razaoSocial: string;
    cnpj: string | null;
  }>;

  if (!supplier) {
    throw new Error("Fornecedor informado para confirmação manual não foi encontrado.");
  }

  return supplier;
}

export async function confirmFornecedorVencedorLink(
  db: any,
  input: ConfirmFornecedorVencedorLinkInput,
): Promise<ConfirmFornecedorVencedorLinkResult> {
  const [targetRow] = (await db
    .select({
      id: itensProcessoValores.id,
      processoId: itensProcesso.processoId,
      itemProcessoId: itensProcesso.id,
      numeroItem: itensProcesso.numeroItem,
      itemDescricao: itensProcesso.descricao,
      fornecedorVencedorId: itensProcessoValores.fornecedorVencedorId,
      fornecedorVencedorNome: itensProcessoValores.fornecedorVencedorNome,
      fornecedorVencedorCnpj: itensProcessoValores.fornecedorVencedorCnpj,
      origemAlteracao: itensProcessoValores.origemAlteracao,
      numeroSirel: processos.numeroSirel,
    })
    .from(itensProcessoValores)
    .innerJoin(itensProcesso, eq(itensProcesso.id, itensProcessoValores.itemProcessoId))
    .innerJoin(processos, eq(processos.id, itensProcesso.processoId))
    .where(eq(itensProcessoValores.id, input.id))
    .limit(1)) as Array<{
    id: number;
    processoId: number;
    itemProcessoId: number;
    numeroItem: number;
    itemDescricao: string;
    fornecedorVencedorId: number | null;
    fornecedorVencedorNome: string | null;
    fornecedorVencedorCnpj: string | null;
    origemAlteracao: string | null;
    numeroSirel: string;
  }>;

  if (!targetRow) {
    throw new Error("Registro de vencedor importado não encontrado.");
  }

  const supplier = await loadFornecedorForManualConfirm(db, input.fornecedorId);

  const nextOrigemBase = targetRow.origemAlteracao
    ? `${targetRow.origemAlteracao}|SANEAMENTO_FORNECEDOR_MANUAL`
    : "SANEAMENTO_FORNECEDOR_MANUAL";
  const nextOrigem = nextOrigemBase.slice(0, 64);

  await db
    .update(itensProcessoValores)
    .set({
      fornecedorVencedorId: supplier.id,
      fornecedorVencedorNome: supplier.razaoSocial,
      fornecedorVencedorCnpj: supplier.cnpj,
      origemAlteracao: nextOrigem,
      atualizadoEm: new Date(),
    })
    .where(eq(itensProcessoValores.id, targetRow.id));

  return {
    id: targetRow.id,
    processoId: targetRow.processoId,
    numeroSirel: targetRow.numeroSirel,
    itemProcessoId: targetRow.itemProcessoId,
    numeroItem: targetRow.numeroItem,
    itemDescricao: targetRow.itemDescricao,
    fornecedorVencedorId: supplier.id,
    fornecedorVencedorNome: supplier.razaoSocial,
    fornecedorVencedorCnpj: supplier.cnpj,
    origemAlteracao: nextOrigem,
    reason: input.reason?.trim() ? input.reason.trim() : null,
  };
}

export async function confirmFornecedorVencedorLinksBatch(
  db: any,
  input: ConfirmFornecedorVencedorLinksBatchInput,
): Promise<ConfirmFornecedorVencedorLinksBatchResult> {
  const ids = Array.from(new Set(input.ids)).filter((id) => id > 0);
  if (!ids.length) {
    throw new Error("Nenhum item foi selecionado para confirmação manual em lote.");
  }

  const rows = (await db
    .select({
      id: itensProcessoValores.id,
      processoId: itensProcesso.processoId,
      itemProcessoId: itensProcesso.id,
      numeroItem: itensProcesso.numeroItem,
      itemDescricao: itensProcesso.descricao,
      fornecedorVencedorId: itensProcessoValores.fornecedorVencedorId,
      fornecedorVencedorNome: itensProcessoValores.fornecedorVencedorNome,
      fornecedorVencedorCnpj: itensProcessoValores.fornecedorVencedorCnpj,
      origemAlteracao: itensProcessoValores.origemAlteracao,
      numeroSirel: processos.numeroSirel,
    })
    .from(itensProcessoValores)
    .innerJoin(itensProcesso, eq(itensProcesso.id, itensProcessoValores.itemProcessoId))
    .innerJoin(processos, eq(processos.id, itensProcesso.processoId))
    .where(inArray(itensProcessoValores.id, ids))) as Array<{
    id: number;
    processoId: number;
    itemProcessoId: number;
    numeroItem: number;
    itemDescricao: string;
    fornecedorVencedorId: number | null;
    fornecedorVencedorNome: string | null;
    fornecedorVencedorCnpj: string | null;
    origemAlteracao: string | null;
    numeroSirel: string;
  }>;

  if (rows.length !== ids.length) {
    throw new Error("Um ou mais itens selecionados não foram encontrados para confirmação em lote.");
  }

  const processIds = Array.from(new Set(rows.map((row) => row.processoId)));
  if (processIds.length !== 1) {
    throw new Error("A confirmação manual em lote só pode ser aplicada a itens do mesmo processo.");
  }

  const supplier = await loadFornecedorForManualConfirm(db, input.fornecedorId);

  await db.transaction(async (tx: any) => {
    for (const row of rows) {
      const nextOrigemBase = row.origemAlteracao
        ? `${row.origemAlteracao}|SANEAMENTO_FORNECEDOR_MANUAL`
        : "SANEAMENTO_FORNECEDOR_MANUAL";
      const nextOrigem = nextOrigemBase.slice(0, 64);

      await tx
        .update(itensProcessoValores)
        .set({
          fornecedorVencedorId: supplier.id,
          fornecedorVencedorNome: supplier.razaoSocial,
          fornecedorVencedorCnpj: supplier.cnpj,
          origemAlteracao: nextOrigem,
          atualizadoEm: new Date(),
        })
        .where(eq(itensProcessoValores.id, row.id));
    }
  });

  return {
    processoId: rows[0]!.processoId,
    numeroSirel: rows[0]!.numeroSirel,
    fornecedorVencedorId: supplier.id,
    fornecedorVencedorNome: supplier.razaoSocial,
    fornecedorVencedorCnpj: supplier.cnpj,
    updatedCount: rows.length,
    itemIds: rows.map((row) => row.id),
    itemNumbers: rows.map((row) => row.numeroItem),
    reason: input.reason?.trim() ? input.reason.trim() : null,
  };
}

export async function runFornecedorVencedorBackfill(
  db: any,
): Promise<FornecedorVencedorBackfillRunResult> {
  const evaluation = await evaluateFornecedorWinnerRows(db);
  const updatableRows = evaluation.rows.filter(
    (row) => row.resolvedSupplier && row.updateRequired,
  );

  let nullIdRepairs = 0;
  let mergedIdRepairs = 0;

  const updates = updatableRows.map((row) => {
    const resolved = row.resolvedSupplier!;
    const nextOrigem = row.origemAlteracao
      ? `${row.origemAlteracao}|SANEAMENTO_FORNECEDOR`
      : "SANEAMENTO_FORNECEDOR";

    if (row.fornecedorVencedorId === null) {
      nullIdRepairs += 1;
    } else if (row.fornecedorVencedorId !== resolved.id) {
      mergedIdRepairs += 1;
    }

    return {
      id: row.id,
      processoId: row.processoId,
      numeroSirel: row.numeroSirel,
      itemProcessoId: row.itemProcessoId,
      numeroItem: row.numeroItem,
      fornecedorVencedorId: resolved.id,
      fornecedorVencedorNome: resolved.razaoSocial,
      fornecedorVencedorCnpj: resolved.cnpj,
      origemAlteracao: nextOrigem.slice(0, 64),
    };
  });

  for (const batch of chunk(updates, 200)) {
    await db.transaction(async (tx: any) => {
      for (const row of batch) {
        await tx
          .update(itensProcessoValores)
          .set({
            fornecedorVencedorId: row.fornecedorVencedorId,
            fornecedorVencedorNome: row.fornecedorVencedorNome,
            fornecedorVencedorCnpj: row.fornecedorVencedorCnpj,
            origemAlteracao: row.origemAlteracao,
            atualizadoEm: new Date(),
          })
          .where(eq(itensProcessoValores.id, row.id));
      }
    });
  }

  return {
    generatedAt: evaluation.generatedAt,
    candidates: evaluation.rows.length,
    updated: updates.length,
    nullIdRepairs,
    mergedIdRepairs,
    unresolved: evaluation.rows.filter((row) => !row.resolvedSupplier).length,
    absorbedSupplierIds: evaluation.absorbedSupplierIds.length,
    sampleUpdatedRows: updates.slice(0, 10).map((row) => ({
      id: row.id,
      processoId: row.processoId,
      numeroSirel: row.numeroSirel,
      itemProcessoId: row.itemProcessoId,
      numeroItem: row.numeroItem,
      fornecedorVencedorId: row.fornecedorVencedorId,
      fornecedorVencedorNome: row.fornecedorVencedorNome,
      fornecedorVencedorCnpj: row.fornecedorVencedorCnpj,
    })),
  };
}
