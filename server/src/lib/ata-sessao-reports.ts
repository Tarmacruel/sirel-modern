import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

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
import { getSystemParamValue } from "./system-params.js";

const execFileAsync = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const reportsRoot = resolve(repoRoot, "storage/reports/atas-sessao");
const uploadsRoot = resolve(repoRoot, "storage/uploads");
const pythonScriptPath = resolve(
  repoRoot,
  "scripts/process_ata_sessao_reports.py",
);
const defaultLogoPath = resolve(repoRoot, "client/public/logo-prefeitura.png");

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
  artifacts?: Record<string, string>;
};

type AtaSessaoReportArtifact = AtaSessaoProcessResult["artifacts"][number];

type AtaSessaoSourceInfo = {
  sourceFile: string;
  processoId: number | null;
};

type ParsedAtaLotItem = {
  item_numero?: string | null;
  descricao?: string | null;
  quantidade?: number | null;
};

type ParsedAtaLot = {
  numero_lote?: number | string | null;
  status?: string | null;
  titulo?: string | null;
  itens?: ParsedAtaLotItem[];
};

type ProcessEstimateRow = {
  itemId: number;
  numeroItem: number;
  descricao: string;
  quantidade: string;
  valorUnitarioEstimadoBase: string | null;
  valorTotalEstimadoBase: string | null;
  loteNumero: number | null;
  loteValorEstimado: string | null;
  valorEstimadoUnitario: string | null;
  valorEstimadoTotal: string | null;
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

async function resolveSourceInfo(input: AtaSessaoProcessInput): Promise<AtaSessaoSourceInfo> {
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
  const rightTokens = new Set(normalizeAtaText(right).split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  return intersection.length / Math.max(leftTokens.size, rightTokens.size);
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
  const administrativo = normalizeAtaIdentifier(payload.processo_administrativo);
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
      valorUnitarioEstimadoBase: itensProcesso.valorUnitarioEstimado,
      valorTotalEstimadoBase: itensProcesso.valorTotalEstimado,
      loteNumero: lotes.numeroLote,
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

function matchEstimateRowForLot(
  lot: ParsedAtaLot,
  rows: ProcessEstimateRow[],
): { row: ProcessEstimateRow; score: number; reason: string } | null {
  if (!rows.length) return null;
  const parsedItem = Array.isArray(lot.itens) ? (lot.itens[0] ?? null) : null;
  const lotKey = normalizeLotKey(lot.numero_lote);
  const parsedItemNumber = normalizeLotKey(parsedItem?.item_numero);
  const referenceText = parsedItem?.descricao || lot.titulo || "";
  const directLotRows = lotKey
    ? rows.filter((row) => normalizeLotKey(row.loteNumero) === lotKey)
    : [];

  if (directLotRows.length === 1) {
    return { row: directLotRows[0], score: 0.98, reason: "lote" };
  }

  const exactItem = parsedItemNumber
    ? rows.find((row) => normalizeLotKey(row.numeroItem) === parsedItemNumber)
    : null;
  if (exactItem) {
    const itemLotMatches =
      !lotKey || normalizeLotKey(exactItem.loteNumero) === lotKey;
    const score = itemLotMatches
      ? 0.96
      : Math.max(0.72, tokenSimilarity(referenceText, exactItem.descricao));
    return { row: exactItem, score, reason: "item_numero" };
  }

  const scoredRows = (directLotRows.length ? directLotRows : rows)
    .map((row) => {
      const lotBonus =
        lotKey && normalizeLotKey(row.loteNumero) === lotKey ? 0.18 : 0;
      return {
        row,
        score: Math.min(1, tokenSimilarity(referenceText, row.descricao) + lotBonus),
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = scoredRows[0];
  if (!best) return null;
  if (best.score <= 0 && rows.length > 1) return null;
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
}) {
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
    const lots = (Array.isArray(params.payload.lotes)
      ? (params.payload.lotes as ParsedAtaLot[])
      : []
    ).filter((lot) => isMalsucedidoStatus(lot.status));

    const enrichedLots = lots
      .map((lot) => {
        const match = matchEstimateRowForLot(lot, estimateRows);
        if (!match) {
          warnings.push(
            `Lote ${lot.numero_lote}: nenhum item interno compatível foi encontrado para preencher valor estimado.`,
          );
          return null;
        }
        const entry = buildEstimateEntry(lot, match);
        if (!entry) {
          warnings.push(
            `Lote ${lot.numero_lote}: item interno encontrado, mas sem valor estimado disponível no dossiê.`,
          );
        }
        return entry;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

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
          error instanceof Error ? error.message : "falha ao consultar dados internos"
        }.`,
      ],
      lotes: [],
    };
  }
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

  await execFileAsync(python.command, args, {
    cwd: repoRoot,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10,
  });
  return jsonOutput;
}

export async function runAtaSessaoPipeline(
  input: AtaSessaoProcessInput,
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

  const outputDir = input.outputDir
    ? resolve(repoRoot, input.outputDir)
    : join(
        reportsRoot,
        `${Date.now()}-${slugifyAtaSessaoFileName(basename(sourceFile, ".pdf"))}`,
      );
  ensureDirectory(outputDir);

  const jsonPath = await runPythonPipeline(input, sourceFile, outputDir);
  let payload = JSON.parse(
    readFileSync(jsonPath, "utf-8"),
  ) as AtaSessaoParsedPayload;
  const enrichment = await buildEstimatedValueEnrichment({
    input,
    payload,
    sourceInfo,
  });
  const enrichmentJsonPath = join(outputDir, "ata-sessao-enrichment.json");
  writeFileSync(enrichmentJsonPath, JSON.stringify(enrichment, null, 2), "utf-8");
  await runPythonPipeline(input, sourceFile, outputDir, enrichmentJsonPath);
  payload = JSON.parse(readFileSync(jsonPath, "utf-8")) as AtaSessaoParsedPayload;

  return {
    sourceFile,
    outputDir,
    jsonPath,
    payload,
  };
}

export function buildAtaSessaoArtifacts(
  outputDir: string,
  jsonPath: string,
  parsed: AtaSessaoParsedPayload,
): AtaSessaoReportArtifact[] {
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
): Promise<AtaSessaoProcessResult> {
  const {
    sourceFile,
    outputDir,
    jsonPath,
    payload: parsed,
  } = await runAtaSessaoPipeline(input);
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
    artifacts,
  });
}
