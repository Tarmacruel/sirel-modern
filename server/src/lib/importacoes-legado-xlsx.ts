import type { ImportacaoLegadoXlsxRow } from "@sirel/shared/schemas/importacoes";

type InternalProcessBase = {
  processoId: number;
  numeroSirel: string;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  objeto: string;
  modalidadeNome: string | null;
  secretariaNome: string | null;
  valorEstimado: number | null;
  moduloAtual: string | null;
};

type ImportedProcessBase = {
  importedId: number;
  origem: string;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  objeto: string;
  modalidade: string | null;
  valorReferencia: number | null;
  valorTotal: number | null;
  statusConciliacao: string | null;
};

type SecretariaBase = {
  id: number;
  nome: string;
  codigo: string;
};

type Severity = "CRITICO" | "ATENCAO";

type LegacyIssue = {
  code: string;
  label: string;
  severity: Severity;
};

type LegacyMatch = {
  score: number;
  motivos: string[];
};

type PreparedSecretaria = SecretariaBase & {
  normalizedNome: string;
  normalizedCodigo: string;
  tokens: Set<string>;
};

type PreparedLegacyRow = {
  source: ImportacaoLegadoXlsxRow;
  normalizedModalidade: string;
  normalizedProcessoAdministrativo: string;
  normalizedNumeroEdital: string;
  normalizedProtocolo: string;
  normalizedSecretaria: string;
  secretariaTokens: Set<string>;
  normalizedStatus: string;
  normalizedCondutor: string;
  objeto: string | null;
  normalizedObjeto: string;
  objetoTokens: Set<string>;
  duplicateKey: string;
  publicationReference: Date | null;
  openingDate: Date | null;
  homologationDate: Date | null;
};

type PreparedInternalProcess = InternalProcessBase & {
  normalizedNumeroAdministrativo: string;
  normalizedNumeroEdital: string;
  normalizedModalidade: string;
  normalizedSecretaria: string;
  secretariaTokens: Set<string>;
  normalizedObjeto: string;
  objetoTokens: Set<string>;
};

type PreparedImportedProcess = ImportedProcessBase & {
  normalizedNumeroAdministrativo: string;
  normalizedNumeroEdital: string;
  normalizedModalidade: string;
  normalizedObjeto: string;
  objetoTokens: Set<string>;
  importedValue: number | null;
};

export type LegacyInternalMatch = LegacyMatch & {
  processoId: number;
  numeroSirel: string;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  moduloAtual: string | null;
};

export type LegacyImportedMatch = LegacyMatch & {
  importedId: number;
  origem: string;
  numeroAdministrativo: string | null;
  numeroEdital: string | null;
  statusConciliacao: string | null;
};

export type LegacyAnalysisRow = {
  linha: number;
  legacyId: string | null;
  modalidade: string | null;
  processoAdministrativo: string | null;
  protocolo: string | null;
  numeroEdital: string | null;
  status: string | null;
  secretaria: string | null;
  objetoResumo: string | null;
  valorEstimado: number | null;
  valorContratado: number | null;
  severity: "OK" | Severity;
  issues: LegacyIssue[];
  duplicateFileCount: number;
  duplicateGroupKey: string | null;
  mappedSecretaria: string | null;
  internalMatches: LegacyInternalMatch[];
  importedMatches: LegacyImportedMatch[];
};

export type LegacyAnalysisSummary = {
  totalRows: number;
  cleanRows: number;
  rowsWithIssues: number;
  criticalRows: number;
  duplicateRowsInFile: number;
  rowsWithInternalMatches: number;
  rowsWithImportedMatches: number;
  rowsMissingCriticalFields: number;
};

export type LegacyIssueBucket = {
  code: string;
  label: string;
  severity: Severity;
  count: number;
};

export type LegacyAnalysisResult = {
  summary: LegacyAnalysisSummary;
  issueBuckets: LegacyIssueBucket[];
  duplicateGroups: Array<{
    key: string;
    count: number;
    linhas: number[];
  }>;
  rows: LegacyAnalysisRow[];
};

function normalizeIdentifier(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeNormalized(normalizedValue: string) {
  return new Set(
    normalizedValue
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

function tokenize(value: unknown) {
  return tokenizeNormalized(normalizeText(value));
}

function tokenSimilaritySets(
  leftTokens: Set<string>,
  rightTokens: Set<string>,
) {
  if (!leftTokens.size || !rightTokens.size) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const date = new Date(
      `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`,
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year =
      slashMatch[3].length === 2 ? 2000 + Number(slashMatch[3]) : Number(slashMatch[3]);

    const build = (day: number, month: number) => {
      const date = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    if (slashMatch[3].length === 2) {
      return build(second, first);
    }

    if (first > 12) {
      return build(first, second);
    }

    if (second > 12) {
      return build(second, first);
    }

    return build(first, second);
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function isFilled(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function getObjectSummary(row: ImportacaoLegadoXlsxRow) {
  return row.objeto?.trim() || row.resumoObjeto?.trim() || null;
}

function addIssue(
  target: LegacyIssue[],
  code: string,
  label: string,
  severity: Severity,
) {
  if (!target.some((issue) => issue.code === code)) {
    target.push({ code, label, severity });
  }
}

function classifySeverity(issues: LegacyIssue[]): "OK" | Severity {
  if (!issues.length) return "OK";
  if (issues.some((issue) => issue.severity === "CRITICO")) return "CRITICO";
  return "ATENCAO";
}

function addToIndex<T>(index: Map<string, T[]>, key: string, item: T) {
  if (!key) return;
  const current = index.get(key);
  if (current) {
    current.push(item);
    return;
  }
  index.set(key, [item]);
}

function addTokensToIndex<T extends { objetoTokens: Set<string> }>(
  index: Map<string, T[]>,
  item: T,
) {
  for (const token of item.objetoTokens) {
    if (token.length < 4) continue;
    addToIndex(index, token, item);
  }
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function prepareLegacyRow(row: ImportacaoLegadoXlsxRow): PreparedLegacyRow {
  const objeto = getObjectSummary(row);
  const normalizedObjeto = normalizeText(objeto);
  const publicationDates = [
    parseDate(row.dataPublicacaoDom),
    parseDate(row.dataPublicacaoDou),
    parseDate(row.dataPublicacaoJornal),
  ].filter((value): value is Date => value instanceof Date);

  return {
    source: row,
    normalizedModalidade: normalizeText(row.modalidade),
    normalizedProcessoAdministrativo: normalizeIdentifier(
      row.processoAdministrativo,
    ),
    normalizedNumeroEdital: normalizeIdentifier(row.numeroEdital),
    normalizedProtocolo: normalizeIdentifier(row.protocolo),
    normalizedSecretaria: normalizeText(row.secretaria),
    secretariaTokens: tokenize(row.secretaria),
    normalizedStatus: normalizeText(row.status),
    normalizedCondutor: normalizeIdentifier(row.condutorProcesso),
    objeto,
    normalizedObjeto,
    objetoTokens: tokenizeNormalized(normalizedObjeto),
    duplicateKey: [
      normalizeIdentifier(row.modalidade),
      normalizeIdentifier(row.processoAdministrativo),
      normalizeIdentifier(row.numeroEdital),
    ]
      .filter(Boolean)
      .join("|"),
    publicationReference:
      publicationDates.length > 0
        ? publicationDates.sort(
            (left, right) => left.getTime() - right.getTime(),
          )[0]
        : null,
    openingDate: parseDate(row.dataAbertura),
    homologationDate: parseDate(row.dataHomologacao),
  };
}

function prepareInternalProcess(
  process: InternalProcessBase,
): PreparedInternalProcess {
  const normalizedObjeto = normalizeText(process.objeto);
  return {
    ...process,
    normalizedNumeroAdministrativo: normalizeIdentifier(
      process.numeroAdministrativo,
    ),
    normalizedNumeroEdital: normalizeIdentifier(process.numeroEdital),
    normalizedModalidade: normalizeText(process.modalidadeNome),
    normalizedSecretaria: normalizeText(process.secretariaNome),
    secretariaTokens: tokenize(process.secretariaNome),
    normalizedObjeto,
    objetoTokens: tokenizeNormalized(normalizedObjeto),
  };
}

function prepareImportedProcess(
  process: ImportedProcessBase,
): PreparedImportedProcess {
  const normalizedObjeto = normalizeText(process.objeto);
  return {
    ...process,
    normalizedNumeroAdministrativo: normalizeIdentifier(
      process.numeroAdministrativo,
    ),
    normalizedNumeroEdital: normalizeIdentifier(process.numeroEdital),
    normalizedModalidade: normalizeText(process.modalidade),
    normalizedObjeto,
    objetoTokens: tokenizeNormalized(normalizedObjeto),
    importedValue:
      process.valorReferencia && process.valorReferencia > 0
        ? process.valorReferencia
        : process.valorTotal,
  };
}

function prepareSecretaria(secretaria: SecretariaBase): PreparedSecretaria {
  const normalizedNome = normalizeText(secretaria.nome);
  return {
    ...secretaria,
    normalizedNome,
    normalizedCodigo: normalizeIdentifier(secretaria.codigo),
    tokens: tokenizeNormalized(normalizedNome),
  };
}

function scoreInternalMatch(
  row: PreparedLegacyRow,
  process: PreparedInternalProcess,
): LegacyInternalMatch | null {
  let score = 0;
  const motivos: string[] = [];

  if (
    row.normalizedNumeroEdital &&
    process.normalizedNumeroEdital &&
    row.normalizedNumeroEdital === process.normalizedNumeroEdital
  ) {
    score += 72;
    motivos.push("Número do edital coincidente.");
  }

  if (
    row.normalizedProcessoAdministrativo &&
    process.normalizedNumeroAdministrativo &&
    row.normalizedProcessoAdministrativo ===
      process.normalizedNumeroAdministrativo
  ) {
    score += 68;
    motivos.push("Processo administrativo coincidente.");
  }

  if (
    row.normalizedModalidade &&
    process.normalizedModalidade &&
    (row.normalizedModalidade.includes(process.normalizedModalidade) ||
      process.normalizedModalidade.includes(row.normalizedModalidade))
  ) {
    score += 10;
    motivos.push("Modalidade compatível.");
  }

  const secretariaSimilarity = tokenSimilaritySets(
    row.secretariaTokens,
    process.secretariaTokens,
  );
  if (secretariaSimilarity >= 0.8) {
    score += 8;
    motivos.push("Secretaria compatível.");
  } else if (secretariaSimilarity >= 0.5) {
    score += 4;
    motivos.push("Secretaria similar.");
  }

  const similaridadeObjeto = tokenSimilaritySets(
    row.objetoTokens,
    process.objetoTokens,
  );
  if (similaridadeObjeto >= 0.82) {
    score += 28;
    motivos.push("Objeto muito próximo.");
  } else if (similaridadeObjeto >= 0.65) {
    score += 22;
    motivos.push("Objeto similar.");
  } else if (similaridadeObjeto >= 0.45) {
    score += 12;
    motivos.push("Objeto parcialmente similar.");
  }

  if (
    row.source.valorEstimado !== null &&
    row.source.valorEstimado !== undefined &&
    process.valorEstimado !== null &&
    process.valorEstimado !== undefined &&
    row.source.valorEstimado > 0 &&
    process.valorEstimado > 0
  ) {
    const diff = Math.abs(row.source.valorEstimado - process.valorEstimado);
    const tolerance =
      Math.max(row.source.valorEstimado, process.valorEstimado) * 0.12;
    if (diff <= tolerance) {
      score += 6;
      motivos.push("Valor estimado próximo.");
    }
  }

  if (score < 20) return null;
  return {
    processoId: process.processoId,
    numeroSirel: process.numeroSirel,
    numeroAdministrativo: process.numeroAdministrativo,
    numeroEdital: process.numeroEdital,
    moduloAtual: process.moduloAtual,
    score,
    motivos,
  };
}

function scoreImportedMatch(
  row: PreparedLegacyRow,
  imported: PreparedImportedProcess,
): LegacyImportedMatch | null {
  let score = 0;
  const motivos: string[] = [];

  if (
    row.normalizedNumeroEdital &&
    imported.normalizedNumeroEdital &&
    row.normalizedNumeroEdital === imported.normalizedNumeroEdital
  ) {
    score += 72;
    motivos.push("Número do edital coincidente.");
  }

  if (
    row.normalizedProcessoAdministrativo &&
    imported.normalizedNumeroAdministrativo &&
    row.normalizedProcessoAdministrativo ===
      imported.normalizedNumeroAdministrativo
  ) {
    score += 68;
    motivos.push("Processo administrativo coincidente.");
  }

  if (
    row.normalizedModalidade &&
    imported.normalizedModalidade &&
    (row.normalizedModalidade.includes(imported.normalizedModalidade) ||
      imported.normalizedModalidade.includes(row.normalizedModalidade))
  ) {
    score += 10;
    motivos.push("Modalidade compatível.");
  }

  const objectSimilarity = tokenSimilaritySets(
    row.objetoTokens,
    imported.objetoTokens,
  );
  if (objectSimilarity >= 0.82) {
    score += 28;
    motivos.push("Objeto muito próximo.");
  } else if (objectSimilarity >= 0.65) {
    score += 22;
    motivos.push("Objeto similar.");
  } else if (objectSimilarity >= 0.45) {
    score += 12;
    motivos.push("Objeto parcialmente similar.");
  }

  if (
    row.source.valorEstimado !== null &&
    row.source.valorEstimado !== undefined &&
    imported.importedValue !== null &&
    imported.importedValue !== undefined &&
    row.source.valorEstimado > 0 &&
    imported.importedValue > 0
  ) {
    const diff = Math.abs(row.source.valorEstimado - imported.importedValue);
    const tolerance =
      Math.max(row.source.valorEstimado, imported.importedValue) * 0.12;
    if (diff <= tolerance) {
      score += 6;
      motivos.push("Valor próximo da base importada.");
    }
  }

  if (score < 20) return null;
  return {
    importedId: imported.importedId,
    origem: imported.origem,
    numeroAdministrativo: imported.numeroAdministrativo,
    numeroEdital: imported.numeroEdital,
    statusConciliacao: imported.statusConciliacao,
    score,
    motivos,
  };
}

function mapSecretariaName(
  rowSecretaria: string | null | undefined,
  normalizedSecretaria: string,
  rowTokens: Set<string>,
  knownSecretarias: PreparedSecretaria[],
) {
  if (!rowSecretaria || !normalizedSecretaria) return null;

  const exact = knownSecretarias.find(
    (item) =>
      item.normalizedNome === normalizedSecretaria ||
      item.normalizedCodigo === normalizeIdentifier(rowSecretaria),
  );
  if (exact) return exact.nome;

  const similar = knownSecretarias
    .map((item) => ({
      nome: item.nome,
      score: tokenSimilaritySets(rowTokens, item.tokens),
    }))
    .filter((item) => item.score >= 0.55)
    .sort((left, right) => right.score - left.score)[0];

  return similar?.nome ?? null;
}

function collectCandidates<T>(
  preparedRow: PreparedLegacyRow,
  byEdital: Map<string, T[]>,
  byAdministrativo: Map<string, T[]>,
  byObjetoToken: Map<string, T[]>,
  getIdentity: (item: T) => string,
) {
  const candidates: T[] = [];
  const add = (items?: T[]) => {
    if (!items?.length) return;
    candidates.push(...items);
  };

  add(byEdital.get(preparedRow.normalizedNumeroEdital));
  add(byAdministrativo.get(preparedRow.normalizedProcessoAdministrativo));

  if (!candidates.length && preparedRow.objetoTokens.size) {
    for (const token of preparedRow.objetoTokens) {
      if (token.length < 5) continue;
      add(byObjetoToken.get(token));
      if (candidates.length >= 48) break;
    }
  }

  return uniqueByKey(candidates, getIdentity);
}

export function analyzeLegacyRows(params: {
  rows: ImportacaoLegadoXlsxRow[];
  internalProcesses: InternalProcessBase[];
  importedProcesses: ImportedProcessBase[];
  secretarias: SecretariaBase[];
}): LegacyAnalysisResult {
  const preparedRows = params.rows.map(prepareLegacyRow);
  const preparedInternal = params.internalProcesses.map(prepareInternalProcess);
  const preparedImported = params.importedProcesses.map(prepareImportedProcess);
  const preparedSecretarias = params.secretarias.map(prepareSecretaria);

  const internalByEdital = new Map<string, PreparedInternalProcess[]>();
  const internalByAdministrativo = new Map<string, PreparedInternalProcess[]>();
  const internalByObjetoToken = new Map<string, PreparedInternalProcess[]>();

  for (const process of preparedInternal) {
    addToIndex(internalByEdital, process.normalizedNumeroEdital, process);
    addToIndex(
      internalByAdministrativo,
      process.normalizedNumeroAdministrativo,
      process,
    );
    addTokensToIndex(internalByObjetoToken, process);
  }

  const importedByEdital = new Map<string, PreparedImportedProcess[]>();
  const importedByAdministrativo = new Map<string, PreparedImportedProcess[]>();
  const importedByObjetoToken = new Map<string, PreparedImportedProcess[]>();

  for (const process of preparedImported) {
    addToIndex(importedByEdital, process.normalizedNumeroEdital, process);
    addToIndex(
      importedByAdministrativo,
      process.normalizedNumeroAdministrativo,
      process,
    );
    addTokensToIndex(importedByObjetoToken, process);
  }

  const duplicateGroups = new Map<string, number[]>();
  for (const row of preparedRows) {
    if (!row.duplicateKey) continue;
    const list = duplicateGroups.get(row.duplicateKey) ?? [];
    list.push(row.source.linha);
    duplicateGroups.set(row.duplicateKey, list);
  }

  const issueCount = new Map<string, LegacyIssueBucket>();
  const analyzedRows: LegacyAnalysisRow[] = preparedRows.map((preparedRow) => {
    const row = preparedRow.source;
    const issues: LegacyIssue[] = [];
    const edital = row.numeroEdital?.trim() || null;
    const processoAdministrativo = row.processoAdministrativo?.trim() || null;
    const protocolo = row.protocolo?.trim() || null;
    const duplicateFileCount =
      preparedRow.duplicateKey && duplicateGroups.get(preparedRow.duplicateKey)
        ? duplicateGroups.get(preparedRow.duplicateKey)!.length
        : 0;

    if (duplicateFileCount > 1) {
      addIssue(
        issues,
        "DUPLICIDADE_NO_LOTE",
        "Possível duplicidade dentro do próprio XLSX.",
        "CRITICO",
      );
    }

    if (!isFilled(row.modalidade)) {
      addIssue(
        issues,
        "MODALIDADE_AUSENTE",
        "Modalidade não informada.",
        "CRITICO",
      );
    }
    if (!isFilled(row.secretaria)) {
      addIssue(
        issues,
        "SECRETARIA_AUSENTE",
        "Secretaria não informada.",
        "CRITICO",
      );
    }
    if (!preparedRow.objeto) {
      addIssue(
        issues,
        "OBJETO_AUSENTE",
        "Objeto e resumo do objeto ausentes.",
        "CRITICO",
      );
    }
    if (!edital && !processoAdministrativo && !protocolo) {
      addIssue(
        issues,
        "SEM_IDENTIFICADOR_MINIMO",
        "Registro sem edital, processo administrativo e protocolo.",
        "CRITICO",
      );
    }

    if (
      preparedRow.publicationReference &&
      preparedRow.openingDate &&
      preparedRow.openingDate < preparedRow.publicationReference
    ) {
      addIssue(
        issues,
        "ABERTURA_ANTES_PUBLICACAO",
        "Data de abertura anterior à publicação informada.",
        "CRITICO",
      );
    }

    if (
      preparedRow.homologationDate &&
      preparedRow.openingDate &&
      preparedRow.homologationDate < preparedRow.openingDate
    ) {
      addIssue(
        issues,
        "HOMOLOGACAO_ANTES_ABERTURA",
        "Data de homologação anterior à abertura.",
        "CRITICO",
      );
    }

    if (
      (preparedRow.normalizedStatus.includes("homolog") ||
        preparedRow.normalizedStatus.includes("adjudic")) &&
      !preparedRow.homologationDate
    ) {
      addIssue(
        issues,
        "STATUS_FINAL_SEM_DATA",
        "Status final sem data de homologação/adjudicação.",
        "ATENCAO",
      );
    }

    if (
      row.valorContratado !== null &&
      row.valorContratado !== undefined &&
      row.valorEstimado !== null &&
      row.valorEstimado !== undefined &&
      row.valorContratado > 0 &&
      row.valorEstimado === 0
    ) {
      addIssue(
        issues,
        "VALOR_ESTIMADO_ZERO",
        "Valor contratado preenchido com valor estimado zerado.",
        "ATENCAO",
      );
    }

    if (
      row.valorContratado !== null &&
      row.valorContratado !== undefined &&
      row.valorEstimado !== null &&
      row.valorEstimado !== undefined &&
      row.valorEstimado > 0 &&
      row.valorContratado > row.valorEstimado * 1.2
    ) {
      addIssue(
        issues,
        "VALOR_CONTRATADO_SUPERIOR",
        "Valor contratado muito acima do valor estimado.",
        "ATENCAO",
      );
    }

    if (row.cnpj) {
      const digits = row.cnpj.replace(/\D/g, "");
      if (digits.length !== 14) {
        addIssue(
          issues,
          "CNPJ_FORMATO_INVALIDO",
          "CNPJ do vencedor com formato inconsistente.",
          "ATENCAO",
        );
      }
    }

    if (
      preparedRow.normalizedCondutor &&
      /^\d+$/.test(preparedRow.normalizedCondutor)
    ) {
      addIssue(
        issues,
        "CONDUTOR_CODIFICADO",
        "Condutor do processo veio codificado e exige tabela de equivalência.",
        "ATENCAO",
      );
    }

    const mappedSecretaria = mapSecretariaName(
      row.secretaria,
      preparedRow.normalizedSecretaria,
      preparedRow.secretariaTokens,
      preparedSecretarias,
    );
    if (row.secretaria && !mappedSecretaria) {
      addIssue(
        issues,
        "SECRETARIA_NAO_MAPEADA",
        "Secretaria legada sem correspondência clara na base interna.",
        "ATENCAO",
      );
    }

    const internalCandidates = collectCandidates(
      preparedRow,
      internalByEdital,
      internalByAdministrativo,
      internalByObjetoToken,
      (item) => String(item.processoId),
    );
    const internalMatches = internalCandidates
      .map((process) => scoreInternalMatch(preparedRow, process))
      .filter((item): item is LegacyInternalMatch => item !== null)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    if (internalMatches.length) {
      addIssue(
        issues,
        "POSSIVEL_DUPLICIDADE_INTERNA",
        "Há processo interno potencialmente correspondente.",
        "ATENCAO",
      );
    }

    const importedCandidates = collectCandidates(
      preparedRow,
      importedByEdital,
      importedByAdministrativo,
      importedByObjetoToken,
      (item) => String(item.importedId),
    );
    const importedMatches = importedCandidates
      .map((process) => scoreImportedMatch(preparedRow, process))
      .filter((item): item is LegacyImportedMatch => item !== null)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    if (importedMatches.length) {
      addIssue(
        issues,
        "POSSIVEL_DUPLICIDADE_IMPORTADA",
        "Há registro semelhante na base pública já importada.",
        "ATENCAO",
      );
    }

    for (const issue of issues) {
      const current = issueCount.get(issue.code);
      if (current) {
        current.count += 1;
      } else {
        issueCount.set(issue.code, {
          code: issue.code,
          label: issue.label,
          severity: issue.severity,
          count: 1,
        });
      }
    }

    return {
      linha: row.linha,
      legacyId: row.legacyId?.trim() || null,
      modalidade: row.modalidade?.trim() || null,
      processoAdministrativo,
      protocolo,
      numeroEdital: edital,
      status: row.status?.trim() || null,
      secretaria: row.secretaria?.trim() || null,
      objetoResumo: preparedRow.objeto,
      valorEstimado: row.valorEstimado ?? null,
      valorContratado: row.valorContratado ?? null,
      severity: classifySeverity(issues),
      issues,
      duplicateFileCount,
      duplicateGroupKey:
        duplicateFileCount > 1 ? preparedRow.duplicateKey : null,
      mappedSecretaria,
      internalMatches,
      importedMatches,
    };
  });

  const summary: LegacyAnalysisSummary = {
    totalRows: analyzedRows.length,
    cleanRows: analyzedRows.filter((row) => row.severity === "OK").length,
    rowsWithIssues: analyzedRows.filter((row) => row.issues.length > 0).length,
    criticalRows: analyzedRows.filter((row) => row.severity === "CRITICO")
      .length,
    duplicateRowsInFile: analyzedRows.filter(
      (row) => row.duplicateFileCount > 1,
    ).length,
    rowsWithInternalMatches: analyzedRows.filter(
      (row) => row.internalMatches.length > 0,
    ).length,
    rowsWithImportedMatches: analyzedRows.filter(
      (row) => row.importedMatches.length > 0,
    ).length,
    rowsMissingCriticalFields: analyzedRows.filter((row) =>
      row.issues.some((issue) =>
        [
          "MODALIDADE_AUSENTE",
          "SECRETARIA_AUSENTE",
          "OBJETO_AUSENTE",
          "SEM_IDENTIFICADOR_MINIMO",
        ].includes(issue.code),
      ),
    ).length,
  };

  return {
    summary,
    issueBuckets: Array.from(issueCount.values()).sort(
      (left, right) =>
        Number(right.severity === "CRITICO") -
          Number(left.severity === "CRITICO") || right.count - left.count,
    ),
    duplicateGroups: Array.from(duplicateGroups.entries())
      .filter(([, linhas]) => linhas.length > 1)
      .map(([key, linhas]) => ({ key, count: linhas.length, linhas }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 20),
    rows: analyzedRows.sort(
      (left, right) =>
        Number(right.severity === "CRITICO") -
          Number(left.severity === "CRITICO") ||
        right.issues.length - left.issues.length ||
        (right.internalMatches[0]?.score ?? 0) -
          (left.internalMatches[0]?.score ?? 0),
    ),
  };
}
