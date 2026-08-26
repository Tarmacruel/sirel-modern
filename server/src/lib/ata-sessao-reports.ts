import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import {
  ataSessaoProcessResultSchema,
  type AtaSessaoProcessInput,
  type AtaSessaoProcessResult,
} from "@sirel/shared/schemas/ata-sessao";
import { desc, eq } from "drizzle-orm";

import { requireDb } from "../db/client.js";
import {
  documentos,
  itensProcesso,
  itensProcessoValores,
  lotes,
  processos,
} from "../db/schema.js";
import { removeAutomaticReportDirectory } from "./ata-sessao-upload.js";
import { projectRoot } from "./project-root.js";
import { getSystemParamValue } from "./system-params.js";

const execFileAsync = promisify(execFile);
const repoRoot = projectRoot;
const reportsRoot = resolve(repoRoot, "storage/reports/atas-sessao");
const uploadsRoot = resolve(repoRoot, "storage/uploads");
const pythonScriptPath = resolve(
  repoRoot,
  "scripts/process_ata_sessao_reports.py",
);
const defaultLogoPath = resolve(repoRoot, "client/public/logo-prefeitura.png");

export class AtaSessaoReportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtaSessaoReportInputError";
  }
}

export function isAtaSessaoReportInputError(error: unknown) {
  if (error instanceof AtaSessaoReportInputError) return true;
  const message = String(error instanceof Error ? error.message : error)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return [
    "pdf sem camada de texto",
    "numero da sd nao identificado",
    "nenhum item foi extraido da sd",
    "estrutura da sd",
    "estrutura nao reconhecida",
    "nenhum lote",
    "arquivo pdf invalido",
  ].some((fragment) => message.includes(fragment));
}

export type AtaSessaoParsedPayload = {
  source_path: string;
  generated_at: string;
  edital?: string | null;
  processo_administrativo?: string | null;
  summary: {
    total_lotes: number;
    em_andamento: number;
    adjudicados: number;
    fase_recursal: number;
    malsucedidos: number;
    warnings: number;
    parsing_errors: number;
  };
  warnings?: string[];
  parsing_errors?: Array<Record<string, string>>;
  lotes?: Array<Record<string, unknown>>;
  enrichment?: Record<string, unknown>;
  estimated_value_reconciliation?: {
    source?: string;
    sd_number?: string | null;
    total_failed_lots?: number;
    fully_matched_lots?: number;
    partially_matched_lots?: number;
    unmatched_lots?: Array<number | string>;
    ambiguous_lots?: Array<number | string>;
    total_failed_items?: number;
    matched_items?: number;
    ambiguous_items?: number;
    unmatched_items?: number;
    warnings?: string[];
    lots?: Array<Record<string, unknown>>;
  };
  artifacts?: Record<string, string>;
};

type AtaSessaoReportArtifact = AtaSessaoProcessResult["artifacts"][number];

type AtaSessaoSourceInfo = {
  sourceFile: string;
  processoId: number | null;
};

type AtaSessaoPipelineOptions = {
  removeAutomaticOutputOnFailure?: boolean;
};

export type ParsedAtaLotItem = {
  item_numero?: string | null;
  descricao?: string | null;
  quantidade?: number | null;
  unidade?: string | null;
  valor_unitario_estimado?: number | null;
  valor_total_estimado?: number | null;
  valor_estimado_fonte?: string | null;
};

export type ParsedAtaLot = {
  numero_lote?: number | string | null;
  status?: string | null;
  titulo?: string | null;
  itens?: ParsedAtaLotItem[];
};

export type ProcessEstimateRow = {
  itemId: number;
  numeroItem: number;
  descricao: string;
  quantidade: string;
  unidade: string;
  valorUnitarioEstimadoBase: string | null;
  valorTotalEstimadoBase: string | null;
  loteNumero: number | null;
  resultadoLoteNumero: string | null;
  loteValorEstimado: string | null;
  valorEstimadoUnitario: string | null;
  valorEstimadoTotal: string | null;
};

type EstimatedValueReconciliation = NonNullable<
  AtaSessaoProcessResult["estimatedValueReconciliation"]
>;

type InternalEstimatedValueEnrichment = {
  processo: ProcessChoice | null;
  warnings: string[];
  lotes: Array<NonNullable<ReturnType<typeof buildEstimateEntry>>>;
};

type ProcessChoice = {
  id: number;
  numeroSirel: string;
  numeroEdital: string | null;
  numeroAdministrativo: string | null;
  objeto: string;
  score: number;
  selectionMode: "EXPLICITO" | "DOCUMENTO" | "SUGERIDO" | "NAO_ENCONTRADO";
};

function ensureDirectory(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function slugifyAtaSessaoFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function resolveDocumentoPath(arquivoChave: string) {
  const normalizedKey = arquivoChave.replace(/\\/g, "/").replace(/^\/+/, "");
  const candidates = [join(uploadsRoot, normalizedKey), normalizedKey];
  return (
    candidates.find((candidate) => existsSync(candidate)) ??
    join(uploadsRoot, normalizedKey)
  );
}

async function resolveSourceInfo(
  input: AtaSessaoProcessInput,
): Promise<AtaSessaoSourceInfo> {
  if (input.sourcePath) {
    return {
      sourceFile: resolve(repoRoot, input.sourcePath),
      processoId: input.processoId ?? null,
    };
  }
  const db = requireDb();
  const [documento] = await db
    .select({
      arquivoChave: documentos.arquivoChave,
      processoId: documentos.processoId,
    })
    .from(documentos)
    .where(eq(documentos.id, Number(input.documentoId)))
    .limit(1);
  if (!documento?.arquivoChave) {
    throw new Error("Documento informado não possui arquivo vinculado.");
  }
  return {
    sourceFile: resolveDocumentoPath(documento.arquivoChave),
    processoId: input.processoId ?? documento.processoId ?? null,
  };
}

function resolvePythonCommand() {
  if (process.platform === "win32") {
    return { command: "py", args: ["-3.12"] };
  }
  return { command: process.env.PYTHON_BIN || "python3", args: [] };
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAtaIdentifier(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .trim();
}

function normalizeAtaText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLotKey(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/\D+/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : null;
}

function tokenSimilarity(left: unknown, right: unknown) {
  const leftTokens = new Set(normalizeAtaText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(
    normalizeAtaText(right).split(" ").filter(Boolean),
  );
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  );
  return intersection.length / Math.max(leftTokens.size, rightTokens.size);
}

function normalizeUnit(value: unknown) {
  const normalized = normalizeAtaIdentifier(value);
  const aliases: Record<string, string> = {
    UN: "UN",
    UND: "UN",
    UNID: "UN",
    UNIDADE: "UN",
    UNIDADES: "UN",
    PC: "PC",
    PCA: "PC",
    PECA: "PC",
    PECAS: "PC",
  };
  return aliases[normalized] ?? normalized;
}

function quantitiesMatch(left: unknown, right: unknown) {
  const leftNumber = toNumberOrNull(left);
  const rightNumber = toNumberOrNull(right);
  if (leftNumber === null || rightNumber === null) return false;
  const scale = Math.max(Math.abs(leftNumber), Math.abs(rightNumber), 1);
  return Math.abs(leftNumber - rightNumber) / scale <= 0.001;
}

function processRowLotKey(row: ProcessEstimateRow) {
  return normalizeLotKey(row.loteNumero ?? row.resultadoLoteNumero);
}

function isMalsucedidoStatus(status: unknown) {
  const normalized = normalizeAtaIdentifier(status);
  return ["FRACASSADO", "DESERTO", "CANCELADO"].includes(normalized);
}

function processChoiceWarning(choice: ProcessChoice | null) {
  if (!choice) {
    return "Enriquecimento de valores estimados não aplicado: nenhum processo interno compatível foi identificado.";
  }
  if (choice.selectionMode === "SUGERIDO") {
    return `Enriquecimento de valores estimados aplicado com processo sugerido: ${choice.numeroSirel}.`;
  }
  return null;
}

async function loadProcessChoice(
  db: ReturnType<typeof requireDb>,
  payload: AtaSessaoParsedPayload,
  explicitProcessId: number | null,
  selectionMode: "EXPLICITO" | "DOCUMENTO",
): Promise<ProcessChoice | null> {
  if (explicitProcessId) {
    const [row] = await db
      .select({
        id: processos.id,
        numeroSirel: processos.numeroSirel,
        numeroEdital: processos.numeroEdital,
        numeroAdministrativo: processos.numeroAdministrativo,
        objeto: processos.objeto,
      })
      .from(processos)
      .where(eq(processos.id, explicitProcessId))
      .limit(1);

    return row ? { ...row, score: 100, selectionMode } : null;
  }

  const edital = normalizeAtaIdentifier(payload.edital);
  const administrativo = normalizeAtaIdentifier(
    payload.processo_administrativo,
  );
  if (!edital && !administrativo) {
    return null;
  }

  const candidates = await db
    .select({
      id: processos.id,
      numeroSirel: processos.numeroSirel,
      numeroEdital: processos.numeroEdital,
      numeroAdministrativo: processos.numeroAdministrativo,
      objeto: processos.objeto,
      atualizadoEm: processos.atualizadoEm,
    })
    .from(processos)
    .where(eq(processos.ativo, true))
    .orderBy(desc(processos.atualizadoEm), desc(processos.id))
    .limit(500);

  const scored = candidates
    .map((candidate) => {
      const candidateEdital = normalizeAtaIdentifier(candidate.numeroEdital);
      const candidateAdministrativo = normalizeAtaIdentifier(
        candidate.numeroAdministrativo,
      );
      let score = 0;
      if (edital && candidateEdital && edital === candidateEdital) score += 70;
      if (
        administrativo &&
        candidateAdministrativo &&
        administrativo === candidateAdministrativo
      ) {
        score += 68;
      }
      return { candidate, score };
    })
    .filter((row) => row.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.candidate.atualizadoEm?.getTime() ?? 0) -
          (left.candidate.atualizadoEm?.getTime() ?? 0),
    );

  const best = scored[0];
  if (!best) return null;
  return {
    id: best.candidate.id,
    numeroSirel: best.candidate.numeroSirel,
    numeroEdital: best.candidate.numeroEdital,
    numeroAdministrativo: best.candidate.numeroAdministrativo,
    objeto: best.candidate.objeto,
    score: best.score,
    selectionMode: "SUGERIDO",
  };
}

async function loadProcessEstimateRows(
  db: ReturnType<typeof requireDb>,
  processoId: number,
): Promise<ProcessEstimateRow[]> {
  return db
    .select({
      itemId: itensProcesso.id,
      numeroItem: itensProcesso.numeroItem,
      descricao: itensProcesso.descricao,
      quantidade: itensProcesso.quantidade,
      unidade: itensProcesso.unidade,
      valorUnitarioEstimadoBase: itensProcesso.valorUnitarioEstimado,
      valorTotalEstimadoBase: itensProcesso.valorTotalEstimado,
      loteNumero: lotes.numeroLote,
      resultadoLoteNumero: itensProcessoValores.numeroLote,
      loteValorEstimado: lotes.valorEstimado,
      valorEstimadoUnitario: itensProcessoValores.valorEstimadoUnitario,
      valorEstimadoTotal: itensProcessoValores.valorEstimadoTotal,
    })
    .from(itensProcesso)
    .leftJoin(lotes, eq(lotes.id, itensProcesso.loteId))
    .leftJoin(
      itensProcessoValores,
      eq(itensProcessoValores.itemProcessoId, itensProcesso.id),
    )
    .where(eq(itensProcesso.processoId, processoId));
}

export function matchEstimateRowForLot(
  lot: ParsedAtaLot,
  rows: ProcessEstimateRow[],
): { row: ProcessEstimateRow; score: number; reason: string } | null {
  if (!rows.length) return null;
  const parsedItem = Array.isArray(lot.itens) ? (lot.itens[0] ?? null) : null;
  const lotKey = normalizeLotKey(lot.numero_lote);
  const parsedItemNumber = normalizeLotKey(parsedItem?.item_numero);
  const referenceText = parsedItem?.descricao || lot.titulo || "";
  const directLotRows = lotKey
    ? rows.filter((row) => processRowLotKey(row) === lotKey)
    : [];

  if (directLotRows.length === 1) {
    return { row: directLotRows[0], score: 0.98, reason: "lote" };
  }

  const exactItems = parsedItemNumber
    ? rows.filter((row) => normalizeLotKey(row.numeroItem) === parsedItemNumber)
    : [];
  if (exactItems.length === 1) {
    const exactItem = exactItems[0];
    const itemLotMatches = Boolean(
      lotKey && processRowLotKey(exactItem) === lotKey,
    );
    const descriptionScore = tokenSimilarity(
      referenceText,
      exactItem.descricao,
    );
    const quantityMatches = quantitiesMatch(
      parsedItem?.quantidade,
      exactItem.quantidade,
    );
    const unitMatches =
      Boolean(parsedItem?.unidade) &&
      normalizeUnit(parsedItem?.unidade) === normalizeUnit(exactItem.unidade);

    if (itemLotMatches) {
      return { row: exactItem, score: 0.96, reason: "item_numero_lote" };
    }

    // A BLL reinicia a numeração local como Item 1 em muitos lotes. Sem
    // vínculo de lote, o número do item só é aceito com confirmação
    // semântica forte; isso impede repetir o item global 1 em vários lotes.
    if (
      descriptionScore >= 0.85 &&
      (quantityMatches || unitMatches || descriptionScore >= 0.95)
    ) {
      return {
        row: exactItem,
        score: Math.min(0.94, descriptionScore),
        reason: "item_numero_confirmado",
      };
    }
  }

  const scoredRows = (directLotRows.length ? directLotRows : rows)
    .map((row) => {
      const descriptionScore = tokenSimilarity(referenceText, row.descricao);
      const quantityMatches = quantitiesMatch(
        parsedItem?.quantidade,
        row.quantidade,
      );
      const unitMatches =
        Boolean(parsedItem?.unidade) &&
        normalizeUnit(parsedItem?.unidade) === normalizeUnit(row.unidade);
      return {
        row,
        descriptionScore,
        confirmed: quantityMatches || unitMatches,
        score: Math.min(
          1,
          descriptionScore +
            (quantityMatches ? 0.05 : 0) +
            (unitMatches ? 0.03 : 0),
        ),
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = scoredRows[0];
  if (!best) return null;
  const runnerUp = scoredRows[1];
  if (best.descriptionScore < 0.85 || !best.confirmed) return null;
  if (runnerUp && best.score - runnerUp.score < 0.15) return null;
  return { row: best.row, score: best.score, reason: "melhor_candidato" };
}

function buildEstimateEntry(
  lot: ParsedAtaLot,
  match: { row: ProcessEstimateRow; score: number; reason: string },
) {
  const quantity =
    toNumberOrNull(match.row.quantidade) ??
    toNumberOrNull(Array.isArray(lot.itens) ? lot.itens[0]?.quantidade : null);
  let unit = toNumberOrNull(match.row.valorEstimadoUnitario);
  let total = toNumberOrNull(match.row.valorEstimadoTotal);
  let source = "itens_processo_valores";
  let sourceLabel = "Dossiê - valores do item";

  if (unit === null && total === null) {
    unit = toNumberOrNull(match.row.valorUnitarioEstimadoBase);
    total = toNumberOrNull(match.row.valorTotalEstimadoBase);
    source = "itens_processo";
    sourceLabel = "Dossiê - item do processo";
  }

  if (unit === null && total === null) {
    total = toNumberOrNull(match.row.loteValorEstimado);
    source = "lotes";
    sourceLabel = "Dossiê - lote do processo";
  }

  if (unit === null && total !== null && quantity && quantity > 0) {
    unit = total / quantity;
  }
  if (total === null && unit !== null && quantity && quantity > 0) {
    total = unit * quantity;
  }
  if (unit === null && total === null) return null;

  const confidence =
    match.score >= 0.9 ? "ALTA" : match.score >= 0.65 ? "MEDIA" : "BAIXA";
  return {
    numero_lote: Number(lot.numero_lote),
    item_id: match.row.itemId,
    item_numero: String(match.row.numeroItem),
    descricao_item: match.row.descricao,
    valor_unitario_estimado: unit,
    valor_total_estimado: total,
    fonte: source,
    fonte_label: sourceLabel,
    confianca: confidence,
    score: Number(match.score.toFixed(4)),
    match_reason: match.reason,
  };
}

async function buildEstimatedValueEnrichment(params: {
  input: AtaSessaoProcessInput;
  payload: AtaSessaoParsedPayload;
  sourceInfo: AtaSessaoSourceInfo;
}): Promise<InternalEstimatedValueEnrichment> {
  const warnings: string[] = [];
  try {
    const db = requireDb();
    const explicitProcessId =
      params.input.processoId ?? params.sourceInfo.processoId ?? null;
    const selectionMode = params.input.processoId ? "EXPLICITO" : "DOCUMENTO";
    const processChoice = await loadProcessChoice(
      db,
      params.payload,
      explicitProcessId,
      selectionMode,
    );
    const processWarning = processChoiceWarning(processChoice);
    if (processWarning) warnings.push(processWarning);

    if (!processChoice) {
      return {
        processo: null,
        warnings,
        lotes: [],
      };
    }

    const estimateRows = await loadProcessEstimateRows(db, processChoice.id);
    const lots = (
      Array.isArray(params.payload.lotes)
        ? (params.payload.lotes as ParsedAtaLot[])
        : []
    ).filter((lot) => isMalsucedidoStatus(lot.status));

    const enrichedLots: InternalEstimatedValueEnrichment["lotes"] = [];
    const usedItemIds = new Set<number>();
    for (const lot of lots) {
      const availableRows = estimateRows.filter(
        (row) => !usedItemIds.has(row.itemId),
      );
      const match = matchEstimateRowForLot(lot, availableRows);
      if (!match) {
        warnings.push(
          `Lote ${lot.numero_lote}: nenhum item interno compatível foi encontrado para preencher valor estimado.`,
        );
        continue;
      }
      const entry = buildEstimateEntry(lot, match);
      if (!entry) {
        warnings.push(
          `Lote ${lot.numero_lote}: item interno encontrado, mas sem valor estimado disponível no dossiê.`,
        );
        continue;
      }
      usedItemIds.add(match.row.itemId);
      enrichedLots.push(entry);
    }

    return {
      processo: processChoice,
      warnings,
      lotes: enrichedLots,
    };
  } catch (error) {
    return {
      processo: null,
      warnings: [
        `Enriquecimento de valores estimados não aplicado: ${
          error instanceof Error
            ? error.message
            : "falha ao consultar dados internos"
        }.`,
      ],
      lotes: [],
    };
  }
}

function positiveIntegerArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
}

function mapEstimatedValueReconciliation(
  payload: AtaSessaoParsedPayload,
): EstimatedValueReconciliation | null {
  const reconciliation = payload.estimated_value_reconciliation;
  if (!reconciliation) return null;

  return {
    source: "SD",
    sdNumber: reconciliation.sd_number?.trim() || null,
    totalFailedLots: Number(reconciliation.total_failed_lots ?? 0),
    fullyMatchedLots: Number(reconciliation.fully_matched_lots ?? 0),
    partiallyMatchedLots: Number(reconciliation.partially_matched_lots ?? 0),
    unmatchedLots: positiveIntegerArray(reconciliation.unmatched_lots),
    ambiguousLots: positiveIntegerArray(reconciliation.ambiguous_lots),
    totalFailedItems: Number(reconciliation.total_failed_items ?? 0),
    matchedItems: Number(reconciliation.matched_items ?? 0),
    ambiguousItems: Number(reconciliation.ambiguous_items ?? 0),
    unmatchedItems: Number(reconciliation.unmatched_items ?? 0),
    warnings: Array.isArray(reconciliation.warnings)
      ? reconciliation.warnings.map(String).filter(Boolean)
      : [],
  };
}

async function resolveBrandingData() {
  try {
    const db = requireDb();
    const nome = String(
      (await getSystemParamValue(db, "INSTITUCIONAL.NOME_ORGAO")) ??
        "PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS",
    ).trim();
    const cnpj = String(
      (await getSystemParamValue(db, "INSTITUCIONAL.CNPJ_ORGAO")) ??
        "13.650.403/0001-28",
    ).trim();
    const enderecoValue =
      ((await getSystemParamValue(db, "INSTITUCIONAL.ENDERECO")) as
        | Record<string, unknown>
        | undefined) ?? {};
    const endereco = [
      String(enderecoValue.logradouro ?? "").trim(),
      String(enderecoValue.numero ?? "").trim(),
      String(enderecoValue.bairro ?? "").trim(),
      String(enderecoValue.cep ?? "").trim(),
      String(enderecoValue.municipio ?? "").trim(),
      String(enderecoValue.uf ?? "").trim(),
    ]
      .filter(Boolean)
      .join(", ");

    return {
      lines: [
        "MUNICÍPIO DE TEIXEIRA DE FREITAS",
        nome,
        `CNPJ: ${cnpj}`,
        endereco ||
          "AV MARECHAL CASTELO BRANCO, 145, CENTRO, TEIXEIRA DE FREITAS-BA",
      ],
      footer: String(
        (await getSystemParamValue(db, "SISTEMA.RODAPE")) ??
          "SIREL - Sistema Integrado de Relatórios e Licitações",
      ).trim(),
      logo_path: existsSync(defaultLogoPath) ? defaultLogoPath : null,
    };
  } catch {
    return {
      lines: [
        "MUNICÍPIO DE TEIXEIRA DE FREITAS",
        "PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS",
        "CNPJ: 13.650.403/0001-28",
        "AV MARECHAL CASTELO BRANCO, 145, CENTRO, TEIXEIRA DE FREITAS-BA",
      ],
      footer: "SIREL - Sistema Integrado de Relatórios e Licitações",
      logo_path: existsSync(defaultLogoPath) ? defaultLogoPath : null,
    };
  }
}

async function runPythonPipeline(
  input: AtaSessaoProcessInput,
  sourceFile: string,
  outputDir: string,
  enrichmentJsonPath?: string | null,
  sdSourceFile?: string | null,
) {
  ensureDirectory(outputDir);
  const jsonOutput = join(outputDir, "ata-sessao-relatorio.json");
  const brandingJsonPath = join(outputDir, "ata-sessao-branding.json");
  writeFileSync(
    brandingJsonPath,
    JSON.stringify(await resolveBrandingData(), null, 2),
    "utf-8",
  );

  const python = resolvePythonCommand();
  const args = [
    ...python.args,
    pythonScriptPath,
    "--input",
    sourceFile,
    "--output-dir",
    outputDir,
    "--json-out",
    jsonOutput,
    "--branding-json",
    brandingJsonPath,
  ];
  if (input.generatedByName?.trim()) {
    args.push("--generated-by", input.generatedByName.trim());
  }
  if (input.edital?.trim()) {
    args.push("--edital", input.edital.trim());
  }
  if (input.processoAdministrativo?.trim()) {
    args.push("--processo-administrativo", input.processoAdministrativo.trim());
  }
  if (input.arquivoOrigem?.trim()) {
    args.push("--arquivo-origem", input.arquivoOrigem.trim());
  }
  if (input.dataGeracao?.trim()) {
    args.push("--data-geracao", input.dataGeracao.trim());
  }
  if (enrichmentJsonPath) {
    args.push("--enrichment-json", enrichmentJsonPath);
  }
  if (sdSourceFile) {
    args.push("--sd-input", sdSourceFile);
  }

  try {
    await execFileAsync(python.command, args, {
      cwd: repoRoot,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10,
    });
  } catch (error) {
    const processError = error as {
      message?: string;
      stderr?: string | Buffer;
      stdout?: string | Buffer;
    };
    const details = String(
      processError.stderr || processError.stdout || processError.message || "",
    ).trim();
    const message =
      details || "Falha desconhecida no processamento dos relatórios.";
    if (isAtaSessaoReportInputError(message)) {
      throw new AtaSessaoReportInputError(message);
    }
    throw new Error(`Falha ao gerar os relatórios da ata: ${message}`);
  }
  return jsonOutput;
}

export async function runAtaSessaoPipeline(
  input: AtaSessaoProcessInput,
  options: AtaSessaoPipelineOptions = {},
): Promise<{
  sourceFile: string;
  outputDir: string;
  jsonPath: string;
  payload: AtaSessaoParsedPayload;
}> {
  ensureDirectory(reportsRoot);
  const sourceInfo = await resolveSourceInfo(input);
  const sourceFile = sourceInfo.sourceFile;
  if (!existsSync(sourceFile)) {
    throw new Error(`Arquivo PDF não encontrado: ${sourceFile}`);
  }
  const sdSourceFile = input.sdSourcePath
    ? resolve(repoRoot, input.sdSourcePath)
    : null;
  if (sdSourceFile && !existsSync(sdSourceFile)) {
    throw new Error(`Arquivo PDF da SD não encontrado: ${sdSourceFile}`);
  }

  const outputDir = input.outputDir
    ? resolve(repoRoot, input.outputDir)
    : join(
        reportsRoot,
        `${Date.now()}-${slugifyAtaSessaoFileName(basename(sourceFile, ".pdf"))}`,
      );
  ensureDirectory(outputDir);
  const shouldRemoveOutputOnFailure = Boolean(
    options.removeAutomaticOutputOnFailure && !input.outputDir,
  );

  try {
    let jsonPath: string;
    let payload: AtaSessaoParsedPayload;
    const enrichmentJsonPath = join(outputDir, "ata-sessao-enrichment.json");

    if (sdSourceFile) {
      // A primeira leitura permite localizar um processo compatível e carregar
      // valores internos apenas para comparação. Na execução final, o Python
      // aplica esses valores antes da SD; o conciliador registra divergências,
      // limpa os valores internos e mantém somente os valores seguros da SD.
      jsonPath = await runPythonPipeline(input, sourceFile, outputDir);
      payload = JSON.parse(
        readFileSync(jsonPath, "utf-8"),
      ) as AtaSessaoParsedPayload;
      const internalComparison = await buildEstimatedValueEnrichment({
        input,
        payload,
        sourceInfo,
      });
      writeFileSync(
        enrichmentJsonPath,
        JSON.stringify(internalComparison, null, 2),
        "utf-8",
      );

      const comparisonJsonPath = join(outputDir, "ata-sessao-comparison.json");
      const hasInternalComparison = Boolean(
        internalComparison.processo && internalComparison.lotes.length,
      );
      if (hasInternalComparison) {
        writeFileSync(
          comparisonJsonPath,
          JSON.stringify(
            {
              processo: internalComparison.processo,
              // Avisos da consulta interna ficam no arquivo de auditoria. Nos
              // relatórios entram somente divergências encontradas pelo
              // conciliador, para não transformar ausência de cadastro em erro.
              warnings: [],
              lotes: internalComparison.lotes,
            },
            null,
            2,
          ),
          "utf-8",
        );
      }

      await runPythonPipeline(
        input,
        sourceFile,
        outputDir,
        hasInternalComparison ? comparisonJsonPath : null,
        sdSourceFile,
      );
      payload = JSON.parse(
        readFileSync(jsonPath, "utf-8"),
      ) as AtaSessaoParsedPayload;
    } else {
      jsonPath = await runPythonPipeline(input, sourceFile, outputDir);
      payload = JSON.parse(
        readFileSync(jsonPath, "utf-8"),
      ) as AtaSessaoParsedPayload;
      const enrichment = await buildEstimatedValueEnrichment({
        input,
        payload,
        sourceInfo,
      });
      writeFileSync(
        enrichmentJsonPath,
        JSON.stringify(enrichment, null, 2),
        "utf-8",
      );
      await runPythonPipeline(input, sourceFile, outputDir, enrichmentJsonPath);
      payload = JSON.parse(
        readFileSync(jsonPath, "utf-8"),
      ) as AtaSessaoParsedPayload;
    }

    return {
      sourceFile,
      outputDir,
      jsonPath,
      payload,
    };
  } catch (error) {
    if (shouldRemoveOutputOnFailure) {
      removeAutomaticReportDirectory(outputDir, reportsRoot);
    }
    throw error;
  }
}

export function buildAtaSessaoArtifacts(
  outputDir: string,
  jsonPath: string,
  parsed: AtaSessaoParsedPayload,
): AtaSessaoReportArtifact[] {
  const sdParsedPath = String(
    parsed.artifacts?.sd_parsed_json ?? join(outputDir, "sd-parsed.json"),
  );
  const rawArtifacts = [
    {
      label: "Ata institucional completa (PDF)",
      path: String(
        parsed.artifacts?.ata_institucional_pdf ??
          join(outputDir, "Ata_Institucional_Completa.pdf"),
      ),
      type: "pdf" as const,
    },
    { label: "JSON consolidado", path: jsonPath, type: "json" as const },
    ...(existsSync(sdParsedPath)
      ? [
          {
            label: "JSON da SD processada",
            path: sdParsedPath,
            type: "json" as const,
          },
        ]
      : []),
    {
      label: "Relatório Em Andamento (PDF)",
      path: String(
        parsed.artifacts?.em_andamento_pdf ??
          join(outputDir, "Relatorio_EmAndamento.pdf"),
      ),
      type: "pdf" as const,
    },
    {
      label: "Relatório Em Andamento (XLSX)",
      path: String(
        parsed.artifacts?.em_andamento_xlsx ??
          join(outputDir, "Relatorio_EmAndamento.xlsx"),
      ),
      type: "xlsx" as const,
    },
    {
      label: "Relatório Adjudicados (PDF)",
      path: String(
        parsed.artifacts?.adjudicados_pdf ??
          join(outputDir, "Relatorio_Adjudicados.pdf"),
      ),
      type: "pdf" as const,
    },
    {
      label: "Relatório Adjudicados (XLSX)",
      path: String(
        parsed.artifacts?.adjudicados_xlsx ??
          join(outputDir, "Relatorio_Adjudicados.xlsx"),
      ),
      type: "xlsx" as const,
    },
    {
      label: "Relatório Fase Recursal (PDF)",
      path: String(
        parsed.artifacts?.fase_recursal_pdf ??
          join(outputDir, "Relatorio_FaseRecursal.pdf"),
      ),
      type: "pdf" as const,
    },
    {
      label: "Relatório Fase Recursal (XLSX)",
      path: String(
        parsed.artifacts?.fase_recursal_xlsx ??
          join(outputDir, "Relatorio_FaseRecursal.xlsx"),
      ),
      type: "xlsx" as const,
    },
    {
      label: "Relatório Malsucedidos (PDF)",
      path: String(
        parsed.artifacts?.malsucedidos_pdf ??
          join(outputDir, "Relatorio_MalSucedidos.pdf"),
      ),
      type: "pdf" as const,
    },
    {
      label: "Relatório Malsucedidos (XLSX)",
      path: String(
        parsed.artifacts?.malsucedidos_xlsx ??
          join(outputDir, "Relatorio_MalSucedidos.xlsx"),
      ),
      type: "xlsx" as const,
    },
    {
      label: "Warnings",
      path: join(outputDir, "warnings.log"),
      type: "log" as const,
    },
    {
      label: "Erros de parsing",
      path: join(outputDir, "erros_parsing.log"),
      type: "log" as const,
    },
    {
      label: "Erros de renderização",
      path: join(outputDir, "erros_renderizacao.log"),
      type: "log" as const,
    },
  ];

  return rawArtifacts.map((artifact) => {
    const relativePath = relative(reportsRoot, resolve(artifact.path))
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");

    return {
      ...artifact,
      relativePath,
      downloadUrl: `/api/relatorios/ata-sessao/download?file=${encodeURIComponent(relativePath)}`,
    };
  });
}

export async function generateAtaSessaoReports(
  input: AtaSessaoProcessInput,
  options: AtaSessaoPipelineOptions = {},
): Promise<AtaSessaoProcessResult> {
  const {
    sourceFile,
    outputDir,
    jsonPath,
    payload: parsed,
  } = await runAtaSessaoPipeline(input, options);
  const artifacts = buildAtaSessaoArtifacts(outputDir, jsonPath, parsed);

  return ataSessaoProcessResultSchema.parse({
    sourceFile,
    outputDir,
    generatedAt: parsed.generated_at,
    summary: {
      totalLotes: parsed.summary.total_lotes,
      emAndamento: parsed.summary.em_andamento,
      adjudicados: parsed.summary.adjudicados,
      faseRecursal: parsed.summary.fase_recursal,
      malsucedidos: parsed.summary.malsucedidos,
      warnings: parsed.summary.warnings,
      parsingErrors: parsed.summary.parsing_errors,
    },
    estimatedValueReconciliation: mapEstimatedValueReconciliation(parsed),
    artifacts,
  });
}
