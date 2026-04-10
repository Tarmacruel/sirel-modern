import { eq, ilike, or } from "drizzle-orm";

import { auditoriaLog, fornecedores } from "../db/schema.js";

export interface FornecedorIdentityRecord {
  id: number;
  razaoSocial: string;
  cnpj: string | null;
  ativo?: boolean | null;
  email?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  estado?: string | null;
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

export function normalizeFornecedorDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeFornecedorDocumentKey(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw || /^AUTO_/i.test(raw)) return "";
  const digits = normalizeFornecedorDigits(raw);
  return digits.length === 11 || digits.length === 14 ? digits : "";
}

export function normalizeFornecedorText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]+/gi, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeFornecedorNome(value: string | null | undefined) {
  return normalizeFornecedorText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !supplierNameNoiseTokens.has(token));
}

export function fornecedorTokenIntersectionCount(
  leftTokens: string[],
  rightTokens: string[],
) {
  if (!leftTokens.length || !rightTokens.length) return 0;
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let total = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) total += 1;
  }
  return total;
}

export function fornecedorTokenSimilarity(
  leftTokens: string[],
  rightTokens: string[],
) {
  if (!leftTokens.length || !rightTokens.length) return 0;
  const intersection = fornecedorTokenIntersectionCount(leftTokens, rightTokens);
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

export function fornecedorNamesLikelySame(
  leftName: string | null | undefined,
  rightName: string | null | undefined,
) {
  const leftNormalized = normalizeFornecedorText(leftName);
  const rightNormalized = normalizeFornecedorText(rightName);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;
  if (
    leftNormalized.includes(rightNormalized) ||
    rightNormalized.includes(leftNormalized)
  ) {
    return true;
  }

  const leftTokens = tokenizeFornecedorNome(leftName);
  const rightTokens = tokenizeFornecedorNome(rightName);
  const similarity = fornecedorTokenSimilarity(leftTokens, rightTokens);
  const sharedTokens = fornecedorTokenIntersectionCount(leftTokens, rightTokens);
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

export function buildFornecedorLookupTokens(value: string | null | undefined) {
  const tokens = tokenizeFornecedorNome(value).filter((token) => token.length >= 4);
  const longest = [...tokens].sort((left, right) => right.length - left.length);
  return Array.from(
    new Set([tokens[0], longest[0], tokens[1]].filter(Boolean) as string[]),
  ).slice(0, 3);
}

export function canonicalFornecedorId(
  value: number | null | undefined,
  mergeMap: Map<number, number>,
) {
  if (!value) return null;
  let current = value;
  const visited = new Set<number>();
  while (mergeMap.has(current) && !visited.has(current)) {
    visited.add(current);
    current = mergeMap.get(current)!;
  }
  return current;
}

export async function loadFornecedorMergeAliasMap(db: any) {
  const rows = await db
    .select({
      registroId: auditoriaLog.registroId,
      dadosNovos: auditoriaLog.dadosNovos,
      descricao: auditoriaLog.descricao,
    })
    .from(auditoriaLog)
    .where(eq(auditoriaLog.tabela, "fornecedores"));

  const map = new Map<number, number>();
  for (const row of rows) {
    const dadosNovos = (row.dadosNovos as Record<string, unknown> | null) ?? {};
    const mergedInto = Number(dadosNovos.mergedIntoFornecedorId ?? 0);
    if (mergedInto > 0 && row.registroId !== mergedInto) {
      map.set(row.registroId, mergedInto);
      continue;
    }

    const mergeSummary =
      (dadosNovos.mergeSummary as Record<string, unknown> | undefined) ?? null;
    const sourceId = Number(mergeSummary?.sourceId ?? 0);
    const targetId = Number((dadosNovos.id as number | undefined) ?? row.registroId);
    if (sourceId > 0 && targetId > 0 && sourceId !== targetId) {
      map.set(sourceId, targetId);
    }
  }

  for (const [sourceId] of [...map]) {
    const canonical = canonicalFornecedorId(sourceId, map);
    if (canonical && canonical !== sourceId) {
      map.set(sourceId, canonical);
    }
  }

  return map;
}

export async function loadFornecedorIdentityCandidates(
  db: any,
  refs: Array<{
    fornecedorId?: number | null;
    nome?: string | null;
    cnpj?: string | null;
  }>,
) {
  const ids = Array.from(
    new Set(
      refs
        .map((row) => row.fornecedorId ?? null)
        .filter((value): value is number => Boolean(value)),
    ),
  );
  const docKeys = Array.from(
    new Set(
      refs
        .map((row) => normalizeFornecedorDocumentKey(row.cnpj))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const lookupTokens = Array.from(
    new Set(
      refs.flatMap((row) => buildFornecedorLookupTokens(row.nome)),
    ),
  ).slice(0, 12);

  if (!ids.length && !docKeys.length && !lookupTokens.length) {
    return [] as FornecedorIdentityRecord[];
  }

  const clauses = [
    ...(ids.length ? [or(...ids.map((id) => eq(fornecedores.id, id)))] : []),
    ...docKeys.map((value) => ilike(fornecedores.cnpj, `%${value}%`)),
    ...lookupTokens.map((token) => ilike(fornecedores.razaoSocial, `%${token}%`)),
  ];

  return db
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
    .where(or(...clauses))
    .limit(500) as Promise<FornecedorIdentityRecord[]>;
}

export function resolveFornecedorReference(params: {
  reference: {
    fornecedorId?: number | null;
    nome?: string | null;
    cnpj?: string | null;
  };
  suppliers: FornecedorIdentityRecord[];
  mergeMap?: Map<number, number>;
  preferredSupplierIds?: Iterable<number>;
}) {
  const mergeMap = params.mergeMap ?? new Map<number, number>();
  const preferredIds = new Set(
    Array.from(params.preferredSupplierIds ?? []).map(
      (id) => canonicalFornecedorId(id, mergeMap) ?? id,
    ),
  );
  const explicitCanonicalId = canonicalFornecedorId(
    params.reference.fornecedorId ?? null,
    mergeMap,
  );
  const referenceDocKey = normalizeFornecedorDocumentKey(params.reference.cnpj);
  const normalizedReferenceName = normalizeFornecedorText(params.reference.nome);
  const referenceTokens = tokenizeFornecedorNome(params.reference.nome);
  if (!explicitCanonicalId && !referenceDocKey && !normalizedReferenceName) {
    return null;
  }

  const supplierById = new Map(params.suppliers.map((row) => [row.id, row]));
  const grouped = new Map<
    number,
    { supplier: FornecedorIdentityRecord; score: number }
  >();

  for (const candidate of params.suppliers) {
    const canonicalId = canonicalFornecedorId(candidate.id, mergeMap) ?? candidate.id;
    const canonicalSupplier = supplierById.get(canonicalId) ?? candidate;
    const candidateDocKey = normalizeFornecedorDocumentKey(candidate.cnpj);
    const candidateName = normalizeFornecedorText(candidate.razaoSocial);
    const candidateTokens = tokenizeFornecedorNome(candidate.razaoSocial);
    let score = 0;

    if (explicitCanonicalId && canonicalId === explicitCanonicalId) {
      score += 140;
    }
    if (referenceDocKey && candidateDocKey && referenceDocKey === candidateDocKey) {
      score += 120;
    }
    if (normalizedReferenceName && candidateName === normalizedReferenceName) {
      score += 95;
    } else if (
      fornecedorNamesLikelySame(params.reference.nome, candidate.razaoSocial)
    ) {
      score += 70;
      score += Math.round(
        fornecedorTokenSimilarity(referenceTokens, candidateTokens) * 20,
      );
    }
    if (preferredIds.has(canonicalId)) {
      score += 15;
    }
    if (canonicalSupplier.ativo) {
      score += 2;
    }

    if (score < 70 && !(referenceDocKey && candidateDocKey === referenceDocKey)) {
      continue;
    }

    const current = grouped.get(canonicalId);
    if (!current || score > current.score) {
      grouped.set(canonicalId, {
        supplier: canonicalSupplier,
        score,
      });
    }
  }

  return Array.from(grouped.values())
    .sort((left, right) => right.score - left.score || left.supplier.id - right.supplier.id)[0]
    ?.supplier ?? null;
}
