import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";

import {
  importacaoLegadoXlsxBulkUpdateRowsInputSchema,
  importacaoLegadoXlsxAnalyzeInputSchema,
  importacaoLegadoXlsxDetailInputSchema,
  importacaoLegadoXlsxEditableFieldsSchema,
  importacaoLegadoXlsxImportApprovedInputSchema,
  importacaoLegadoXlsxListLotesInputSchema,
  importacaoLegadoXlsxRowSchema,
  importacaoLegadoXlsxSetLoteStatusInputSchema,
  importacaoLegadoXlsxUpdateRowInputSchema,
  importacaoBllAutoReconcileInputSchema,
  importacaoBllCsvInputSchema,
  importacaoBllDeleteProcessoInputSchema,
  importacaoBllDeleteProcessosInputSchema,
  importacaoBllDetailInputSchema,
  importacaoBllExecutionListInputSchema,
  importacaoBllLinkProcessoInputSchema,
  importacaoBllListInputSchema,
  importacaoBllLocalSyncBatchInputSchema,
  importacaoBllLocalSyncCancelInputSchema,
  importacaoBllLocalSyncProcessInputSchema,
  importacaoBllLocalSyncStatusInputSchema,
  importacaoBllRemoteSyncInputSchema,
  importacaoBllSearchProcessosInputSchema,
  importacaoBllSetIgnoredInputSchema,
  importacaoBllUnlinkProcessoInputSchema,
} from "@sirel/shared/schemas/importacoes";
import {
  mapLegacyCondutorName,
  mapLegacySecretariaName,
} from "@sirel/shared/legacy-import-mappings";

import { logAuditoria } from "../db/auditoria.js";
import { requireDb } from "../db/client.js";
import {
  importacaoBllExecucoes,
  importacaoBllItens,
  importacaoBllProcessos,
  importacaoLegadoLotes,
  importacaoLegadoRegistros,
  licitacoes,
  movimentacoesWorkflow,
  pessoas,
  processos,
  statusProcesso,
  workflowProcesso,
} from "../db/schema.js";
import {
  autoReconcileImportedProcesses,
  getConciliationSummaryCounts,
  getConciliationSuggestions,
  getLinkedInternalProcess,
  linkImportedProcessToInternal,
  setImportedProcessIgnored,
  unlinkImportedProcess,
  deleteImportedProcess,
  deleteImportedProcesses,
} from "../lib/importacoes-conciliacao.js";
import {
  executeAutomaticPncpConciliation,
  generatePncpConciliationSuggestions,
  getPncpProcessDetails,
  searchPncpProcesses,
} from "../lib/importacoes-pncp.js";
import { getNextNumeroSirel } from "../lib/processo-identity.js";
import { analyzeLegacyRows } from "../lib/importacoes-legado-xlsx.js";
import {
  getImportSchedulerConfig,
  getImportSummaryCounts,
  importCsvBundle,
  remoteImportSources,
  syncRemoteImport,
} from "../lib/importacoes-bll.js";
import {
  cancelBllLocalSync,
  getBllLocalSyncStatus,
  startBllLocalSync,
} from "../lib/bll-sync-local.js";
import { gestorProcedure, operadorProcedure, protectedProcedure, router } from "../trpc.js";
import { modalidades, secretarias } from "../db/schema.js";
import type {
  ImportacaoLegadoRowReviewStatus,
  ImportacaoLegadoXlsxEditableFields,
  ImportacaoLegadoXlsxRow,
} from "@sirel/shared/schemas/importacoes";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function legacyReviewCounters(
  rows: Array<{ reviewStatus: ImportacaoLegadoRowReviewStatus }>,
) {
  return rows.reduce(
    (acc, row) => {
      acc.totalPendentesRevisao += Number(row.reviewStatus === "PENDENTE");
      acc.totalAprovadosImportacao += Number(
        row.reviewStatus === "APROVAR_IMPORTACAO",
      );
      acc.totalIgnorados += Number(row.reviewStatus === "IGNORAR");
      acc.totalVinculadosInterno += Number(
        row.reviewStatus === "VINCULAR_INTERNO",
      );
      acc.totalDuplicadosBase += Number(row.reviewStatus === "DUPLICADO_BASE");
      return acc;
    },
    {
      totalPendentesRevisao: 0,
      totalAprovadosImportacao: 0,
      totalIgnorados: 0,
      totalVinculadosInterno: 0,
      totalDuplicadosBase: 0,
    },
  );
}

async function loadLegacyAnalysisBases(db: ReturnType<typeof requireDb>) {
  const [internalProcesses, importedProcesses, secretariasRows] =
    await Promise.all([
      db
        .select({
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          numeroAdministrativo: processos.numeroAdministrativo,
          numeroEdital: processos.numeroEdital,
          objeto: processos.objeto,
          valorEstimado: processos.valorEstimado,
          modalidadeNome: modalidades.nome,
          secretariaNome: secretarias.nome,
          moduloAtual: workflowProcesso.moduloAtual,
        })
        .from(processos)
        .leftJoin(modalidades, eq(modalidades.id, processos.modalidadeId))
        .leftJoin(secretarias, eq(secretarias.id, processos.secretariaId))
        .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id)),
      db
        .select({
          importedId: importacaoBllProcessos.id,
          origem: importacaoBllProcessos.origem,
          numeroAdministrativo: importacaoBllProcessos.numeroAdministrativo,
          numeroEdital: importacaoBllProcessos.numeroEdital,
          objeto: importacaoBllProcessos.objeto,
          modalidade: importacaoBllProcessos.modalidade,
          valorReferencia: importacaoBllProcessos.valorReferencia,
          valorTotal: importacaoBllProcessos.valorTotal,
          statusConciliacao: importacaoBllProcessos.statusConciliacao,
        })
        .from(importacaoBllProcessos),
      db
        .select({
          id: secretarias.id,
          nome: secretarias.nome,
          codigo: secretarias.sigla,
        })
        .from(secretarias),
    ]);

  return {
    internalProcesses: internalProcesses.map((row) => ({
      ...row,
      valorEstimado: row.valorEstimado ? toNumber(row.valorEstimado) : null,
    })),
    importedProcesses: importedProcesses.map((row) => ({
      ...row,
      valorReferencia: row.valorReferencia ? toNumber(row.valorReferencia) : null,
      valorTotal: row.valorTotal ? toNumber(row.valorTotal) : null,
    })),
    secretariasRows,
  };
}

async function refreshLegacyLoteReviewCounts(
  db: Pick<ReturnType<typeof requireDb>, "select" | "update">,
  loteId: number,
) {
  const rows = await db
    .select({
      reviewStatus: importacaoLegadoRegistros.reviewStatus,
    })
    .from(importacaoLegadoRegistros)
    .where(eq(importacaoLegadoRegistros.loteId, loteId));

  const counters = legacyReviewCounters(rows);

  await db
    .update(importacaoLegadoLotes)
    .set({
      ...counters,
      atualizadoEm: new Date(),
    })
    .where(eq(importacaoLegadoLotes.id, loteId));

  return counters;
}

function formatLegacyDateParts(day: number, month: number, year: number) {
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).padStart(4, "0")}`;
}

function normalizeLegacyDateString(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoMatch) {
    return formatLegacyDateParts(
      Number(isoMatch[3]),
      Number(isoMatch[2]),
      Number(isoMatch[1]),
    );
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year =
      slashMatch[3].length === 2 ? 2000 + Number(slashMatch[3]) : Number(slashMatch[3]);

    if (slashMatch[3].length === 2) {
      return formatLegacyDateParts(second, first, year);
    }

    if (first > 12) {
      return formatLegacyDateParts(first, second, year);
    }

    if (second > 12) {
      return formatLegacyDateParts(second, first, year);
    }

    return formatLegacyDateParts(first, second, year);
  }

  return trimmed;
}

function normalizeLegacyNumberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned || cleaned === "-") return null;

  const commaIndex = cleaned.lastIndexOf(",");
  const dotIndex = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (commaIndex >= 0 && dotIndex >= 0) {
    if (commaIndex > dotIndex) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (commaIndex >= 0) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    const dots = cleaned.match(/\./g)?.length ?? 0;
    normalized = dots > 1 ? cleaned.replace(/\./g, "") : cleaned;
  }

  normalized = normalized.replace(/(?!^)-/g, "");
  if (!normalized || normalized === "-") return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceLegacyRawPayload(
  row: Pick<
    typeof importacaoLegadoRegistros.$inferSelect,
    | "linha"
    | "legacyId"
    | "modalidade"
    | "processoAdministrativo"
    | "protocolo"
    | "numeroEdital"
    | "statusLegado"
    | "secretaria"
    | "objetoResumo"
    | "valorEstimado"
    | "valorContratado"
    | "rawPayload"
  >,
): ImportacaoLegadoXlsxRow {
  const parsed = importacaoLegadoXlsxRowSchema.safeParse(row.rawPayload ?? {});
  const raw = parsed.success ? parsed.data : ({ linha: row.linha } as ImportacaoLegadoXlsxRow);

  return importacaoLegadoXlsxRowSchema.parse({
    ...raw,
    linha: row.linha,
    legacyId: row.legacyId ?? raw.legacyId ?? null,
    modalidade: row.modalidade ?? raw.modalidade ?? null,
    processoAdministrativo:
      row.processoAdministrativo ?? raw.processoAdministrativo ?? null,
    protocolo: row.protocolo ?? raw.protocolo ?? null,
    numeroEdital: row.numeroEdital ?? raw.numeroEdital ?? null,
    status: row.statusLegado ?? raw.status ?? null,
    secretaria: mapLegacySecretariaName(row.secretaria ?? raw.secretaria ?? null),
    condutorProcesso: mapLegacyCondutorName(raw.condutorProcesso ?? null),
    resumoObjeto: row.objetoResumo ?? raw.resumoObjeto ?? null,
    dataPublicacaoDom: normalizeLegacyDateString(raw.dataPublicacaoDom),
    dataPublicacaoDou: normalizeLegacyDateString(raw.dataPublicacaoDou),
    dataPublicacaoJornal: normalizeLegacyDateString(raw.dataPublicacaoJornal),
    dataInicio: normalizeLegacyDateString(raw.dataInicio),
    dataEntrada: normalizeLegacyDateString(raw.dataEntrada),
    dataEnvioParecerista: normalizeLegacyDateString(raw.dataEnvioParecerista),
    dataAutorizacao: normalizeLegacyDateString(raw.dataAutorizacao),
    dataAbertura: normalizeLegacyDateString(raw.dataAbertura),
    dataAberturaPropostas: normalizeLegacyDateString(raw.dataAberturaPropostas),
    dataSuspensao: normalizeLegacyDateString(raw.dataSuspensao),
    dataRevogacao: normalizeLegacyDateString(raw.dataRevogacao),
    dataAdjudicacao: normalizeLegacyDateString(raw.dataAdjudicacao),
    dataHomologacao: normalizeLegacyDateString(raw.dataHomologacao),
    valorEstimado:
      normalizeLegacyNumberValue(raw.valorEstimado) ??
      (row.valorEstimado !== null && row.valorEstimado !== undefined
        ? toNumber(row.valorEstimado)
        : null),
    valorContratado:
      normalizeLegacyNumberValue(raw.valorContratado) ??
      (row.valorContratado !== null && row.valorContratado !== undefined
        ? toNumber(row.valorContratado)
        : null),
  });
}

function mergeLegacySanitizedData(
  base: ImportacaoLegadoXlsxRow,
  sanitizedData?: ImportacaoLegadoXlsxEditableFields,
) {
  if (!sanitizedData) return base;

  return importacaoLegadoXlsxRowSchema.parse({
    ...base,
    ...importacaoLegadoXlsxEditableFieldsSchema.parse(sanitizedData),
    linha: base.linha,
  });
}

function mapLegacyAnalysisRowToDbUpdate(
  row: ReturnType<typeof analyzeLegacyRows>["rows"][number],
  rawPayload: ImportacaoLegadoXlsxRow,
) {
  return {
    legacyId: row.legacyId,
    modalidade: row.modalidade,
    processoAdministrativo: row.processoAdministrativo,
    protocolo: row.protocolo,
    numeroEdital: row.numeroEdital,
    statusLegado: row.status,
    secretaria: row.secretaria,
    mappedSecretaria: row.mappedSecretaria,
    objetoResumo: row.objetoResumo,
    valorEstimado:
      row.valorEstimado !== null && row.valorEstimado !== undefined
        ? row.valorEstimado.toFixed(2)
        : null,
    valorContratado:
      row.valorContratado !== null && row.valorContratado !== undefined
        ? row.valorContratado.toFixed(2)
        : null,
    analysisSeverity: row.severity,
    issues: row.issues,
    duplicateFileCount: row.duplicateFileCount,
    duplicateGroupKey: row.duplicateGroupKey,
    internalMatches: row.internalMatches,
    importedMatches: row.importedMatches,
    rawPayload,
  };
}

function normalizeLookupText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeLookupText(value?: string | null) {
  return new Set(
    normalizeLookupText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

function findBestNamedMatch<T extends { nome: string }>(
  items: T[],
  query?: string | null,
) {
  if (!items.length || !query) return undefined;
  const normalizedQuery = normalizeLookupText(query);
  if (!normalizedQuery) return undefined;

  const exact = items.find(
    (item) => normalizeLookupText(item.nome) === normalizedQuery,
  );
  if (exact) return exact;

  const inclusive = items.find((item) => {
    const normalizedName = normalizeLookupText(item.nome);
    return (
      normalizedName.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedName)
    );
  });
  if (inclusive) return inclusive;

  const queryTokens = tokenizeLookupText(query);
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const itemTokens = tokenizeLookupText(item.nome);
    if (!itemTokens.size || !queryTokens.size) continue;
    let intersection = 0;
    for (const token of queryTokens) {
      if (itemTokens.has(token)) intersection += 1;
    }
    const score = intersection / Math.max(queryTokens.size, itemTokens.size);
    if (score >= 0.4 && (!best || score > best.score)) {
      best = { item, score };
    }
  }

  return best?.item;
}

function findBestStatusMatch<T extends { nome: string }>(
  items: T[],
  rawStatus?: string | null,
) {
  const normalized = normalizeLookupText(rawStatus);
  if (!normalized) return undefined;

  const keywordMap: Array<[string[], string]> = [
    [["homolog"], "HOMOLOGADO"],
    [["adjudic"], "ADJUDICADO"],
    [["public"], "PUBLICADO"],
    [["recepc", "proposta"], "RECEPÇÃO DE PROPOSTAS"],
    [["disputa"], "DISPUTA"],
    [["habilit"], "HABILITAÇÃO"],
    [["suspens"], "SUSPENSO"],
    [["revog"], "REVOGADO"],
    [["anul"], "ANULADO"],
    [["fracass"], "FRACASSADO"],
    [["desert"], "DESERTO"],
    [["planej", "arquiv", "intern"], "EM PLANEJAMENTO"],
  ];

  for (const [keywords, target] of keywordMap) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      const matched = findBestNamedMatch(items, target);
      if (matched) return matched;
    }
  }

  return findBestNamedMatch(items, rawStatus);
}

function inferLegacyTipoObjeto(
  modalidade?: string | null,
  objeto?: string | null,
): "PRODUTO" | "SERVICO_COMUM" | "SERVICO_ESPECIAL" | "SERVICO" | "OBRA" | "SERVICO_ENG" {
  const normalized = `${modalidade ?? ""} ${objeto ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    normalized.includes("engenharia") ||
    normalized.includes("reforma") ||
    normalized.includes("manutencao predial")
  ) {
    return "SERVICO_ENG";
  }
  if (
    normalized.includes("obra") ||
    normalized.includes("construcao") ||
    normalized.includes("pavimentacao")
  ) {
    return "OBRA";
  }
  if (normalized.includes("servico especial")) return "SERVICO_ESPECIAL";
  if (normalized.includes("servico")) return "SERVICO_COMUM";
  return "PRODUTO";
}

function mapWorkflowSituacaoFromExternal(value?: string | null) {
  const normalized = normalizeLookupText(value);

  if (!normalized) return "RASCUNHO" as const;
  if (normalized.includes("rascun")) return "RASCUNHO" as const;
  if (
    normalized.includes("conclu") ||
    normalized.includes("homolog") ||
    normalized.includes("finaliz")
  ) {
    return "CONCLUIDO" as const;
  }
  if (normalized.includes("suspens")) return "SUSPENSO" as const;
  if (
    normalized.includes("aguard") ||
    normalized.includes("analise") ||
    normalized.includes("analis")
  ) {
    return "AGUARDANDO" as const;
  }
  return "EM_ANDAMENTO" as const;
}

function parseLegacyDateToIso(value?: string | null) {
  const normalized = normalizeLegacyDateString(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseLegacyDateTimeToIso(
  dateValue?: string | null,
  timeValue?: string | null,
) {
  const dateIso = parseLegacyDateToIso(dateValue);
  if (!dateIso) return null;
  const timeNormalized = String(timeValue ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  const hours = timeNormalized ? String(Number(timeNormalized[1])).padStart(2, "0") : "09";
  const minutes = timeNormalized ? timeNormalized[2] : "00";
  return `${dateIso}T${hours}:${minutes}:00`;
}

function extractLegacyYear(raw: ImportacaoLegadoXlsxRow) {
  const dateCandidates = [
    raw.dataPublicacaoDom,
    raw.dataPublicacaoDou,
    raw.dataPublicacaoJornal,
    raw.dataAbertura,
    raw.dataHomologacao,
    raw.dataAdjudicacao,
    raw.dataAutorizacao,
  ];

  for (const candidate of dateCandidates) {
    const normalized = normalizeLegacyDateString(candidate);
    const match = normalized?.match(/\/(\d{4})$/);
    if (match) return Number(match[1]);
  }

  const identifierCandidates = [
    raw.numeroEdital,
    raw.processoAdministrativo,
    raw.protocolo,
    raw.legacyId,
  ];
  for (const candidate of identifierCandidates) {
    const match = String(candidate ?? "").match(/(20\d{2})/);
    if (match) return Number(match[1]);
  }

  return new Date().getFullYear();
}

function isLegacyProcessFinalized(rawStatus?: string | null) {
  const normalized = normalizeLookupText(rawStatus);
  return /homolog|fracass|desert|revog|anul|final|encerr/.test(normalized);
}

function isLegacyProcessPublished(raw: ImportacaoLegadoXlsxRow) {
  if (raw.dataPublicacaoDom || raw.dataPublicacaoDou || raw.dataPublicacaoJornal) {
    return true;
  }
  const normalized = normalizeLookupText(raw.status);
  return /public|proposta|disputa|habilit|homolog|adjudic|fracass|desert|revog|anul/.test(
    normalized,
  );
}

export const importacoesRouter = router({
  analyzeLegacyXlsx: operadorProcedure
    .input(importacaoLegadoXlsxAnalyzeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const { internalProcesses, importedProcesses, secretariasRows } =
        await loadLegacyAnalysisBases(db);

      const result = analyzeLegacyRows({
        rows: input.records,
        internalProcesses,
        importedProcesses,
        secretarias: secretariasRows,
      });

      await logAuditoria(ctx, {
        tabela: "importacao_legado_xlsx_analise",
        registroId: 0,
        acao: "CREATE",
        dadosNovos: {
          arquivo: input.filename,
          aba: input.sheetName,
          totalRegistros: input.records.length,
          resumo: result.summary,
        },
        descricao: `Análise prévia do lote legado XLSX "${input.filename}" (${input.sheetName}).`,
      });

      return result;
    }),

  createLegacyXlsxLote: operadorProcedure
    .input(importacaoLegadoXlsxAnalyzeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const { internalProcesses, importedProcesses, secretariasRows } =
        await loadLegacyAnalysisBases(db);

      const result = analyzeLegacyRows({
        rows: input.records,
        internalProcesses,
        importedProcesses,
        secretarias: secretariasRows,
      });
      const rawRecordsByLine = new Map(
        input.records.map((record) => [record.linha, record] as const),
      );

      const lote = await db.transaction(async (tx) => {
        const [createdLote] = await tx
          .insert(importacaoLegadoLotes)
          .values({
            filename: input.filename,
            sheetName: input.sheetName,
            totalRegistros: result.summary.totalRows,
            totalLimpos: result.summary.cleanRows,
            totalPendencias: result.summary.rowsWithIssues,
            totalCriticos: result.summary.criticalRows,
            totalMatchInterno: result.summary.rowsWithInternalMatches,
            totalMatchBase: result.summary.rowsWithImportedMatches,
            totalPendentesRevisao: result.summary.totalRows,
            issueBuckets: result.issueBuckets,
            duplicateGroups: result.duplicateGroups,
            criadoPor: ctx.user!.id,
          })
          .returning({ id: importacaoLegadoLotes.id });

        for (const chunk of chunkArray(result.rows, 250)) {
          await tx.insert(importacaoLegadoRegistros).values(
            chunk.map((row) => ({
              loteId: createdLote.id,
              linha: row.linha,
              legacyId: row.legacyId,
              modalidade: row.modalidade,
              processoAdministrativo: row.processoAdministrativo,
              protocolo: row.protocolo,
              numeroEdital: row.numeroEdital,
              statusLegado: row.status,
              secretaria: row.secretaria,
              mappedSecretaria: row.mappedSecretaria,
              objetoResumo: row.objetoResumo,
              valorEstimado:
                row.valorEstimado !== null
                  ? row.valorEstimado.toFixed(2)
                  : null,
              valorContratado:
                row.valorContratado !== null
                  ? row.valorContratado.toFixed(2)
                  : null,
              analysisSeverity: row.severity,
              issues: row.issues,
              duplicateFileCount: row.duplicateFileCount,
              duplicateGroupKey: row.duplicateGroupKey,
              internalMatches: row.internalMatches,
              importedMatches: row.importedMatches,
              rawPayload: rawRecordsByLine.get(row.linha) ?? {},
            })),
          );
        }

        return createdLote;
      });

      await logAuditoria(ctx, {
        tabela: "importacao_legado_lotes",
        registroId: lote.id,
        acao: "CREATE",
        dadosNovos: {
          arquivo: input.filename,
          aba: input.sheetName,
          totalRegistros: input.records.length,
          resumo: result.summary,
        },
        descricao: `Lote legado XLSX criado para saneamento manual: "${input.filename}" (${input.sheetName}).`,
      });

      return {
        loteId: lote.id,
        summary: result.summary,
        issueBuckets: result.issueBuckets,
        duplicateGroups: result.duplicateGroups,
      };
    }),

  listLegacyXlsxLotes: protectedProcedure
    .input(importacaoLegadoXlsxListLotesInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const offset = (input.page - 1) * input.pageSize;
      const [rows, totalRow] = await Promise.all([
        db
          .select({
            id: importacaoLegadoLotes.id,
            filename: importacaoLegadoLotes.filename,
            sheetName: importacaoLegadoLotes.sheetName,
            status: importacaoLegadoLotes.status,
            totalRegistros: importacaoLegadoLotes.totalRegistros,
            totalLimpos: importacaoLegadoLotes.totalLimpos,
            totalPendencias: importacaoLegadoLotes.totalPendencias,
            totalCriticos: importacaoLegadoLotes.totalCriticos,
            totalMatchInterno: importacaoLegadoLotes.totalMatchInterno,
            totalMatchBase: importacaoLegadoLotes.totalMatchBase,
            totalPendentesRevisao: importacaoLegadoLotes.totalPendentesRevisao,
            totalAprovadosImportacao:
              importacaoLegadoLotes.totalAprovadosImportacao,
            totalIgnorados: importacaoLegadoLotes.totalIgnorados,
            totalVinculadosInterno:
              importacaoLegadoLotes.totalVinculadosInterno,
            totalDuplicadosBase: importacaoLegadoLotes.totalDuplicadosBase,
            criadoEm: importacaoLegadoLotes.criadoEm,
            atualizadoEm: importacaoLegadoLotes.atualizadoEm,
          })
          .from(importacaoLegadoLotes)
          .orderBy(
            desc(importacaoLegadoLotes.criadoEm),
            desc(importacaoLegadoLotes.id),
          )
          .limit(input.pageSize)
          .offset(offset),
        db.select({ total: count() }).from(importacaoLegadoLotes),
      ]);

      const total = Number(totalRow[0]?.total ?? 0);
      return {
        items: rows,
        total,
        page: input.page,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      };
    }),

  getLegacyXlsxLoteDetail: protectedProcedure
    .input(importacaoLegadoXlsxDetailInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const [lote] = await db
        .select()
        .from(importacaoLegadoLotes)
        .where(eq(importacaoLegadoLotes.id, input.loteId))
        .limit(1);

      if (!lote) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lote legado não encontrado.",
        });
      }

      const filters = [eq(importacaoLegadoRegistros.loteId, input.loteId)];

      if (input.reviewStatus) {
        filters.push(
          eq(importacaoLegadoRegistros.reviewStatus, input.reviewStatus),
        );
      }
      if (input.severity) {
        filters.push(eq(importacaoLegadoRegistros.analysisSeverity, input.severity));
      }
      if (input.onlyIssues) {
        filters.push(or(
          eq(importacaoLegadoRegistros.analysisSeverity, "CRITICO"),
          eq(importacaoLegadoRegistros.analysisSeverity, "ATENCAO"),
        )!);
      }
      if (input.search) {
        const pattern = `%${input.search}%`;
        filters.push(
          or(
            ilike(importacaoLegadoRegistros.numeroEdital, pattern),
            ilike(importacaoLegadoRegistros.processoAdministrativo, pattern),
            ilike(importacaoLegadoRegistros.protocolo, pattern),
            ilike(importacaoLegadoRegistros.secretaria, pattern),
            ilike(importacaoLegadoRegistros.objetoResumo, pattern),
          )!,
        );
      }

      const whereClause = and(...filters);
      const offset = (input.page - 1) * input.pageSize;

      const [rows, totalRow] = await Promise.all([
        db
          .select({
            id: importacaoLegadoRegistros.id,
            linha: importacaoLegadoRegistros.linha,
            legacyId: importacaoLegadoRegistros.legacyId,
            modalidade: importacaoLegadoRegistros.modalidade,
            processoAdministrativo: importacaoLegadoRegistros.processoAdministrativo,
            protocolo: importacaoLegadoRegistros.protocolo,
            numeroEdital: importacaoLegadoRegistros.numeroEdital,
            status: importacaoLegadoRegistros.statusLegado,
            secretaria: importacaoLegadoRegistros.secretaria,
            mappedSecretaria: importacaoLegadoRegistros.mappedSecretaria,
            objetoResumo: importacaoLegadoRegistros.objetoResumo,
            valorEstimado: importacaoLegadoRegistros.valorEstimado,
            valorContratado: importacaoLegadoRegistros.valorContratado,
            severity: importacaoLegadoRegistros.analysisSeverity,
            issues: importacaoLegadoRegistros.issues,
            duplicateFileCount: importacaoLegadoRegistros.duplicateFileCount,
            duplicateGroupKey: importacaoLegadoRegistros.duplicateGroupKey,
            internalMatches: importacaoLegadoRegistros.internalMatches,
            importedMatches: importacaoLegadoRegistros.importedMatches,
            reviewStatus: importacaoLegadoRegistros.reviewStatus,
            reviewNotes: importacaoLegadoRegistros.reviewNotes,
            selectedInternalProcessId:
              importacaoLegadoRegistros.selectedInternalProcessId,
            selectedImportedProcessId:
              importacaoLegadoRegistros.selectedImportedProcessId,
            reviewedAt: importacaoLegadoRegistros.reviewedAt,
            rawPayload: importacaoLegadoRegistros.rawPayload,
          })
          .from(importacaoLegadoRegistros)
          .where(whereClause)
          .orderBy(
            desc(importacaoLegadoRegistros.analysisSeverity),
            importacaoLegadoRegistros.linha,
          )
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(importacaoLegadoRegistros)
          .where(whereClause),
      ]);

      const reviewCounts = {
        PENDENTE: lote.totalPendentesRevisao,
        APROVAR_IMPORTACAO: lote.totalAprovadosImportacao,
        IGNORAR: lote.totalIgnorados,
        VINCULAR_INTERNO: lote.totalVinculadosInterno,
        DUPLICADO_BASE: lote.totalDuplicadosBase,
        REVISAR:
          lote.totalRegistros -
          lote.totalPendentesRevisao -
          lote.totalAprovadosImportacao -
          lote.totalIgnorados -
          lote.totalVinculadosInterno -
          lote.totalDuplicadosBase,
      };

      return {
        lote: {
          ...lote,
          issueBuckets: lote.issueBuckets as unknown[],
          duplicateGroups: lote.duplicateGroups as unknown[],
          reviewCounts,
        },
        items: rows.map((row) => {
          const { rawPayload, ...baseRow } = row;
          const normalizedRawData = coerceLegacyRawPayload({
            linha: row.linha,
            legacyId: row.legacyId,
            modalidade: row.modalidade,
            processoAdministrativo: row.processoAdministrativo,
            protocolo: row.protocolo,
            numeroEdital: row.numeroEdital,
            statusLegado: row.status,
            secretaria: row.secretaria,
            objetoResumo: row.objetoResumo,
            valorEstimado: row.valorEstimado,
            valorContratado: row.valorContratado,
            rawPayload,
          });
          return {
            ...baseRow,
            secretaria: normalizedRawData.secretaria ?? baseRow.secretaria,
            mappedSecretaria:
              row.mappedSecretaria ?? normalizedRawData.secretaria ?? null,
            valorEstimado: row.valorEstimado ? toNumber(row.valorEstimado) : null,
            valorContratado: row.valorContratado
              ? toNumber(row.valorContratado)
              : null,
            rawData: normalizedRawData,
          };
        }),
        total: Number(totalRow[0]?.total ?? 0),
        page: input.page,
        totalPages: Math.max(1, Math.ceil(Number(totalRow[0]?.total ?? 0) / input.pageSize)),
      };
    }),

  updateLegacyXlsxRow: operadorProcedure
    .input(importacaoLegadoXlsxUpdateRowInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const loteRows = await db
        .select()
        .from(importacaoLegadoRegistros)
        .where(eq(importacaoLegadoRegistros.loteId, input.loteId))
        .orderBy(importacaoLegadoRegistros.linha);

      const before = loteRows.find((row) => row.id === input.rowId);

      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Linha do lote legado não encontrada.",
        });
      }

      if (
        input.reviewStatus === "VINCULAR_INTERNO" &&
        !input.selectedInternalProcessId
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione o processo interno antes de salvar a vinculação.",
        });
      }

      if (
        input.reviewStatus === "DUPLICADO_BASE" &&
        !input.selectedImportedProcessId
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione o registro da base importada antes de salvar.",
        });
      }

      const mergedTargetRaw = mergeLegacySanitizedData(
        coerceLegacyRawPayload(before),
        input.sanitizedData,
      );

      const { internalProcesses, importedProcesses, secretariasRows } =
        await loadLegacyAnalysisBases(db);
      const result = analyzeLegacyRows({
        rows: loteRows.map((row) =>
          row.id === input.rowId ? mergedTargetRaw : coerceLegacyRawPayload(row),
        ),
        internalProcesses,
        importedProcesses,
        secretarias: secretariasRows,
      });

      const analyzedRowsByLine = new Map(
        result.rows.map((row) => [row.linha, row] as const),
      );
      const rawRowsByLine = new Map<number, ImportacaoLegadoXlsxRow>(
        loteRows.map((row) => [
          row.linha,
          row.id === input.rowId ? mergedTargetRaw : coerceLegacyRawPayload(row),
        ]),
      );
      const rowsByLine = new Map(loteRows.map((row) => [row.linha, row] as const));
      const affectedLines = new Set<number>([before.linha]);

      if (before.duplicateGroupKey) {
        for (const row of loteRows) {
          if (row.duplicateGroupKey === before.duplicateGroupKey) {
            affectedLines.add(row.linha);
          }
        }
      }

      const targetAnalysis = analyzedRowsByLine.get(before.linha);
      if (targetAnalysis?.duplicateGroupKey) {
        const duplicateGroup = result.duplicateGroups.find(
          (group) => group.key === targetAnalysis.duplicateGroupKey,
        );
        for (const linha of duplicateGroup?.linhas ?? []) {
          affectedLines.add(linha);
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(importacaoLegadoLotes)
          .set({
            totalRegistros: result.summary.totalRows,
            totalLimpos: result.summary.cleanRows,
            totalPendencias: result.summary.rowsWithIssues,
            totalCriticos: result.summary.criticalRows,
            totalMatchInterno: result.summary.rowsWithInternalMatches,
            totalMatchBase: result.summary.rowsWithImportedMatches,
            issueBuckets: result.issueBuckets,
            duplicateGroups: result.duplicateGroups,
            atualizadoEm: new Date(),
          })
          .where(eq(importacaoLegadoLotes.id, input.loteId));

        for (const linha of affectedLines) {
          const currentRow = rowsByLine.get(linha);
          const analyzedRow = analyzedRowsByLine.get(linha);
          const rawPayload = rawRowsByLine.get(linha);
          if (!currentRow || !analyzedRow || !rawPayload) continue;

          await tx
            .update(importacaoLegadoRegistros)
            .set({
              ...mapLegacyAnalysisRowToDbUpdate(analyzedRow, rawPayload),
              ...(currentRow.id === input.rowId
                ? {
                    reviewStatus: input.reviewStatus,
                    reviewNotes: input.reviewNotes ?? null,
                    selectedInternalProcessId:
                      input.reviewStatus === "VINCULAR_INTERNO"
                        ? input.selectedInternalProcessId ?? null
                        : null,
                    selectedImportedProcessId:
                      input.reviewStatus === "DUPLICADO_BASE"
                        ? input.selectedImportedProcessId ?? null
                        : null,
                    reviewedBy: ctx.user!.id,
                    reviewedAt: new Date(),
                  }
                : {}),
              atualizadoEm: new Date(),
            })
            .where(eq(importacaoLegadoRegistros.id, currentRow.id));
        }

        await refreshLegacyLoteReviewCounts(tx, input.loteId);
      });

      const [after] = await db
        .select()
        .from(importacaoLegadoRegistros)
        .where(eq(importacaoLegadoRegistros.id, input.rowId))
        .limit(1);

      await logAuditoria(ctx, {
        tabela: "importacao_legado_registros",
        registroId: input.rowId,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: `Linha do lote legado ${input.loteId} revisada manualmente com status ${input.reviewStatus}.`,
      });

      return {
        message:
          input.sanitizedData && Object.keys(input.sanitizedData).length
            ? "Linha saneada, reanalisada e salva com sucesso."
            : "Decisão de saneamento registrada com sucesso.",
      };
    }),

  bulkUpdateLegacyXlsxRows: operadorProcedure
    .input(importacaoLegadoXlsxBulkUpdateRowsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      await db
        .update(importacaoLegadoRegistros)
        .set({
          reviewStatus: input.reviewStatus,
          reviewNotes: input.reviewNotes ?? null,
          selectedInternalProcessId: null,
          selectedImportedProcessId: null,
          reviewedBy: ctx.user!.id,
          reviewedAt: new Date(),
          atualizadoEm: new Date(),
        })
        .where(
          and(
            eq(importacaoLegadoRegistros.loteId, input.loteId),
            inArray(importacaoLegadoRegistros.id, input.rowIds),
          ),
        );

      await refreshLegacyLoteReviewCounts(db, input.loteId);

      await logAuditoria(ctx, {
        tabela: "importacao_legado_registros",
        registroId: 0,
        acao: "UPDATE",
        dadosNovos: {
          loteId: input.loteId,
          rowIds: input.rowIds,
          reviewStatus: input.reviewStatus,
        },
        descricao: `Saneamento manual em lote aplicado a ${input.rowIds.length} linha(s) do legado.`,
      });

      return {
        message: `${input.rowIds.length} linha(s) atualizadas no saneamento manual.`,
      };
    }),

  setLegacyXlsxLoteStatus: operadorProcedure
    .input(importacaoLegadoXlsxSetLoteStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db
        .select()
        .from(importacaoLegadoLotes)
        .where(eq(importacaoLegadoLotes.id, input.loteId))
        .limit(1);

      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lote legado não encontrado.",
        });
      }

      await db
        .update(importacaoLegadoLotes)
        .set({
          status: input.status,
          atualizadoEm: new Date(),
        })
        .where(eq(importacaoLegadoLotes.id, input.loteId));

      const [after] = await db
        .select()
        .from(importacaoLegadoLotes)
        .where(eq(importacaoLegadoLotes.id, input.loteId))
        .limit(1);

      await logAuditoria(ctx, {
        tabela: "importacao_legado_lotes",
        registroId: input.loteId,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: `Status do lote legado alterado para ${input.status}.`,
      });

      return {
        message: "Status do lote legado atualizado.",
      };
    }),

  importLegacyApprovedRows: gestorProcedure
    .input(importacaoLegadoXlsxImportApprovedInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [lote] = await db
        .select()
        .from(importacaoLegadoLotes)
        .where(eq(importacaoLegadoLotes.id, input.loteId))
        .limit(1);

      if (!lote) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lote legado não encontrado.",
        });
      }

      const rows = await db
        .select()
        .from(importacaoLegadoRegistros)
        .where(
          and(
            eq(importacaoLegadoRegistros.loteId, input.loteId),
            eq(importacaoLegadoRegistros.reviewStatus, "APROVAR_IMPORTACAO"),
          ),
        )
        .orderBy(importacaoLegadoRegistros.linha);

      if (!rows.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Este lote não possui linhas aprovadas para importação no momento.",
        });
      }

      const [secretariaRows, modalidadeRows, statusRows, peopleRows, existingProcesses] =
        await Promise.all([
          db
            .select({ id: secretarias.id, nome: secretarias.nome })
            .from(secretarias),
          db
            .select({ id: modalidades.id, nome: modalidades.nome })
            .from(modalidades),
          db
            .select({ id: statusProcesso.id, nome: statusProcesso.nome })
            .from(statusProcesso),
          db.select({ id: pessoas.id, nome: pessoas.nome }).from(pessoas),
          db
            .select({
              id: processos.id,
              numeroAdministrativo: processos.numeroAdministrativo,
              numeroEdital: processos.numeroEdital,
            })
            .from(processos),
        ]);

      const existingByAdministrativo = new Map<string, number>();
      const existingByEdital = new Map<string, number>();
      for (const row of existingProcesses) {
        const administrativo = normalizeLookupText(row.numeroAdministrativo);
        const edital = normalizeLookupText(row.numeroEdital);
        if (administrativo) existingByAdministrativo.set(administrativo, row.id);
        if (edital) existingByEdital.set(edital, row.id);
      }

      const successes: Array<{
        rowId: number;
        linha: number;
        processoId: number;
        numeroSirel: string;
        processSnapshot: Record<string, unknown>;
      }> = [];
      const failures: Array<{ rowId: number; linha: number; motivo: string }> = [];

      await db.transaction(async (tx) => {
        for (const row of rows) {
          const raw = coerceLegacyRawPayload(row);
          const secretariaName = row.mappedSecretaria ?? raw.secretaria ?? null;
          const matchedSecretaria = findBestNamedMatch(
            secretariaRows,
            secretariaName,
          );
          if (!matchedSecretaria) {
            failures.push({
              rowId: row.id,
              linha: row.linha,
              motivo:
                "A secretaria saneada não corresponde a nenhum cadastro interno.",
            });
            continue;
          }

          const objeto = String(
            raw.objeto ?? raw.resumoObjeto ?? row.objetoResumo ?? "",
          ).trim();
          if (objeto.length < 10) {
            failures.push({
              rowId: row.id,
              linha: row.linha,
              motivo: "O objeto saneado ainda está incompleto para importação.",
            });
            continue;
          }

          const normalizedAdministrativo = normalizeLookupText(
            raw.processoAdministrativo ?? row.processoAdministrativo ?? null,
          );
          const normalizedEdital = normalizeLookupText(
            raw.numeroEdital ?? row.numeroEdital ?? null,
          );
          const duplicateInternalId =
            (normalizedAdministrativo &&
              existingByAdministrativo.get(normalizedAdministrativo)) ||
            (normalizedEdital && existingByEdital.get(normalizedEdital)) ||
            null;

          if (duplicateInternalId) {
            failures.push({
              rowId: row.id,
              linha: row.linha,
              motivo:
                "Já existe um processo interno com o mesmo administrativo ou edital. Vincule manualmente em vez de importar.",
            });
            continue;
          }

          const matchedModalidade = findBestNamedMatch(
            modalidadeRows,
            raw.modalidade ?? row.modalidade ?? null,
          );
          const matchedStatus = findBestStatusMatch(
            statusRows,
            raw.status ?? row.statusLegado ?? null,
          );
          const matchedCondutor = findBestNamedMatch(
            peopleRows,
            raw.condutorProcesso ?? null,
          );

          const anoReferencia = extractLegacyYear(raw);
          const numeroSirel = await getNextNumeroSirel(tx, anoReferencia);
          const dataPublicacao =
            parseLegacyDateTimeToIso(raw.dataPublicacaoDom) ??
            parseLegacyDateTimeToIso(raw.dataPublicacaoDou) ??
            parseLegacyDateTimeToIso(raw.dataPublicacaoJornal);
          const dataAbertura = parseLegacyDateToIso(raw.dataAbertura);
          const dataEntradaLicitacao =
            parseLegacyDateToIso(raw.dataEntrada) ??
            parseLegacyDateToIso(raw.dataInicio);
          const dataDisputaSessao = parseLegacyDateTimeToIso(
            raw.dataAbertura,
            raw.horarioAbertura ?? raw.horarioInicio,
          );
          const dataEncerramento =
            parseLegacyDateToIso(raw.dataHomologacao) ??
            parseLegacyDateToIso(raw.dataAdjudicacao);
          const published = isLegacyProcessPublished(raw);
          const finalized = isLegacyProcessFinalized(raw.status);
          const homologated =
            normalizeLookupText(raw.status).includes("homolog") ||
            Boolean(raw.dataHomologacao);
          const processInsert: typeof processos.$inferInsert = {
            numeroSirel,
            protocolo: raw.protocolo ?? row.protocolo ?? null,
            dataEntradaLicitacao: dataEntradaLicitacao ?? null,
            numeroAdministrativo:
              raw.processoAdministrativo ??
              row.processoAdministrativo ??
              null,
            numeroEdital: raw.numeroEdital ?? row.numeroEdital ?? null,
            anoReferencia,
            foraDoFluxo: true,
            origemCadastro: "LEGADO",
            secretariaId: matchedSecretaria.id,
            modalidadeId: matchedModalidade?.id ?? null,
            statusId: matchedStatus?.id ?? null,
            condutorProcessoId: matchedCondutor?.id ?? null,
            objeto,
            valorEstimado:
              row.valorEstimado !== null && row.valorEstimado !== undefined
                ? toNumber(row.valorEstimado).toFixed(2)
                : null,
            valorHomologado:
              row.valorContratado !== null && row.valorContratado !== undefined
                ? toNumber(row.valorContratado).toFixed(2)
                : null,
            modoDisputa: "NAO_SE_APLICA",
            tipoObjeto: inferLegacyTipoObjeto(
              raw.modalidade ?? row.modalidade,
              objeto,
            ),
            tipoContratacao: "AQUISICAO",
            dataAbertura: dataAbertura ?? null,
            dataPublicacao: dataPublicacao ? new Date(dataPublicacao) : null,
            dataDisputaSessao: dataDisputaSessao
              ? new Date(dataDisputaSessao)
              : null,
            dataEncerramento: dataEncerramento ?? null,
            ativo: true,
            publicado: published,
            homologado: homologated,
            finalizado: finalized,
            criadoPor: ctx.user?.id ?? null,
          };

          const [created] = await tx
            .insert(processos)
            .values(processInsert)
            .returning();

          const situacao = mapWorkflowSituacaoFromExternal(raw.status);
          await tx.insert(workflowProcesso).values({
            processoId: created.id,
            moduloAtual: "LICITACAO",
            situacao,
            etapaAtual: finalized
              ? "Importação concluída do legado"
              : "Importação inicial do legado",
            dataInicio: dataPublicacao?.slice(0, 10) ?? null,
            dataConclusao:
              situacao === "CONCLUIDO"
                ? dataEncerramento ?? new Date().toISOString().slice(0, 10)
                : null,
          });

          await tx.insert(movimentacoesWorkflow).values({
            processoId: created.id,
            moduloOrigem: "SISTEMA",
            moduloDestino: "LICITACAO",
            descricao: "Processo importado do lote legado",
            observacao: `Linha ${row.linha} do lote legado #${input.loteId} incorporada ao SIREL com tag LEGADO.`,
            usuarioId: ctx.user?.id ?? null,
          });

          const reviewNoteBase = [
            row.reviewNotes?.trim(),
            `Processo ${created.numeroSirel} importado para a base operacional com tag LEGADO.`,
          ]
            .filter(Boolean)
            .join(" ");

          await tx
            .update(importacaoLegadoRegistros)
            .set({
              reviewStatus: "VINCULAR_INTERNO",
              selectedInternalProcessId: created.id,
              selectedImportedProcessId: null,
              reviewNotes: reviewNoteBase,
              reviewedBy: ctx.user?.id ?? null,
              reviewedAt: new Date(),
              atualizadoEm: new Date(),
            })
            .where(eq(importacaoLegadoRegistros.id, row.id));

          successes.push({
            rowId: row.id,
            linha: row.linha,
            processoId: created.id,
            numeroSirel: created.numeroSirel,
            processSnapshot: created as unknown as Record<string, unknown>,
          });
          if (normalizedAdministrativo) {
            existingByAdministrativo.set(normalizedAdministrativo, created.id);
          }
          if (normalizedEdital) {
            existingByEdital.set(normalizedEdital, created.id);
          }
        }

        if (successes.length) {
          await refreshLegacyLoteReviewCounts(tx, input.loteId);
        }
      });

      await logAuditoria(ctx, {
        tabela: "importacao_legado_lotes",
        registroId: input.loteId,
        acao: "UPDATE",
        dadosNovos: {
          loteId: input.loteId,
          importedRows: successes,
          failedRows: failures,
        },
        descricao: `Importação final do lote legado #${input.loteId}: ${successes.length} processo(s) criado(s) e ${failures.length} pendência(s) bloqueadas.`,
      });

      for (const created of successes) {
        await logAuditoria(ctx, {
          tabela: "processos",
          registroId: created.processoId,
          acao: "CREATE",
          dadosNovos: created.processSnapshot,
          descricao: `Processo ${created.numeroSirel} importado do lote legado #${input.loteId}.`,
        });
      }

      return {
        message:
          failures.length > 0
            ? `Importação concluída com ressalvas: ${successes.length} processo(s) criado(s) e ${failures.length} linha(s) permaneceram pendentes.`
            : `Importação concluída com sucesso: ${successes.length} processo(s) legado(s) criado(s) no SIREL.`,
        created: successes.map(({ processSnapshot, ...item }) => item),
        failures,
      };
    }),

  summary: protectedProcedure.query(async () => {
    const { processRows, executionRows } = await getImportSummaryCounts();
    const conciliation = await getConciliationSummaryCounts();
    const counts = {
      LICITACAO: { registros: 0, itens: 0 },
      COMPRA_DIRETA: { registros: 0, itens: 0 },
    };

    for (const row of processRows) {
      counts[row.origem] = {
        registros: Number(row.total ?? 0),
        itens: Number(row.itens ?? 0),
      };
    }

    const lastSuccessfulBySource = {
      LICITACAO:
        executionRows.find(
          (row) => row.origem === "LICITACAO" && row.status === "CONCLUIDA",
        ) ?? null,
      COMPRA_DIRETA:
        executionRows.find(
          (row) => row.origem === "COMPRA_DIRETA" && row.status === "CONCLUIDA",
        ) ?? null,
    };

    return {
      counts,
      lastExecution: executionRows[0] ?? null,
      lastSuccessfulBySource,
      conciliation,
      scheduler: getImportSchedulerConfig(),
      sources: remoteImportSources,
    };
  }),

  list: protectedProcedure
    .input(importacaoBllListInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const filters: any[] = [];

      if (input.source) {
        filters.push(eq(importacaoBllProcessos.origem, input.source));
      }

      if (input.conciliationStatus) {
        filters.push(
          eq(
            importacaoBllProcessos.statusConciliacao,
            input.conciliationStatus,
          ),
        );
      }

      if (input.search) {
        const pattern = `%${input.search}%`;
        filters.push(
          or(
            ilike(importacaoBllProcessos.chaveExterna, pattern),
            ilike(importacaoBllProcessos.numeroEdital, pattern),
            ilike(importacaoBllProcessos.numeroAdministrativo, pattern),
            ilike(importacaoBllProcessos.modalidade, pattern),
            ilike(importacaoBllProcessos.objeto, pattern),
            ilike(importacaoBllProcessos.condutorNome, pattern),
            ilike(importacaoBllProcessos.coordenadorNome, pattern),
            ilike(importacaoBllProcessos.autoridadeNome, pattern),
            ilike(importacaoBllProcessos.fornecedorNome, pattern),
          ),
        );
      }

      const whereClause = filters.length ? and(...filters) : undefined;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, totalRow] = await Promise.all([
        db
          .select({
            id: importacaoBllProcessos.id,
            origem: importacaoBllProcessos.origem,
            chaveExterna: importacaoBllProcessos.chaveExterna,
            idOrigem: importacaoBllProcessos.idOrigem,
            numeroEdital: importacaoBllProcessos.numeroEdital,
            numeroAdministrativo: importacaoBllProcessos.numeroAdministrativo,
            anoReferencia: importacaoBllProcessos.anoReferencia,
            modalidade: importacaoBllProcessos.modalidade,
            situacaoExterna: importacaoBllProcessos.situacaoExterna,
            tipoContrato: importacaoBllProcessos.tipoContrato,
            artigo: importacaoBllProcessos.artigo,
            inciso: importacaoBllProcessos.inciso,
            objeto: importacaoBllProcessos.objeto,
            condutorNome: importacaoBllProcessos.condutorNome,
            coordenadorNome: importacaoBllProcessos.coordenadorNome,
            autoridadeNome: importacaoBllProcessos.autoridadeNome,
            fornecedorNome: importacaoBllProcessos.fornecedorNome,
            valorReferencia: importacaoBllProcessos.valorReferencia,
            valorTotal: importacaoBllProcessos.valorTotal,
            publicacaoEm: importacaoBllProcessos.publicacaoEm,
            conclusaoEm: importacaoBllProcessos.conclusaoEm,
            inicioRecepcaoEm: importacaoBllProcessos.inicioRecepcaoEm,
            fimRecepcaoEm: importacaoBllProcessos.fimRecepcaoEm,
            inicioDisputaEm: importacaoBllProcessos.inicioDisputaEm,
            linkExterno: importacaoBllProcessos.linkExterno,
            totalLotes: importacaoBllProcessos.totalLotes,
            totalItens: importacaoBllProcessos.totalItens,
            processoInternoId: importacaoBllProcessos.processoInternoId,
            statusConciliacao: importacaoBllProcessos.statusConciliacao,
            scoreConciliacao: importacaoBllProcessos.scoreConciliacao,
            processoInternoNumeroSirel: processos.numeroSirel,
            processoInternoNumeroAdministrativo: processos.numeroAdministrativo,
            processoInternoModuloAtual: workflowProcesso.moduloAtual,
            ultimaAtualizacaoEm: importacaoBllProcessos.ultimaAtualizacaoEm,
            ultimaExecucaoId: importacaoBllProcessos.ultimaExecucaoId,
          })
          .from(importacaoBllProcessos)
          .leftJoin(
            processos,
            eq(processos.id, importacaoBllProcessos.processoInternoId),
          )
          .leftJoin(
            workflowProcesso,
            eq(workflowProcesso.processoId, processos.id),
          )
          .where(whereClause)
          .orderBy(
            desc(importacaoBllProcessos.publicacaoEm),
            desc(importacaoBllProcessos.ultimaAtualizacaoEm),
            desc(importacaoBllProcessos.id),
          )
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(importacaoBllProcessos)
          .where(whereClause),
      ]);

      const total = Number(totalRow[0]?.total ?? 0);

      return {
        items: rows.map((row) => ({
          ...row,
          valorReferencia: row.valorReferencia
            ? toNumber(row.valorReferencia)
            : null,
          valorTotal: row.valorTotal ? toNumber(row.valorTotal) : null,
        })),
        total,
        page: input.page,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      };
    }),

  detail: protectedProcedure
    .input(importacaoBllDetailInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const [record] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.id))
        .limit(1);
      if (!record) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      const warnings: string[] = [];

      let items: (typeof importacaoBllItens.$inferSelect)[] = [];
      try {
        items = await db
          .select()
          .from(importacaoBllItens)
          .where(eq(importacaoBllItens.processoImportadoId, input.id))
          .orderBy(
            importacaoBllItens.loteNumero,
            importacaoBllItens.itemNumero,
            importacaoBllItens.id,
          );
      } catch (error) {
        warnings.push(
          "Não foi possível carregar os itens importados. Verifique se as migrations estão atualizadas.",
        );
      }

      let execution = null;
      if (record.ultimaExecucaoId) {
        try {
          execution =
            (
              await db
                .select()
                .from(importacaoBllExecucoes)
                .where(eq(importacaoBllExecucoes.id, record.ultimaExecucaoId))
                .limit(1)
            )[0] ?? null;
        } catch (error) {
          warnings.push(
            "Não foi possível carregar os dados da execução desta importação.",
          );
        }
      }

      let linkedProcess = null;
      try {
        linkedProcess = await getLinkedInternalProcess(input.id);
      } catch (error) {
        warnings.push(
          "Não foi possível carregar o vínculo com o processo interno.",
        );
      }

      let suggestions: Awaited<ReturnType<typeof getConciliationSuggestions>> =
        [];
      try {
        suggestions = await getConciliationSuggestions(input.id, {
          limit: 8,
        });
      } catch (error) {
        warnings.push(
          "Não foi possível carregar sugestões de conciliação automática.",
        );
      }

      return {
        record: {
          ...record,
          valorReferencia: record.valorReferencia
            ? toNumber(record.valorReferencia)
            : null,
          valorTotal: record.valorTotal ? toNumber(record.valorTotal) : null,
        },
        items: items.map((item) => ({
          ...item,
          quantidade: item.quantidade ? Number(item.quantidade) : null,
          valorReferencia: item.valorReferencia
            ? toNumber(item.valorReferencia)
            : null,
          valorUnitario: item.valorUnitario
            ? toNumber(item.valorUnitario)
            : null,
          subtotal: item.subtotal ? toNumber(item.subtotal) : null,
        })),
        execution,
        linkedProcess,
        suggestions,
        warnings,
      };
    }),

  executions: protectedProcedure
    .input(importacaoBllExecutionListInputSchema)
    .query(async ({ input }) => {
      const db = requireDb();
      const filters = input.source
        ? [eq(importacaoBllExecucoes.origem, input.source)]
        : [];
      const whereClause = filters.length ? and(...filters) : undefined;
      const offset = (input.page - 1) * input.pageSize;

      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(importacaoBllExecucoes)
          .where(whereClause)
          .orderBy(
            desc(importacaoBllExecucoes.iniciadoEm),
            desc(importacaoBllExecucoes.id),
          )
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ total: count() })
          .from(importacaoBllExecucoes)
          .where(whereClause),
      ]);

      const total = Number(totalRow[0]?.total ?? 0);
      return {
        items: rows,
        total,
        page: input.page,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      };
    }),

  searchProcessos: protectedProcedure
    .input(importacaoBllSearchProcessosInputSchema)
    .query(async ({ input }) => {
      const suggestions = await getConciliationSuggestions(input.importedId, {
        search: input.search,
        limit: input.pageSize,
      });

      return {
        items: suggestions,
      };
    }),

  linkProcesso: operadorProcedure
    .input(importacaoBllLinkProcessoInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      try {
        await linkImportedProcessToInternal(
          input.importedId,
          input.processoId,
          ctx.user!.id,
          "MANUAL",
        );
      } catch (error) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível vincular o processo interno.",
        });
      }

      const [after] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: input.importedId,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: `Registro importado vinculado ao processo interno ${input.processoId}`,
      });

      return {
        message: "Vínculo realizado com sucesso.",
      };
    }),

  unlinkProcesso: operadorProcedure
    .input(importacaoBllUnlinkProcessoInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      await unlinkImportedProcess(input.importedId);

      const [after] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: input.importedId,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: "Vínculo com processo interno removido.",
      });

      return {
        message: "Vínculo removido.",
      };
    }),

  setIgnored: operadorProcedure
    .input(importacaoBllSetIgnoredInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      await setImportedProcessIgnored(
        input.importedId,
        input.ignored,
        ctx.user!.id,
      );

      const [after] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: input.importedId,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: input.ignored
          ? "Registro importado marcado como ignorado."
          : "Registro importado reaberto para conciliação.",
      });

      return {
        message: input.ignored
          ? "Registro marcado como ignorado."
          : "Registro reaberto para conciliação.",
      };
    }),

  deleteProcesso: operadorProcedure
    .input(importacaoBllDeleteProcessoInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const [before] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      await deleteImportedProcess(input.importedId);

      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: input.importedId,
        acao: "DELETE",
        dadosAnteriores: before,
        dadosNovos: null,
        descricao: "Registro importado excluído manualmente.",
      });

      return {
        message: "Registro importado excluído com sucesso.",
      };
    }),

  deleteProcessos: operadorProcedure
    .input(importacaoBllDeleteProcessosInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();
      const rows = await db
        .select()
        .from(importacaoBllProcessos)
        .where(inArray(importacaoBllProcessos.id, input.importedIds));

      if (!rows.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nenhum registro importado encontrado para exclusão.",
        });
      }

      await deleteImportedProcesses(input.importedIds);

      for (const row of rows) {
        await logAuditoria(ctx, {
          tabela: "importacao_bll_processos",
          registroId: row.id,
          acao: "DELETE",
          dadosAnteriores: row,
          dadosNovos: null,
          descricao: "Registro importado excluído manualmente em lote.",
        });
      }

      return {
        message: `${rows.length} registro(s) importado(s) excluído(s) com sucesso.`,
      };
    }),

  autoReconcile: operadorProcedure
    .input(importacaoBllAutoReconcileInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await autoReconcileImportedProcesses({
        source: input.source,
        onlyPending: input.onlyPending,
        userId: ctx.user!.id,
      });

      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: 0,
        acao: "UPDATE",
        dadosNovos: result,
        descricao: `Conciliação automática executada${input.source ? ` para ${input.source}` : ""}.`,
      });

      return {
        message: `Conciliação concluída: ${result.vinculados} vínculo(s), ${result.sugeridos} sugestão(ões) e ${result.pendentes} pendência(s).`,
        result,
      };
    }),

  syncRemote: operadorProcedure
    .input(importacaoBllRemoteSyncInputSchema)
    .mutation(async ({ ctx, input }) => {
      const results: Array<{
        executionId: number;
        origem: "LICITACAO" | "COMPRA_DIRETA";
        totalRegistros: number;
        totalItens: number;
      }> = [];
      const errors: string[] = [];

      if (input.source) {
        try {
          const result = await syncRemoteImport(input.source, {
            criadoPor: ctx.user!.id,
          });
          results.push(result);
        } catch (error) {
          errors.push(
            `${input.source}: ${error instanceof Error ? error.message : "falha desconhecida"}`,
          );
        }
      } else {
        for (const source of Object.keys(remoteImportSources) as Array<
          "LICITACAO" | "COMPRA_DIRETA"
        >) {
          try {
            const result = await syncRemoteImport(source, {
              criadoPor: ctx.user!.id,
            });
            results.push(result);
          } catch (error) {
            errors.push(
              `${source}: ${error instanceof Error ? error.message : "falha desconhecida"}`,
            );
          }
        }
      }

      if (!results.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            errors[0] ??
            "Não foi possível concluir a sincronização remota para nenhuma origem.",
        });
      }

      for (const result of results) {
        await logAuditoria(ctx, {
          tabela: "importacao_bll_execucoes",
          registroId: result.executionId,
          acao: "CREATE",
          dadosNovos: result,
          descricao: `Sincronização remota executada para ${result.origem}`,
        });
      }

      if (errors.length) {
        await logAuditoria(ctx, {
          tabela: "importacao_bll_execucoes",
          registroId: 0,
          acao: "UPDATE",
          dadosNovos: { errors },
          descricao:
            "Sincronização remota concluída com falhas parciais em uma ou mais origens.",
        });
      }

      const resumo = results
        .map(
          (result) =>
            `${result.origem}: ${result.totalRegistros} registro(s), ${result.totalItens} item(ns)`,
        )
        .join(" • ");

      return {
        message:
          errors.length > 0
            ? `Sincronização parcial concluída (${results.length}/${results.length + errors.length} origem(ns)). ${resumo}. Falhas: ${errors.join(" | ")}`
            : `Sincronização concluída para ${results.length} origem(ns). ${resumo}`,
        results,
        errors,
      };
    }),

  localSyncStatus: protectedProcedure
    .input(importacaoBllLocalSyncStatusInputSchema)
    .query(async ({ input }) => {
      const status = await getBllLocalSyncStatus();
      const basePayload = {
        ...status,
        processo: null as
          | {
              id: number;
              numeroSirel: string;
              numeroAdministrativo: string | null;
              numeroEdital: string | null;
              origem: "LICITACAO" | "COMPRA_DIRETA" | null;
              linkExterno: string | null;
              ultimaAtualizacaoEm: Date | null;
            }
          | null,
      };

      if (!input.processoId) {
        return basePayload;
      }

      const db = requireDb();
      const [processo] = await db
        .select({
          id: processos.id,
          numeroSirel: processos.numeroSirel,
          numeroAdministrativo: processos.numeroAdministrativo,
          numeroEdital: processos.numeroEdital,
          linkExterno: importacaoBllProcessos.linkExterno,
          linkBllManual: licitacoes.linkBllPublico,
          origem: importacaoBllProcessos.origem,
          ultimaAtualizacaoEm: importacaoBllProcessos.ultimaAtualizacaoEm,
        })
        .from(processos)
        .leftJoin(
          importacaoBllProcessos,
          eq(importacaoBllProcessos.processoInternoId, processos.id),
        )
        .leftJoin(licitacoes, eq(licitacoes.processoId, processos.id))
        .where(eq(processos.id, input.processoId))
        .limit(1);

      return {
        ...basePayload,
        processo:
          processo && (processo.linkExterno || processo.linkBllManual)
            ? {
                id: processo.id,
                numeroSirel: processo.numeroSirel,
                numeroAdministrativo: processo.numeroAdministrativo,
                numeroEdital: processo.numeroEdital,
                origem: processo.origem ?? "LICITACAO",
                linkExterno: processo.linkExterno ?? processo.linkBllManual,
                ultimaAtualizacaoEm: processo.ultimaAtualizacaoEm,
              }
            : processo
              ? {
                  id: processo.id,
                  numeroSirel: processo.numeroSirel,
                  numeroAdministrativo: processo.numeroAdministrativo,
                  numeroEdital: processo.numeroEdital,
                  origem: processo.origem,
                  linkExterno: null,
                  ultimaAtualizacaoEm: processo.ultimaAtualizacaoEm,
                }
              : null,
      };
    }),

  localSyncProcesso: operadorProcedure
    .input(importacaoBllLocalSyncProcessInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await startBllLocalSync({
        processoId: input.processoId,
        dryRun: input.dryRun,
        userId: ctx.user?.id ?? null,
      });

      await logAuditoria(ctx, {
        tabela: "importacao_bll_execucoes",
        registroId: result.executionId,
        acao: "CREATE",
        dadosNovos: result,
        descricao: input.dryRun
          ? `Simulação da sincronização local BLL iniciada para o processo ${input.processoId}.`
          : `Sincronização local BLL iniciada para o processo ${input.processoId}.`,
      });

      return result;
    }),

  localSyncLote: operadorProcedure
    .input(importacaoBllLocalSyncBatchInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await startBllLocalSync({
        processoIds: input.processoIds,
        source: input.source,
        dryRun: input.dryRun,
        userId: ctx.user?.id ?? null,
        limit: input.limit,
        pageLimit: input.pageLimit,
      });

      await logAuditoria(ctx, {
        tabela: "importacao_bll_execucoes",
        registroId: result.executionId,
        acao: "CREATE",
        dadosNovos: result,
        descricao: input.dryRun
          ? "Simulação da sincronização local BLL iniciada em lote."
          : "Sincronização local BLL iniciada em lote.",
      });

      return result;
    }),

  localSyncCancel: operadorProcedure
    .input(importacaoBllLocalSyncCancelInputSchema)
    .mutation(async ({ ctx }) => {
      const result = await cancelBllLocalSync();

      if (result.cancelled && result.executionId) {
        await logAuditoria(ctx, {
          tabela: "importacao_bll_execucoes",
          registroId: result.executionId,
          acao: "UPDATE",
          dadosNovos: result,
          descricao: "Cancelamento solicitado para a sincronização local BLL.",
        });
      }

      return result;
    }),

  importCsv: operadorProcedure
    .input(importacaoBllCsvInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await importCsvBundle({
        source: input.source,
        registrosFilename: input.registrosFilename,
        registrosContent: input.registrosContent,
        itensFilename: input.itensFilename,
        itensContent: input.itensContent,
        criadoPor: ctx.user!.id,
      });

      await logAuditoria(ctx, {
        tabela: "importacao_bll_execucoes",
        registroId: result.executionId,
        acao: "CREATE",
        dadosNovos: result,
        descricao: `Importação manual por CSV executada para ${result.origem}`,
      });

      return {
        message: `Importação manual concluída com ${result.totalRegistros} registro(s).`,
        result,
      };
    }),

  // PNCP Conciliation endpoints
  searchPncpProcesses: protectedProcedure
    .input(importacaoBllSearchProcessosInputSchema) // Reutilizando schema similar
    .query(async ({ input }) => {
      // Por enquanto, busca processos PNCP recentes para demonstração
      const pncpResults = await searchPncpProcesses({
        pagina: 1,
        tamanhoPagina: input.pageSize,
      });

      return {
        items: pncpResults.data.map((process) => ({
          processoId:
            parseInt(process.numeroControlePNCP.replace(/\D/g, "")) || 0,
          numeroSirel: process.numeroControlePNCP,
          numeroAdministrativo: null,
          numeroEdital: null,
          objeto: process.objetoCompra,
          modalidade: process.modalidadeNome,
          secretaria: process.orgaoEntidadeNome,
          moduloAtual: null,
          valorEstimado: process.valorTotalEstimado,
          score: 0,
          nivel: "BAIXO" as const,
          motivos: [`Processo PNCP: ${process.numeroControlePNCP}`],
        })),
      };
    }),

  getPncpSuggestions: protectedProcedure
    .input(importacaoBllDetailInputSchema)
    .query(async ({ input }) => {
      const suggestions = await generatePncpConciliationSuggestions(
        input.id,
        10,
      );

      return {
        suggestions: suggestions.map((s) => ({
          processoId:
            parseInt(s.pncpProcess.numeroControlePNCP.replace(/\D/g, "")) || 0,
          numeroSirel: s.pncpProcess.numeroControlePNCP,
          numeroAdministrativo: null,
          numeroEdital: null,
          objeto: s.pncpProcess.objetoCompra,
          modalidade: s.pncpProcess.modalidadeNome,
          secretaria: s.pncpProcess.orgaoEntidadeNome,
          moduloAtual: null,
          valorEstimado: s.pncpProcess.valorTotalEstimado,
          score: s.score,
          nivel: s.nivel,
          motivos: s.motivos,
        })),
      };
    }),

  linkPncpProcess: operadorProcedure
    .input(importacaoBllLinkProcessoInputSchema) // Reutilizando schema
    .mutation(async ({ ctx, input }) => {
      const db = requireDb();

      // Busca dados do processo PNCP
      const pncpDetails = await getPncpProcessDetails(
        new Date().getFullYear(), // Ano atual como fallback
        input.processoId,
      );

      const [before] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);

      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registro importado não encontrado.",
        });
      }

      // Atualiza com dados PNCP
      await db
        .update(importacaoBllProcessos)
        .set({
          codigoPncp: pncpDetails.numeroControlePNCP,
          urlPncp: pncpDetails.urlProcesso,
          dataSincronizacaoPncp: new Date(),
          statusConciliacao: "VINCULADO" as const,
          detalhesConciliacao: {
            tipo: "PNCP_MANUAL",
            pncpProcess: pncpDetails,
            conciliadoPor: ctx.user!.id,
            conciliadoEm: new Date(),
          },
        })
        .where(eq(importacaoBllProcessos.id, input.importedId));

      const [after] = await db
        .select()
        .from(importacaoBllProcessos)
        .where(eq(importacaoBllProcessos.id, input.importedId))
        .limit(1);

      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: input.importedId,
        acao: "UPDATE",
        dadosAnteriores: before,
        dadosNovos: after,
        descricao: `Registro importado vinculado ao processo PNCP ${pncpDetails.numeroControlePNCP}`,
      });

      return {
        message: "Vínculo com PNCP realizado com sucesso.",
      };
    }),

  autoConciliatePncp: operadorProcedure
    .input(importacaoBllAutoReconcileInputSchema) // Reutilizando schema
    .mutation(async ({ ctx, input }) => {
      const result = await executeAutomaticPncpConciliation(
        input.source,
        75, // Score mínimo para conciliação automática
      );

      await logAuditoria(ctx, {
        tabela: "importacao_bll_processos",
        registroId: 0,
        acao: "UPDATE",
        dadosNovos: result,
        descricao: `Conciliação automática PNCP executada${input.source ? ` para ${input.source}` : ""}.`,
      });

      return {
        message: `Conciliação PNCP concluída: ${result.conciliations} conciliação(ões), ${result.processed} processado(s) e ${result.errors} erro(s).`,
        result,
      };
    }),
});
