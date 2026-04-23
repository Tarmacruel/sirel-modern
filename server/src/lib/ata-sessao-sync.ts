import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { and, asc, desc, eq, ilike, inArray, like, or } from "drizzle-orm";

import {
  ataSessaoApplyResultSchema,
  ataSessaoDiscoveryResultSchema,
  ataSessaoPreviewSchema,
  type AtaSessaoApplyResult,
  type AtaSessaoCreatePreviewFromDiscoveryInput,
  type AtaSessaoDiscoveryResult,
  type AtaSessaoPreview,
  type AtaSessaoPreviewDocumentDraft,
  type AtaSessaoPreviewProcessInput,
  type AtaSessaoSuggestedProcess,
} from "@sirel/shared/schemas/ata-sessao";

import { requireDb } from "../db/client.js";
import {
  documentos,
  fornecedores,
  itensProcesso,
  itensProcessoValores,
  lancesLicitacao,
  licitacaoAtaSyncRuns,
  licitacoes,
  licitantes,
  lotes,
  movimentacoesWorkflow,
  processos,
  propostasLicitacao,
  recursosLicitacao,
  workflowProcesso,
} from "../db/schema.js";
import {
  buildAtaSessaoArtifacts,
  runAtaSessaoPipeline,
  slugifyAtaSessaoFileName,
  type AtaSessaoParsedPayload,
} from "./ata-sessao-reports.js";

type DbClient = ReturnType<typeof requireDb>;
type AtaDiscoveryMode =
  | "PROCESSO_EXPLICITO"
  | "SUGERIDO_POR_IDENTIFICADORES"
  | "ESCOLHIDO_MANUALMENTE_APOS_SUGESTAO";

type ProcessoSuggestionCandidate = {
  id: number;
  numeroSirel: string;
  numeroEdital: string | null;
  numeroAdministrativo: string | null;
  objeto: string;
  moduloAtual: string | null;
  anoReferencia: number | null;
  atualizadoEm: Date | null;
};

type ProcessoPreviewBase = {
  id: number;
  numeroSirel: string;
  numeroEdital: string | null;
  numeroAdministrativo: string | null;
  objeto: string;
  moduloAtual: string | null;
};

type ParsedLotItem = {
  item_numero?: string | null;
  unidade?: string | null;
  descricao?: string | null;
  quantidade?: number | null;
  valor_unitario?: number | null;
  valor_total?: number | null;
  valor_unitario_estimado?: number | null;
  marca?: string | null;
  modelo?: string | null;
};

type ParsedLotParticipant = {
  section?: string | null;
  ranking?: number | null;
  participante_numero?: string | null;
  razao_social?: string | null;
  documento?: string | null;
  oferta_inicial?: number | null;
  oferta_final?: number | null;
  diferenca_percentual?: number | null;
  me_epp?: boolean | null;
  raw_line?: string | null;
};

type ParsedLotMovement = {
  timestamp?: string | null;
  evento?: string | null;
  detalhe?: string | null;
  raw_text?: string | null;
};

type ParsedLot = {
  numero_lote: number;
  status: string;
  titulo: string;
  itens?: ParsedLotItem[];
  participantes?: ParsedLotParticipant[];
  movimentos?: ParsedLotMovement[];
  vencedor?: string | null;
  cnpj_vencedor?: string | null;
  melhor_lance?: number | null;
  motivo_falha?: string | null;
  warnings?: string[];
};

type ProcessItemRow = {
  id: number;
  numeroItem: number;
  descricao: string;
  quantidade: string;
  unidade: string;
  loteId: number | null;
  loteNumero: string | number | null;
};

type ProcessLotRow = {
  id: number;
  numeroLote: number;
  descricao: string;
  origemAtualizacao: string;
  origemReferencia: string | null;
};

type SupplierRow = {
  id: number;
  razaoSocial: string;
  cnpj: string;
  ativo: boolean;
};

type LicitanteRow = {
  id: number;
  fornecedorId: number;
  statusHabilitacao: string;
  ativo: boolean;
  origemAtualizacao: string;
  origemReferencia: string | null;
};

type PropostaRow = {
  id: number;
  licitanteId: number;
  itemId: number;
  valorUnitarioProposto: string;
  classificacao: number | null;
  situacao: string;
  origemAtualizacao: string;
  origemReferencia: string | null;
};

type ItemValorRow = {
  id: number;
  itemProcessoId: number;
  fornecedorVencedorId: number | null;
  fornecedorVencedorNome: string | null;
  fornecedorVencedorCnpj: string | null;
  valorLanceVencedorUnitario: string | null;
  valorLanceVencedorTotal: string | null;
  itemDeserto: boolean;
  itemFracassado: boolean;
  motivoFracasso: string | null;
  numeroLote: string | null;
  origemAlteracao: string | null;
};

type ResourceRow = {
  id: number;
  licitanteId: number;
  resultado: string;
  descricao: string;
  origemAtualizacao: string;
  origemReferencia: string | null;
};

type WorkflowRow = {
  id: number;
  moduloAtual: string;
  situacao: string;
  etapaAtual: string;
};

type ProcessState = {
  process: ProcessoPreviewBase;
  currentPhase: string;
  licitacaoId: number | null;
  items: ProcessItemRow[];
  lots: ProcessLotRow[];
  suppliers: SupplierRow[];
  licitantes: LicitanteRow[];
  proposals: PropostaRow[];
  itemValues: ItemValorRow[];
  resources: ResourceRow[];
  workflow: WorkflowRow | null;
};

type SupplierPlan = {
  key: string;
  name: string;
  document: string | null;
  existing: SupplierRow | null;
};

type LotItemMatch = {
  status: "MATCHED" | "AMBIGUOUS" | "MISSING";
  matchedItem: ProcessItemRow | null;
  score: number;
  reason: string;
  candidates: Array<{ item: ProcessItemRow; score: number; reason: string }>;
  supportsValueSync: boolean;
  multiItemWarning: string | null;
};

type ProposalPlan = {
  licitanteKey: string;
  itemId: number;
  valorUnitario: number;
  classificacao: number | null;
  situacao: "VALIDA" | "DESCLASSIFICADA" | "VENCEDORA";
  justificativa: string | null;
  existing: PropostaRow | null;
};

type LancePlan = {
  licitanteKey: string;
  itemId: number;
  valorLance: number;
  dataLance: Date;
  observacao: string | null;
};

type RecursoPlan = {
  licitanteKey: string;
  dataInterposicao: string;
  dataJulgamento: string | null;
  resultado: "PENDENTE" | "PROVIDO" | "IMPROVIDO" | "PARCIALMENTE_PROVIDO";
  descricao: string;
  decisao: string | null;
  existing: ResourceRow | null;
};

type ItemValuePlan = {
  itemId: number;
  fornecedorKey: string | null;
  fornecedorNome: string | null;
  fornecedorDocumento: string | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  itemDeserto: boolean;
  itemFracassado: boolean;
  motivoFracasso: string | null;
  existing: ItemValorRow | null;
};

type LotAnalysis = {
  lot: ParsedLot;
  match: LotItemMatch;
  issues: AtaSessaoPreview["blockingIssues"];
  actions: string[];
  supplierPlans: SupplierPlan[];
  proposalPlans: ProposalPlan[];
  lancePlans: LancePlan[];
  recursoPlans: RecursoPlan[];
  itemValuePlan: ItemValuePlan | null;
  lotNeedsCreate: boolean;
  winnerLicitanteKey: string | null;
  shouldSetWinnerHabilitado: boolean;
};

type AtaAnalysis = {
  preview: AtaSessaoPreview;
  lots: LotAnalysis[];
  suppliersToCreate: SupplierPlan[];
  licitantesToCreate: Array<{
    key: string;
    supplierKey: string;
  }>;
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const uploadsRoot = resolve(repoRoot, "storage/uploads");
const reportsRoot = resolve(repoRoot, "storage/reports/atas-sessao");

const phaseRank: Record<string, number> = {
  PREPARACAO: 0,
  PUBLICACAO: 1,
  RECEBIMENTO_PROPOSTAS: 2,
  ABERTURA_PROPOSTAS: 3,
  LANCES: 4,
  JULGAMENTO: 5,
  HABILITACAO: 6,
  RECURSOS: 7,
  HOMOLOGACAO: 8,
  CONTRATACAO: 9,
};

function ensureDirectory(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function buildAtaPreviewArtifacts(
  outputDir: string,
  jsonPath: string | null | undefined,
  payload: AtaSessaoParsedPayload,
): AtaSessaoPreview["artifacts"] {
  if (!jsonPath) {
    return [];
  }
  return buildAtaSessaoArtifacts(outputDir, jsonPath, payload);
}

export function normalizeAtaIdentifier(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .trim();
}

export function normalizeAtaText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLotKey(value: unknown) {
  const normalized = normalizeAtaText(value)
    .replace(/\blote\b/g, " ")
    .trim();
  if (!normalized) return null;

  const digits = digitsOnly(normalized);
  if (digits) {
    return String(Number(digits));
  }

  return normalized.replace(/\s+/g, " ");
}

function tokenizeText(value: unknown) {
  const stopwords = new Set([
    "a",
    "as",
    "ao",
    "aos",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "para",
    "por",
    "sem",
    "um",
    "uma",
  ]);

  return normalizeAtaText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

export function ataTokenSimilarity(left: unknown, right: unknown) {
  const leftTokens = new Set(tokenizeText(left));
  const rightTokens = new Set(tokenizeText(right));
  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function digitsOnly(value: unknown) {
  return String(value ?? "").replace(/\D+/g, "");
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAtaTimestamp(value: string | null | undefined) {
  const match = String(value ?? "").match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return null;
  const [, day, month, year, hour, minute, second] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0"),
    0,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inferYearFromIdentifiers(values: Array<string | null | undefined>) {
  for (const value of values) {
    const match = String(value ?? "").match(/20\d{2}/);
    if (match) {
      return Number(match[0]);
    }
  }
  return null;
}

function currentPhaseRank(value: string | null | undefined) {
  return (
    phaseRank[
      String(value ?? "PREPARACAO")
        .trim()
        .toUpperCase()
    ] ?? 0
  );
}

function isAtaOrigin(value: string | null | undefined) {
  return (
    String(value ?? "")
      .trim()
      .toUpperCase() === "ATA_SESSAO"
  );
}

function buildAtaOriginRef(runId: number) {
  return `ATA_SESSAO:${runId}`;
}

function isAtaOriginRef(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .startsWith("ATA_SESSAO:");
}

function normalizeDocumentDraft(
  draft: AtaSessaoPreviewDocumentDraft,
): AtaSessaoPreviewDocumentDraft {
  return {
    tipo: draft.tipo ?? "OUTRO",
    categoria: draft.categoria?.trim() || undefined,
    titulo: draft.titulo.trim(),
    descricao: draft.descricao?.trim() || undefined,
    dataReferencia: draft.dataReferencia?.trim() || undefined,
    publico: Boolean(draft.publico),
    palavrasChave: Array.from(
      new Set(
        (draft.palavrasChave ?? []).map((item) => item.trim()).filter(Boolean),
      ),
    ),
    restritoA: Array.from(new Set(draft.restritoA ?? [])),
  };
}

function inferSuggestedPhaseFromStatus(status: string | null | undefined) {
  const normalized = normalizeAtaText(status).toUpperCase();
  if (normalized.includes("ADJUDIC") || normalized.includes("EM ADJUDIC")) {
    return "HOMOLOGACAO";
  }
  if (normalized.includes("RECURSO") || normalized.includes("CONTRARRAZ")) {
    return "RECURSOS";
  }
  if (normalized.includes("HABILITA")) {
    return "HABILITACAO";
  }
  if (normalized.includes("JULG")) {
    return "JULGAMENTO";
  }
  return null;
}

function stageLabelForPhase(phase: string) {
  switch (phase) {
    case "JULGAMENTO":
      return "Licitação / julgamento";
    case "HABILITACAO":
      return "Licitação / habilitação";
    case "RECURSOS":
      return "Licitação / fase recursal";
    case "HOMOLOGACAO":
      return "Licitação / aguardando homologação";
    default:
      return "Licitação / preparação";
  }
}

async function appendAtaMovement(
  db: DbClient,
  processoId: number,
  usuarioId: number | null,
  descricao: string,
  observacao?: string | null,
) {
  await db.insert(movimentacoesWorkflow).values({
    processoId,
    moduloOrigem: "LICITACAO",
    moduloDestino: "LICITACAO",
    descricao,
    observacao: observacao ?? null,
    usuarioId,
    criadoEm: new Date(),
  });
}

async function syncWorkflowPhase(
  db: DbClient,
  processoId: number,
  phase: string | null,
) {
  if (!phase) return;

  const [workflow] = await db
    .select()
    .from(workflowProcesso)
    .where(eq(workflowProcesso.processoId, processoId))
    .limit(1);

  if (!workflow) {
    await db.insert(workflowProcesso).values({
      processoId,
      moduloAtual: "LICITACAO",
      situacao: "EM_ANDAMENTO",
      etapaAtual: stageLabelForPhase(phase),
      dataInicio: new Date().toISOString().slice(0, 10),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
    return;
  }

  if (workflow.moduloAtual !== "LICITACAO") {
    return;
  }

  await db
    .update(workflowProcesso)
    .set({
      situacao: "EM_ANDAMENTO",
      etapaAtual: stageLabelForPhase(phase),
      atualizadoEm: new Date(),
    })
    .where(eq(workflowProcesso.id, workflow.id));
}

async function loadProcessSuggestionCandidates(
  db: DbClient,
  search?: string,
): Promise<ProcessoSuggestionCandidate[]> {
  const normalizedSearch = search?.trim();
  const filters = [eq(processos.ativo, true)];

  if (normalizedSearch) {
    const pattern = `%${normalizedSearch}%`;
    filters.push(
      or(
        ilike(processos.numeroSirel, pattern),
        ilike(processos.numeroEdital, pattern),
        ilike(processos.numeroAdministrativo, pattern),
        ilike(processos.objeto, pattern),
      )!,
    );
  }

  return db
    .select({
      id: processos.id,
      numeroSirel: processos.numeroSirel,
      numeroEdital: processos.numeroEdital,
      numeroAdministrativo: processos.numeroAdministrativo,
      objeto: processos.objeto,
      moduloAtual: workflowProcesso.moduloAtual,
      anoReferencia: processos.anoReferencia,
      atualizadoEm: processos.atualizadoEm,
    })
    .from(processos)
    .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
    .where(and(...filters))
    .orderBy(desc(processos.atualizadoEm), desc(processos.id))
    .limit(normalizedSearch ? 80 : 300);
}

export async function searchAtaSessaoProcessOptions(input?: {
  search?: string;
}) {
  const db = requireDb();
  const rows = await loadProcessSuggestionCandidates(db, input?.search);
  return rows.map((row) => ({
    id: row.id,
    numeroSirel: row.numeroSirel,
    numeroEdital: row.numeroEdital,
    numeroAdministrativo: row.numeroAdministrativo,
    moduloAtual: row.moduloAtual,
    objeto: row.objeto,
  }));
}

async function loadProcessPreviewBase(
  db: DbClient,
  processoId: number,
): Promise<ProcessoPreviewBase> {
  const [row] = await db
    .select({
      id: processos.id,
      numeroSirel: processos.numeroSirel,
      numeroEdital: processos.numeroEdital,
      numeroAdministrativo: processos.numeroAdministrativo,
      objeto: processos.objeto,
      moduloAtual: workflowProcesso.moduloAtual,
    })
    .from(processos)
    .leftJoin(workflowProcesso, eq(workflowProcesso.processoId, processos.id))
    .where(eq(processos.id, processoId))
    .limit(1);

  if (!row) {
    throw new Error("Processo não encontrado para vincular a ata.");
  }

  return row;
}

async function loadRun(runId: number) {
  const db = requireDb();
  const [run] = await db
    .select()
    .from(licitacaoAtaSyncRuns)
    .where(eq(licitacaoAtaSyncRuns.id, runId))
    .limit(1);

  if (!run) {
    throw new Error("Execução da ata de sessão não encontrada.");
  }

  return run;
}

function buildSuggestionScore(
  candidate: ProcessoSuggestionCandidate,
  edital: string | null | undefined,
  processoAdministrativo: string | null | undefined,
): {
  score: number;
  level: "ALTO" | "MEDIO";
  reasons: string[];
  isLicitacao: boolean;
  updatedAtValue: number;
  yearDistance: number;
} | null {
  const normalizedEdital = normalizeAtaIdentifier(edital);
  const normalizedAdministrativo = normalizeAtaIdentifier(
    processoAdministrativo,
  );
  const candidateEdital = normalizeAtaIdentifier(candidate.numeroEdital);
  const candidateAdministrativo = normalizeAtaIdentifier(
    candidate.numeroAdministrativo,
  );

  const reasons: string[] = [];
  let score = 0;

  const editalMatch =
    Boolean(normalizedEdital) &&
    Boolean(candidateEdital) &&
    normalizedEdital === candidateEdital;
  const administrativoMatch =
    Boolean(normalizedAdministrativo) &&
    Boolean(candidateAdministrativo) &&
    normalizedAdministrativo === candidateAdministrativo;

  if (editalMatch && administrativoMatch) {
    score = 100;
    reasons.push("Edital e processo administrativo coincidem exatamente.");
  } else if (editalMatch) {
    score = 70;
    reasons.push("Número do edital coincidente.");
  } else if (administrativoMatch) {
    score = 68;
    reasons.push("Processo administrativo coincidente.");
  }

  if (!score) {
    return null;
  }

  const extractedYear = inferYearFromIdentifiers([
    edital,
    processoAdministrativo,
  ]);
  const candidateYear = candidate.anoReferencia;
  const yearDistance =
    extractedYear && candidateYear
      ? Math.abs(extractedYear - candidateYear)
      : Number.POSITIVE_INFINITY;

  return {
    score,
    level: score >= 100 ? "ALTO" : "MEDIO",
    reasons,
    isLicitacao: candidate.moduloAtual === "LICITACAO",
    updatedAtValue: candidate.atualizadoEm?.getTime() ?? 0,
    yearDistance,
  };
}

export function buildAtaSessaoSuggestedProcesses(params: {
  candidates: ProcessoSuggestionCandidate[];
  edital?: string | null;
  processoAdministrativo?: string | null;
}): AtaSessaoSuggestedProcess[] {
  const suggestions: Array<
    AtaSessaoSuggestedProcess & {
      _sort: {
        score: number;
        isLicitacao: boolean;
        updatedAtValue: number;
        yearDistance: number;
      };
    }
  > = [];

  for (const candidate of params.candidates) {
    const scoreData = buildSuggestionScore(
      candidate,
      params.edital,
      params.processoAdministrativo,
    );
    if (!scoreData) continue;
    suggestions.push({
      processId: candidate.id,
      numeroSirel: candidate.numeroSirel,
      numeroEdital: candidate.numeroEdital,
      numeroAdministrativo: candidate.numeroAdministrativo,
      objeto: candidate.objeto,
      moduloAtual: candidate.moduloAtual,
      score: scoreData.score,
      level: scoreData.level,
      reasons: scoreData.reasons,
      _sort: {
        score: scoreData.score,
        isLicitacao: scoreData.isLicitacao,
        updatedAtValue: scoreData.updatedAtValue,
        yearDistance: scoreData.yearDistance,
      },
    });
  }

  return suggestions
    .sort(
      (left, right) =>
        right._sort.score - left._sort.score ||
        Number(right._sort.isLicitacao) - Number(left._sort.isLicitacao) ||
        left._sort.yearDistance - right._sort.yearDistance ||
        right._sort.updatedAtValue - left._sort.updatedAtValue ||
        left.numeroSirel.localeCompare(right.numeroSirel),
    )
    .slice(0, 8)
    .map(({ _sort, ...item }) => item);
}

async function writePreviewFile(
  runId: number,
  outputDir: string,
  preview: AtaSessaoPreview,
) {
  ensureDirectory(outputDir);
  const previewPath = join(outputDir, `ata-sync-preview-${runId}.json`);
  writeFileSync(previewPath, JSON.stringify(preview, null, 2), "utf-8");
  return previewPath;
}

async function loadProcessState(
  db: DbClient,
  processoId: number,
): Promise<ProcessState> {
  const process = await loadProcessPreviewBase(db, processoId);
  const [licitacao] = await db
    .select({
      id: licitacoes.id,
      statusLicitacao: licitacoes.statusLicitacao,
    })
    .from(licitacoes)
    .where(eq(licitacoes.processoId, processoId))
    .limit(1);

  const [workflow] = await db
    .select({
      id: workflowProcesso.id,
      moduloAtual: workflowProcesso.moduloAtual,
      situacao: workflowProcesso.situacao,
      etapaAtual: workflowProcesso.etapaAtual,
    })
    .from(workflowProcesso)
    .where(eq(workflowProcesso.processoId, processoId))
    .limit(1);

  const items = await db
    .select({
      id: itensProcesso.id,
      numeroItem: itensProcesso.numeroItem,
      descricao: itensProcesso.descricao,
      quantidade: itensProcesso.quantidade,
      unidade: itensProcesso.unidade,
      loteId: itensProcesso.loteId,
      loteNumero: lotes.numeroLote,
    })
    .from(itensProcesso)
    .leftJoin(lotes, eq(lotes.id, itensProcesso.loteId))
    .where(eq(itensProcesso.processoId, processoId))
    .orderBy(asc(itensProcesso.numeroItem));

  const processLots = await db
    .select({
      id: lotes.id,
      numeroLote: lotes.numeroLote,
      descricao: lotes.descricao,
      origemAtualizacao: lotes.origemAtualizacao,
      origemReferencia: lotes.origemReferencia,
    })
    .from(lotes)
    .where(eq(lotes.processoId, processoId))
    .orderBy(asc(lotes.numeroLote));

  const suppliers = await db
    .select({
      id: fornecedores.id,
      razaoSocial: fornecedores.razaoSocial,
      cnpj: fornecedores.cnpj,
      ativo: fornecedores.ativo,
    })
    .from(fornecedores)
    .orderBy(asc(fornecedores.razaoSocial));

  const licitantesRows = licitacao
    ? await db
        .select({
          id: licitantes.id,
          fornecedorId: licitantes.fornecedorId,
          statusHabilitacao: licitantes.statusHabilitacao,
          ativo: licitantes.ativo,
          origemAtualizacao: licitantes.origemAtualizacao,
          origemReferencia: licitantes.origemReferencia,
        })
        .from(licitantes)
        .where(eq(licitantes.licitacaoId, licitacao.id))
    : [];

  const proposalRows = licitacao
    ? await db
        .select({
          id: propostasLicitacao.id,
          licitanteId: propostasLicitacao.licitanteId,
          itemId: propostasLicitacao.itemId,
          valorUnitarioProposto: propostasLicitacao.valorUnitarioProposto,
          classificacao: propostasLicitacao.classificacao,
          situacao: propostasLicitacao.situacao,
          origemAtualizacao: propostasLicitacao.origemAtualizacao,
          origemReferencia: propostasLicitacao.origemReferencia,
        })
        .from(propostasLicitacao)
        .innerJoin(
          licitantes,
          eq(licitantes.id, propostasLicitacao.licitanteId),
        )
        .where(eq(licitantes.licitacaoId, licitacao.id))
    : [];

  const itemIds = items.map((item) => item.id);
  const itemValues = itemIds.length
    ? await db
        .select({
          id: itensProcessoValores.id,
          itemProcessoId: itensProcessoValores.itemProcessoId,
          fornecedorVencedorId: itensProcessoValores.fornecedorVencedorId,
          fornecedorVencedorNome: itensProcessoValores.fornecedorVencedorNome,
          fornecedorVencedorCnpj: itensProcessoValores.fornecedorVencedorCnpj,
          valorLanceVencedorUnitario:
            itensProcessoValores.valorLanceVencedorUnitario,
          valorLanceVencedorTotal: itensProcessoValores.valorLanceVencedorTotal,
          itemDeserto: itensProcessoValores.itemDeserto,
          itemFracassado: itensProcessoValores.itemFracassado,
          motivoFracasso: itensProcessoValores.motivoFracasso,
          numeroLote: itensProcessoValores.numeroLote,
          origemAlteracao: itensProcessoValores.origemAlteracao,
        })
        .from(itensProcessoValores)
        .where(inArray(itensProcessoValores.itemProcessoId, itemIds))
    : [];

  const lotKeyByItemId = new Map<number, string>();
  for (const itemValue of itemValues) {
    const lotKey = normalizeLotKey(itemValue.numeroLote);
    if (lotKey) {
      lotKeyByItemId.set(itemValue.itemProcessoId, lotKey);
    }
  }

  const resolvedItems = items.map((item) => ({
    ...item,
    loteNumero:
      normalizeLotKey(item.loteNumero) ?? lotKeyByItemId.get(item.id) ?? null,
  }));

  const resourceRows = licitacao
    ? await db
        .select({
          id: recursosLicitacao.id,
          licitanteId: recursosLicitacao.licitanteId,
          resultado: recursosLicitacao.resultado,
          descricao: recursosLicitacao.descricao,
          origemAtualizacao: recursosLicitacao.origemAtualizacao,
          origemReferencia: recursosLicitacao.origemReferencia,
        })
        .from(recursosLicitacao)
        .where(eq(recursosLicitacao.licitacaoId, licitacao.id))
    : [];

  return {
    process,
    currentPhase: licitacao?.statusLicitacao ?? "PREPARACAO",
    licitacaoId: licitacao?.id ?? null,
    items: resolvedItems,
    lots: processLots,
    suppliers,
    licitantes: licitantesRows,
    proposals: proposalRows,
    itemValues,
    resources: resourceRows,
    workflow: workflow ?? null,
  };
}

export function resolveAtaLotItemMatch(
  lot: ParsedLot,
  items: ProcessItemRow[],
): LotItemMatch {
  const parsedItems = Array.isArray(lot.itens) ? lot.itens : [];
  const primaryParsedItem = parsedItems[0] ?? null;
  const lotKey = normalizeLotKey(lot.numero_lote);
  const referenceTexts = [primaryParsedItem?.descricao, lot.titulo].filter(
    Boolean,
  );
  const candidates: Array<{
    item: ProcessItemRow;
    score: number;
    reason: string;
  }> = [];

  const directLotItems = lotKey
    ? items.filter((item) => normalizeLotKey(item.loteNumero) === lotKey)
    : [];
  if (directLotItems.length === 1) {
    return {
      status: "MATCHED",
      matchedItem: directLotItems[0],
      score: 1,
      reason: "Item do processo já vinculado ao mesmo lote.",
      candidates: [{ item: directLotItems[0], score: 1, reason: "lote" }],
      supportsValueSync: parsedItems.length <= 1,
      multiItemWarning:
        parsedItems.length > 1
          ? "Lote com múltiplos itens na ata; propostas e lances não serão materializados automaticamente."
          : null,
    };
  }

  const parsedItemNumero = Number(primaryParsedItem?.item_numero ?? 0);
  if (parsedItemNumero > 0) {
    const exactItem = items.find(
      (item) => item.numeroItem === parsedItemNumero,
    );
    const exactItemTextScore = exactItem
      ? Math.max(
          ...referenceTexts.map((value) =>
            ataTokenSimilarity(value, exactItem.descricao),
          ),
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
        status: "MATCHED",
        matchedItem: exactItem,
        score: 0.98,
        reason: "Número do item da ata coincide com o item interno.",
        candidates: [
          {
            item: exactItem,
            score: 0.98,
            reason: "item_numero",
          },
        ],
        supportsValueSync: parsedItems.length <= 1,
        multiItemWarning:
          parsedItems.length > 1
            ? "Lote com múltiplos itens na ata; propostas e lances não serão materializados automaticamente."
            : null,
      };
    }
  }
  for (const item of items) {
    const textScore = Math.max(
      ...referenceTexts.map((value) =>
        ataTokenSimilarity(value, item.descricao),
      ),
      0,
    );
    const lotBonus =
      normalizeLotKey(item.loteNumero) === lotKey && item.loteNumero !== null
        ? 0.1
        : 0;
    const finalScore = Math.min(1, textScore + lotBonus);
    if (finalScore > 0) {
      candidates.push({
        item,
        score: finalScore,
        reason:
          lotBonus > 0
            ? "descrição semelhante com reforço do número do lote"
            : "descrição semelhante",
      });
    }
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score || left.item.numeroItem - right.item.numeroItem,
  );
  const best = candidates[0] ?? null;
  const second = candidates[1] ?? null;

  if (best && best.score >= 0.65 && best.score - (second?.score ?? 0) >= 0.15) {
    return {
      status: "MATCHED",
      matchedItem: best.item,
      score: best.score,
      reason: best.reason,
      candidates,
      supportsValueSync: parsedItems.length <= 1,
      multiItemWarning:
        parsedItems.length > 1
          ? "Lote com múltiplos itens na ata; propostas e lances não serão materializados automaticamente."
          : null,
    };
  }

  if (candidates.length) {
    return {
      status: "AMBIGUOUS",
      matchedItem: null,
      score: best?.score ?? 0,
      reason: "Mais de um item interno parece compatível com o lote.",
      candidates,
      supportsValueSync: false,
      multiItemWarning: null,
    };
  }

  return {
    status: "MISSING",
    matchedItem: null,
    score: 0,
    reason: "Nenhum item interno pôde ser associado ao lote.",
    candidates: [],
    supportsValueSync: false,
    multiItemWarning: null,
  };
}

function resolveSupplierPlan(
  suppliers: SupplierRow[],
  name: string | null | undefined,
  document: string | null | undefined,
) {
  const normalizedName = normalizeAtaText(name);
  const normalizedDocument = digitsOnly(document);
  const key = normalizedDocument || normalizedName || `sem-chave-${Date.now()}`;

  if (normalizedDocument) {
    const exactByDocument =
      suppliers.find(
        (supplier) => digitsOnly(supplier.cnpj) === normalizedDocument,
      ) ?? null;
    if (exactByDocument) {
      return {
        key,
        name: name?.trim() || exactByDocument.razaoSocial,
        document: document?.trim() || exactByDocument.cnpj,
        existing: exactByDocument,
      } satisfies SupplierPlan;
    }
  }

  const exactByName =
    suppliers.find(
      (supplier) => normalizeAtaText(supplier.razaoSocial) === normalizedName,
    ) ?? null;
  if (exactByName) {
    return {
      key,
      name: name?.trim() || exactByName.razaoSocial,
      document: document?.trim() || exactByName.cnpj,
      existing: exactByName,
    } satisfies SupplierPlan;
  }

  const bestBySimilarity = suppliers
    .map((supplier) => ({
      supplier,
      similarity: ataTokenSimilarity(name, supplier.razaoSocial),
    }))
    .sort((left, right) => right.similarity - left.similarity)[0];

  if (bestBySimilarity && bestBySimilarity.similarity >= 0.72) {
    return {
      key,
      name: name?.trim() || bestBySimilarity.supplier.razaoSocial,
      document: document?.trim() || bestBySimilarity.supplier.cnpj,
      existing: bestBySimilarity.supplier,
    } satisfies SupplierPlan;
  }

  return {
    key,
    name: name?.trim() || "Fornecedor da ata",
    document: document?.trim() || null,
    existing: null,
  } satisfies SupplierPlan;
}

function computeUnitPrice(totalValue: number | null, quantity: string) {
  if (totalValue === null) return null;
  const quantityNumber = toNumber(quantity);
  if (!quantityNumber || quantityNumber <= 0) return null;
  return totalValue / quantityNumber;
}

function buildLotReferenceTotal(lot: ParsedLot) {
  const bestTotal = toNumber(lot.melhor_lance);
  if (bestTotal !== null) return bestTotal;
  const primaryItem = Array.isArray(lot.itens) ? (lot.itens[0] ?? null) : null;
  return (
    toNumber(primaryItem?.valor_total) ??
    toNumber(primaryItem?.valor_unitario_estimado) ??
    toNumber(primaryItem?.valor_unitario)
  );
}

function dedupeByKey<T>(values: T[], buildKey: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = buildKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildLicitanteKey(supplierKey: string) {
  return `licitante:${supplierKey}`;
}

function findWinnerParticipant(lot: ParsedLot) {
  const participants = Array.isArray(lot.participantes)
    ? lot.participantes
    : [];
  const classificados = participants
    .filter(
      (participant) =>
        normalizeAtaText(participant.section) === "classificacao",
    )
    .sort(
      (left, right) =>
        Number(left.ranking ?? 9999) - Number(right.ranking ?? 9999) ||
        Number(left.oferta_final ?? Number.MAX_SAFE_INTEGER) -
          Number(right.oferta_final ?? Number.MAX_SAFE_INTEGER),
    );
  return classificados[0] ?? null;
}

function buildPreviewIssue(
  code: string,
  message: string,
  severity: "BLOCKING" | "WARNING",
  lotNumber?: number | null,
  entityType?: string | null,
  entityLabel?: string | null,
) {
  return {
    code,
    message,
    severity,
    lotNumber: lotNumber ?? null,
    entityType: entityType ?? null,
    entityLabel: entityLabel ?? null,
  };
}

function decideSelectionMode(
  suggestedProcesses: AtaSessaoSuggestedProcess[],
  processoId: number,
  explicitMode: "SUGERIDO" | "MANUAL" | null,
): AtaDiscoveryMode {
  if (explicitMode === "MANUAL") {
    return "ESCOLHIDO_MANUALMENTE_APOS_SUGESTAO";
  }

  const isSuggested = suggestedProcesses.some(
    (item) => item.processId === processoId,
  );
  return isSuggested
    ? "SUGERIDO_POR_IDENTIFICADORES"
    : "ESCOLHIDO_MANUALMENTE_APOS_SUGESTAO";
}

async function buildAtaPreviewAnalysis(params: {
  db: DbClient;
  runId: number;
  processId: number;
  documentId: number | null;
  discoveryMode: AtaDiscoveryMode | null;
  payload: AtaSessaoParsedPayload;
  artifacts: AtaSessaoPreview["artifacts"];
}): Promise<AtaAnalysis> {
  const state = await loadProcessState(params.db, params.processId);
  const previewIssues: AtaSessaoPreview["blockingIssues"] = [];
  const warnings = Array.isArray(params.payload.warnings)
    ? [...params.payload.warnings]
    : [];
  const supplierPlans = new Map<string, SupplierPlan>();
  const licitanteCreatePlans = new Map<
    string,
    { key: string; supplierKey: string }
  >();
  const allLotAnalysis: LotAnalysis[] = [];
  let highestSuggestedPhase: string | null = null;

  for (const rawLot of Array.isArray(params.payload.lotes)
    ? (params.payload.lotes as ParsedLot[])
    : []) {
    const lot = rawLot;
    const lotKey = normalizeLotKey(lot.numero_lote);
    const issues: AtaSessaoPreview["blockingIssues"] = [];
    const actions: string[] = [];
    const proposalPlans: ProposalPlan[] = [];
    const lancePlans: LancePlan[] = [];
    const recursoPlans: RecursoPlan[] = [];
    const localSupplierPlans = new Map<string, SupplierPlan>();
    const match = resolveAtaLotItemMatch(lot, state.items);
    const lotRow = state.lots.find(
      (item) => normalizeLotKey(item.numeroLote) === lotKey,
    );
    const phaseFromLot = inferSuggestedPhaseFromStatus(lot.status);

    if (
      phaseFromLot &&
      (!highestSuggestedPhase ||
        currentPhaseRank(phaseFromLot) >
          currentPhaseRank(highestSuggestedPhase))
    ) {
      highestSuggestedPhase = phaseFromLot;
    }

    if (match.status === "AMBIGUOUS") {
      issues.push(
        buildPreviewIssue(
          "ITEM_AMBIGUO",
          `O lote ${lot.numero_lote} corresponde a mais de um item do processo e precisa de confirmação manual.`,
          "BLOCKING",
          lot.numero_lote,
          "ITEM",
          lot.titulo,
        ),
      );
    } else if (match.status === "MISSING") {
      issues.push(
        buildPreviewIssue(
          "ITEM_NAO_ENCONTRADO",
          `O lote ${lot.numero_lote} não encontrou item correspondente no processo.`,
          "BLOCKING",
          lot.numero_lote,
          "ITEM",
          lot.titulo,
        ),
      );
    }

    if (match.multiItemWarning) {
      warnings.push(`Lote ${lot.numero_lote}: ${match.multiItemWarning}`);
    }

    const winnerParticipant = findWinnerParticipant(lot);
    const winnerName =
      lot.vencedor?.trim() || winnerParticipant?.razao_social?.trim() || null;
    const winnerDocument =
      lot.cnpj_vencedor?.trim() || winnerParticipant?.documento?.trim() || null;
    const winnerSupplierPlan = winnerName
      ? resolveSupplierPlan(state.suppliers, winnerName, winnerDocument)
      : null;
    if (winnerSupplierPlan) {
      supplierPlans.set(winnerSupplierPlan.key, winnerSupplierPlan);
      localSupplierPlans.set(winnerSupplierPlan.key, winnerSupplierPlan);
    }

    const participants = Array.isArray(lot.participantes)
      ? lot.participantes
      : [];
    for (const participant of participants) {
      const section = normalizeAtaText(participant.section);
      if (
        !["classificacao", "desclassificados", "movimentos"].includes(section)
      ) {
        continue;
      }
      const supplierPlan = resolveSupplierPlan(
        state.suppliers,
        participant.razao_social,
        participant.documento,
      );
      supplierPlans.set(supplierPlan.key, supplierPlan);
      localSupplierPlans.set(supplierPlan.key, supplierPlan);
    }

    for (const supplierPlan of localSupplierPlans.values()) {
      if (!supplierPlan.existing) {
        actions.push(`Criar fornecedor ${supplierPlan.name}`);
      }
      const licitanteKey = buildLicitanteKey(supplierPlan.key);
      const existingLicitante = supplierPlan.existing
        ? (state.licitantes.find(
            (item) => item.fornecedorId === supplierPlan.existing?.id,
          ) ?? null)
        : null;
      if (!existingLicitante) {
        licitanteCreatePlans.set(licitanteKey, {
          key: licitanteKey,
          supplierKey: supplierPlan.key,
        });
      } else if (
        !existingLicitante.ativo &&
        !isAtaOrigin(existingLicitante.origemAtualizacao)
      ) {
        issues.push(
          buildPreviewIssue(
            "LICITANTE_INATIVO_MANUAL",
            `O fornecedor ${supplierPlan.name} está inativo manualmente no processo e precisa de revisão antes da sincronização.`,
            "BLOCKING",
            lot.numero_lote,
            "LICITANTE",
            supplierPlan.name,
          ),
        );
      }
    }

    const supportsValueSync =
      match.status === "MATCHED" && match.supportsValueSync;
    if (supportsValueSync && match.matchedItem) {
      const matchedItem = match.matchedItem;
      const quantity = matchedItem.quantidade;
      const existingItemValue =
        state.itemValues.find(
          (itemValue) => itemValue.itemProcessoId === matchedItem.id,
        ) ?? null;

      const relevantParticipants = participants.filter((participant) =>
        ["classificacao", "desclassificados"].includes(
          normalizeAtaText(participant.section),
        ),
      );

      for (const participant of relevantParticipants) {
        const supplierPlan = resolveSupplierPlan(
          state.suppliers,
          participant.razao_social,
          participant.documento,
        );
        const licitanteKey = buildLicitanteKey(supplierPlan.key);
        const existingLicitante = supplierPlan.existing
          ? (state.licitantes.find(
              (item) => item.fornecedorId === supplierPlan.existing?.id,
            ) ?? null)
          : null;
        const existingProposal = existingLicitante
          ? (state.proposals.find(
              (proposal) =>
                proposal.licitanteId === existingLicitante.id &&
                proposal.itemId === matchedItem.id,
            ) ?? null)
          : null;
        const totalValue =
          toNumber(participant.oferta_final) ??
          toNumber(participant.oferta_inicial);
        const valorUnitario = computeUnitPrice(totalValue, quantity);
        if (valorUnitario === null) {
          continue;
        }

        const isDesclassificada =
          normalizeAtaText(participant.section) === "desclassificados";
        const situacao: ProposalPlan["situacao"] = isDesclassificada
          ? "DESCLASSIFICADA"
          : Number(participant.ranking ?? 9999) === 1 &&
              normalizeAtaText(lot.status).includes("adjud")
            ? "VENCEDORA"
            : "VALIDA";

        if (
          existingProposal &&
          !isAtaOrigin(existingProposal.origemAtualizacao)
        ) {
          const currentValue = toNumber(existingProposal.valorUnitarioProposto);
          if (
            currentValue !== valorUnitario ||
            (existingProposal.classificacao ?? null) !==
              (participant.ranking ?? null) ||
            existingProposal.situacao !== situacao
          ) {
            issues.push(
              buildPreviewIssue(
                "PROPOSTA_MANUAL_DIVERGENTE",
                `A proposta manual de ${supplierPlan.name} diverge da ata no lote ${lot.numero_lote}.`,
                "BLOCKING",
                lot.numero_lote,
                "PROPOSTA",
                supplierPlan.name,
              ),
            );
          }
        }

        proposalPlans.push({
          licitanteKey,
          itemId: matchedItem.id,
          valorUnitario,
          classificacao: participant.ranking ?? null,
          situacao,
          justificativa: isDesclassificada
            ? "Importado automaticamente da ata de sessão."
            : null,
          existing: existingProposal,
        });
      }

      const movementParticipants = dedupeByKey(
        participants.filter(
          (participant) =>
            normalizeAtaText(participant.section) === "movimentos" &&
            (toNumber(participant.oferta_inicial) ?? null) !== null,
        ),
        (participant) =>
          [
            normalizeAtaText(participant.razao_social),
            digitsOnly(participant.documento),
            toNumber(participant.oferta_inicial),
            participant.raw_line,
          ].join("|"),
      );

      for (const movementParticipant of movementParticipants) {
        const supplierPlan = resolveSupplierPlan(
          state.suppliers,
          movementParticipant.razao_social,
          movementParticipant.documento,
        );
        const rawTimestamp =
          movementParticipant.raw_line?.slice(0, 19) ??
          (Array.isArray(lot.movimentos)
            ? (lot.movimentos.find((item) =>
                String(item.raw_text ?? "").includes(
                  String(movementParticipant.razao_social ?? ""),
                ),
              )?.timestamp ?? null)
            : null);
        const parsedTimestamp =
          parseAtaTimestamp(rawTimestamp) ??
          new Date(params.payload.generated_at);
        const valorLance =
          toNumber(movementParticipant.oferta_inicial) ??
          toNumber(movementParticipant.oferta_final);
        if (valorLance === null) continue;
        lancePlans.push({
          licitanteKey: buildLicitanteKey(supplierPlan.key),
          itemId: matchedItem.id,
          valorLance,
          dataLance: parsedTimestamp,
          observacao: movementParticipant.raw_line?.trim() || null,
        });
      }

      const itemValuePlan: ItemValuePlan = {
        itemId: matchedItem.id,
        fornecedorKey: winnerSupplierPlan?.key ?? null,
        fornecedorNome: winnerName,
        fornecedorDocumento: winnerDocument,
        valorUnitario: computeUnitPrice(buildLotReferenceTotal(lot), quantity),
        valorTotal: buildLotReferenceTotal(lot),
        itemDeserto: normalizeAtaText(lot.status) === "deserto",
        itemFracassado: ["fracassado", "cancelado"].includes(
          normalizeAtaText(lot.status),
        ),
        motivoFracasso: lot.motivo_falha?.trim() || null,
        existing: existingItemValue,
      };

      if (
        existingItemValue &&
        !isAtaOriginRef(existingItemValue.origemAlteracao) &&
        (existingItemValue.itemDeserto !== itemValuePlan.itemDeserto ||
          existingItemValue.itemFracassado !== itemValuePlan.itemFracassado ||
          digitsOnly(existingItemValue.fornecedorVencedorCnpj) !==
            digitsOnly(itemValuePlan.fornecedorDocumento) ||
          toNumber(existingItemValue.valorLanceVencedorUnitario) !==
            itemValuePlan.valorUnitario)
      ) {
        issues.push(
          buildPreviewIssue(
            "RESULTADO_MANUAL_DIVERGENTE",
            `O resultado manual do item associado ao lote ${lot.numero_lote} diverge da ata e serÃ¡ sobrescrito com rastreabilidade.`,
            "WARNING",
            lot.numero_lote,
            "ITEM_RESULTADO",
            matchedItem.descricao,
          ),
        );
        actions.push(
          `O resultado manual do item ${matchedItem.numeroItem} serÃ¡ sobrescrito pela ata com rastreabilidade.`,
        );
      }

      const normalizedStatus = normalizeAtaText(lot.status);
      const shouldSetWinnerHabilitado =
        Boolean(winnerSupplierPlan) &&
        [
          "habilitacao",
          "em habilitacao",
          "em adjudicacao",
          "adjudicado",
          "adjudicacao",
        ].includes(normalizedStatus);
      const winnerLicitanteKey = winnerSupplierPlan
        ? buildLicitanteKey(winnerSupplierPlan.key)
        : null;

      if (proposalPlans.length) {
        actions.push(
          `${proposalPlans.length} proposta(s) serão sincronizadas para o lote ${lot.numero_lote}`,
        );
      }
      if (lancePlans.length) {
        actions.push(
          `${lancePlans.length} lance(s) serão registrados para o lote ${lot.numero_lote}`,
        );
      }

      const lotAnalysis: LotAnalysis = {
        lot,
        match,
        issues,
        actions,
        supplierPlans: Array.from(localSupplierPlans.values()),
        proposalPlans,
        lancePlans: dedupeByKey(
          lancePlans,
          (item) =>
            `${item.licitanteKey}|${item.itemId}|${item.dataLance.toISOString()}|${item.valorLance}`,
        ),
        recursoPlans,
        itemValuePlan,
        lotNeedsCreate: !lotRow,
        winnerLicitanteKey,
        shouldSetWinnerHabilitado,
      };
      allLotAnalysis.push(lotAnalysis);
      previewIssues.push(
        ...issues.filter((issue) => issue.severity === "BLOCKING"),
      );
      continue;
    }

    if (normalizeAtaText(lot.status).includes("recurso")) {
      const firstMovementDate = Array.isArray(lot.movimentos)
        ? parseAtaTimestamp(lot.movimentos[0]?.timestamp)
        : null;
      const recurringParticipant = participants.find((participant) => {
        const participantName = normalizeAtaText(participant.razao_social);
        return Array.isArray(lot.movimentos)
          ? lot.movimentos.some((movement) =>
              normalizeAtaText(movement.raw_text).includes(participantName),
            )
          : false;
      });
      if (recurringParticipant) {
        const supplierPlan = resolveSupplierPlan(
          state.suppliers,
          recurringParticipant.razao_social,
          recurringParticipant.documento,
        );
        const resourceExisting =
          supplierPlan.existing && state.licitacaoId
            ? (state.resources.find((resource) => {
                const licitante = state.licitantes.find(
                  (item) => item.id === resource.licitanteId,
                );
                return licitante?.fornecedorId === supplierPlan.existing?.id;
              }) ?? null)
            : null;
        recursoPlans.push({
          licitanteKey: buildLicitanteKey(supplierPlan.key),
          dataInterposicao: (firstMovementDate ?? new Date())
            .toISOString()
            .slice(0, 10),
          dataJulgamento: normalizeAtaText(lot.status).includes("julgamento")
            ? (firstMovementDate ?? new Date()).toISOString().slice(0, 10)
            : null,
          resultado: "PENDENTE",
          descricao: `Recurso importado automaticamente a partir do lote ${lot.numero_lote} da ata.`,
          decisao: null,
          existing: resourceExisting,
        });
        actions.push(
          `1 recurso será sincronizado para o lote ${lot.numero_lote}`,
        );
      } else {
        warnings.push(
          `Lote ${lot.numero_lote} está em fase recursal, mas a ata não identificou o licitante recorrente.`,
        );
      }
    }

    const lotAnalysis: LotAnalysis = {
      lot,
      match,
      issues,
      actions,
      supplierPlans: Array.from(localSupplierPlans.values()),
      proposalPlans,
      lancePlans,
      recursoPlans,
      itemValuePlan: null,
      lotNeedsCreate: !lotRow,
      winnerLicitanteKey: null,
      shouldSetWinnerHabilitado: false,
    };
    allLotAnalysis.push(lotAnalysis);
    previewIssues.push(
      ...issues.filter((issue) => issue.severity === "BLOCKING"),
    );
  }

  const uniqueSuppliersToCreate = Array.from(supplierPlans.values()).filter(
    (supplier) => !supplier.existing,
  );
  const uniqueLicitantesToCreate = Array.from(licitanteCreatePlans.values());
  const proposals = allLotAnalysis.flatMap((lot) => lot.proposalPlans);
  const lances = allLotAnalysis.flatMap((lot) => lot.lancePlans);
  const recursos = allLotAnalysis.flatMap((lot) => lot.recursoPlans);
  const results = allLotAnalysis.flatMap((lot) =>
    lot.itemValuePlan ? [lot.itemValuePlan] : [],
  );
  const lotsToCreate = allLotAnalysis.filter(
    (lot) => lot.lotNeedsCreate,
  ).length;

  const preview = ataSessaoPreviewSchema.parse({
    runId: params.runId,
    generatedAt: params.payload.generated_at,
    processId: params.processId,
    documentId: params.documentId,
    artifacts: params.artifacts,
    discoveryMode: params.discoveryMode,
    process: state.process,
    document: params.documentId
      ? {
          id: params.documentId,
          titulo: `Ata de sessão vinculada ao processo ${state.process.numeroSirel}`,
          arquivoUrl: `/api/planejamento/documentos/${params.documentId}/download`,
        }
      : null,
    extractedMetadata: {
      edital: params.payload.edital ?? null,
      processoAdministrativo: params.payload.processo_administrativo ?? null,
    },
    summary: {
      totalLotes: params.payload.summary.total_lotes,
      emAndamento: params.payload.summary.em_andamento,
      adjudicados: params.payload.summary.adjudicados,
      faseRecursal: params.payload.summary.fase_recursal,
      malsucedidos: params.payload.summary.malsucedidos,
      warnings: params.payload.summary.warnings,
      parsingErrors: params.payload.summary.parsing_errors,
    },
    phase: {
      current: state.currentPhase,
      suggested:
        highestSuggestedPhase &&
        currentPhaseRank(highestSuggestedPhase) >
          currentPhaseRank(state.currentPhase)
          ? highestSuggestedPhase
          : null,
      willAdvance:
        Boolean(highestSuggestedPhase) &&
        currentPhaseRank(highestSuggestedPhase) >
          currentPhaseRank(state.currentPhase),
    },
    counts: {
      fornecedoresCriar: uniqueSuppliersToCreate.length,
      licitantesCriar: uniqueLicitantesToCreate.length,
      lotesCriar: lotsToCreate,
      propostasCriar: proposals.filter((proposal) => !proposal.existing).length,
      propostasAtualizar: proposals.filter(
        (proposal) =>
          proposal.existing && isAtaOrigin(proposal.existing.origemAtualizacao),
      ).length,
      lancesCriar: lances.length,
      recursosCriar: recursos.filter((resource) => !resource.existing).length,
      resultadosAtualizar: results.length,
      conflitosBloqueantes: previewIssues.length,
    },
    warnings: dedupeByKey(warnings, (item) => item),
    blockingIssues: previewIssues,
    lots: allLotAnalysis.map((analysis) => ({
      lotNumber: analysis.lot.numero_lote,
      statusAta: analysis.lot.status,
      title: analysis.lot.titulo,
      matchedItemId: analysis.match.matchedItem?.id ?? null,
      matchedItemLabel: analysis.match.matchedItem
        ? `Item ${analysis.match.matchedItem.numeroItem} - ${analysis.match.matchedItem.descricao}`
        : null,
      itemMatchStatus: analysis.match.status,
      actions: dedupeByKey(analysis.actions, (item) => item),
      issues: analysis.issues,
    })),
  });

  return {
    preview,
    lots: allLotAnalysis,
    suppliersToCreate: uniqueSuppliersToCreate,
    licitantesToCreate: uniqueLicitantesToCreate,
  };
}

async function createDocumentoFromAtaTempFile(params: {
  db: DbClient;
  processoId: number;
  draft: AtaSessaoPreviewDocumentDraft;
  sourceAbsolutePath: string;
  originalFileName: string;
  criadoPor: number | null;
}) {
  ensureDirectory(uploadsRoot);
  const processFolder = join(uploadsRoot, `processo-${params.processoId}`);
  ensureDirectory(processFolder);

  const extension =
    extname(params.originalFileName || params.sourceAbsolutePath) || ".pdf";
  const baseName =
    slugifyAtaSessaoFileName(
      params.originalFileName.replace(/\.[^.]+$/, "") ||
        params.draft.titulo ||
        "ata-sessao",
    ) || "ata-sessao";
  const targetFileName = `${Date.now()}-${baseName}${extension.toLowerCase()}`;
  const targetAbsolutePath = join(processFolder, targetFileName);
  copyFileSync(params.sourceAbsolutePath, targetAbsolutePath);

  const [latest] = await params.db
    .select({ versao: documentos.versao })
    .from(documentos)
    .where(eq(documentos.processoId, params.processoId))
    .orderBy(desc(documentos.versao))
    .limit(1);
  const nextVersion = Number(latest?.versao ?? 0) + 1;
  const relativePath = relative(uploadsRoot, targetAbsolutePath).replace(
    /\\/g,
    "/",
  );
  const normalizedDraft = normalizeDocumentDraft(params.draft);

  const [created] = await params.db
    .insert(documentos)
    .values({
      processoId: params.processoId,
      titulo: normalizedDraft.titulo,
      descricao: normalizedDraft.descricao ?? null,
      tipo: normalizedDraft.tipo,
      categoria: normalizedDraft.categoria ?? null,
      versao: nextVersion,
      arquivoUrl: "",
      arquivoChave: relativePath,
      tamanhoBytes: statSync(targetAbsolutePath).size,
      mimeType: "application/pdf",
      dataReferencia: normalizedDraft.dataReferencia ?? null,
      publico: normalizedDraft.publico,
      palavrasChave: normalizedDraft.palavrasChave,
      restritoA: normalizedDraft.restritoA,
      criadoPor: params.criadoPor,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    })
    .returning();

  const downloadUrl = `/api/planejamento/documentos/${created.id}/download`;
  await params.db
    .update(documentos)
    .set({
      arquivoUrl: downloadUrl,
      atualizadoEm: new Date(),
    })
    .where(eq(documentos.id, created.id));

  return {
    ...created,
    arquivoUrl: downloadUrl,
  };
}

function readParsedPayload(parsedJsonPath: string | null | undefined) {
  if (!parsedJsonPath?.trim()) {
    throw new Error("JSON consolidado da ata não foi encontrado.");
  }
  const absolutePath = resolve(parsedJsonPath);
  if (!existsSync(absolutePath)) {
    throw new Error(
      `JSON consolidado da ata não encontrado em ${absolutePath}.`,
    );
  }
  return JSON.parse(
    readFileSync(absolutePath, "utf-8"),
  ) as AtaSessaoParsedPayload;
}

async function ensureLicitacaoRecord(db: DbClient, processoId: number) {
  const [existing] = await db
    .select({ id: licitacoes.id })
    .from(licitacoes)
    .where(eq(licitacoes.processoId, processoId))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(licitacoes)
    .values({
      processoId,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    })
    .returning({ id: licitacoes.id });
  return created.id;
}

async function resetPreviousAtaSyncData(
  db: DbClient,
  processoId: number,
  licitacaoId: number,
) {
  const licitantesAta = await db
    .select({ id: licitantes.id })
    .from(licitantes)
    .where(
      and(
        eq(licitantes.licitacaoId, licitacaoId),
        eq(licitantes.origemAtualizacao, "ATA_SESSAO"),
      ),
    );
  const licitanteIds = licitantesAta.map((item) => item.id);

  if (licitanteIds.length) {
    await db
      .delete(recursosLicitacao)
      .where(
        and(
          eq(recursosLicitacao.licitacaoId, licitacaoId),
          eq(recursosLicitacao.origemAtualizacao, "ATA_SESSAO"),
        ),
      );
    await db
      .delete(propostasLicitacao)
      .where(
        and(
          inArray(propostasLicitacao.licitanteId, licitanteIds),
          eq(propostasLicitacao.origemAtualizacao, "ATA_SESSAO"),
        ),
      );
    await db.delete(licitantes).where(inArray(licitantes.id, licitanteIds));
  }

  const processItemIds = (
    await db
      .select({ id: itensProcesso.id })
      .from(itensProcesso)
      .where(eq(itensProcesso.processoId, processoId))
  ).map((item) => item.id);

  if (processItemIds.length) {
    await db
      .delete(itensProcessoValores)
      .where(
        and(
          inArray(itensProcessoValores.itemProcessoId, processItemIds),
          like(itensProcessoValores.origemAlteracao, "ATA_SESSAO:%"),
        ),
      );
  }

  await db
    .delete(lotes)
    .where(
      and(
        eq(lotes.processoId, processoId),
        eq(lotes.origemAtualizacao, "ATA_SESSAO"),
      ),
    );
}

async function applyAtaAnalysis(params: {
  db: DbClient;
  runId: number;
  processId: number;
  userId: number | null;
  payload: AtaSessaoParsedPayload;
  analysis: AtaAnalysis;
}) {
  const licitacaoId = await ensureLicitacaoRecord(params.db, params.processId);
  await resetPreviousAtaSyncData(params.db, params.processId, licitacaoId);

  const itemRows = await params.db
    .select({
      id: itensProcesso.id,
      numeroItem: itensProcesso.numeroItem,
      quantidade: itensProcesso.quantidade,
    })
    .from(itensProcesso)
    .where(eq(itensProcesso.processoId, params.processId));
  const itemById = new Map(itemRows.map((item) => [item.id, item]));

  const supplierIdByKey = new Map<string, number>();
  for (const supplierPlan of params.analysis.suppliersToCreate) {
    const generatedDocument =
      digitsOnly(supplierPlan.document).slice(0, 14) ||
      `AUTOATA${String(params.runId).padStart(6, "0")}${String(
        supplierIdByKey.size + 1,
      ).padStart(2, "0")}`;
    const [created] = await params.db
      .insert(fornecedores)
      .values({
        razaoSocial: supplierPlan.name,
        cnpj: generatedDocument,
        ativo: true,
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .returning({
        id: fornecedores.id,
      });
    supplierIdByKey.set(supplierPlan.key, created.id);
  }

  for (const lotAnalysis of params.analysis.lots) {
    if (!lotAnalysis.lotNeedsCreate) continue;
    await params.db.insert(lotes).values({
      processoId: params.processId,
      numeroLote: lotAnalysis.lot.numero_lote,
      descricao: lotAnalysis.lot.titulo,
      valorEstimado:
        buildLotReferenceTotal(lotAnalysis.lot)?.toFixed(2) ?? null,
      valorHomologado:
        buildLotReferenceTotal(lotAnalysis.lot)?.toFixed(2) ?? null,
      origemAtualizacao: "ATA_SESSAO",
      origemReferencia: buildAtaOriginRef(params.runId),
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    });
  }

  const refreshedSuppliers = await params.db
    .select({
      id: fornecedores.id,
      razaoSocial: fornecedores.razaoSocial,
      cnpj: fornecedores.cnpj,
    })
    .from(fornecedores);
  for (const supplier of refreshedSuppliers) {
    const byDocument = digitsOnly(supplier.cnpj);
    if (byDocument) {
      supplierIdByKey.set(byDocument, supplier.id);
    }
    supplierIdByKey.set(normalizeAtaText(supplier.razaoSocial), supplier.id);
  }

  const licitanteIdByKey = new Map<string, number>();
  for (const lotAnalysis of params.analysis.lots) {
    for (const supplierPlan of lotAnalysis.supplierPlans) {
      const supplierId =
        supplierPlan.existing?.id ??
        supplierIdByKey.get(supplierPlan.key) ??
        supplierIdByKey.get(digitsOnly(supplierPlan.document)) ??
        supplierIdByKey.get(normalizeAtaText(supplierPlan.name));
      if (!supplierId) continue;
      const licitanteKey = buildLicitanteKey(supplierPlan.key);
      if (licitanteIdByKey.has(licitanteKey)) continue;

      const [existing] = await params.db
        .select({ id: licitantes.id })
        .from(licitantes)
        .where(
          and(
            eq(licitantes.licitacaoId, licitacaoId),
            eq(licitantes.fornecedorId, supplierId),
          ),
        )
        .limit(1);

      if (existing) {
        await params.db
          .update(licitantes)
          .set({
            ativo: true,
            atualizadoEm: new Date(),
          })
          .where(eq(licitantes.id, existing.id));
        licitanteIdByKey.set(licitanteKey, existing.id);
        continue;
      }

      const [created] = await params.db
        .insert(licitantes)
        .values({
          licitacaoId,
          fornecedorId: supplierId,
          dataCadastro: new Date(),
          statusHabilitacao: "PENDENTE",
          ativo: true,
          origemAtualizacao: "ATA_SESSAO",
          origemReferencia: buildAtaOriginRef(params.runId),
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        })
        .returning({ id: licitantes.id });
      licitanteIdByKey.set(licitanteKey, created.id);
    }
  }

  const proposalIdByKey = new Map<string, number>();
  for (const lotAnalysis of params.analysis.lots) {
    for (const proposal of lotAnalysis.proposalPlans) {
      const licitanteId = licitanteIdByKey.get(proposal.licitanteKey);
      const item = itemById.get(proposal.itemId);
      if (!licitanteId || !item) continue;
      const total = proposal.valorUnitario * (toNumber(item.quantidade) ?? 0);

      const [created] = await params.db
        .insert(propostasLicitacao)
        .values({
          licitanteId,
          itemId: proposal.itemId,
          valorUnitarioProposto: proposal.valorUnitario.toFixed(2),
          valorTotalProposto: total.toFixed(2),
          dataProposta: new Date(),
          classificacao: proposal.classificacao,
          situacao: proposal.situacao,
          justificativa: proposal.justificativa,
          origemAtualizacao: "ATA_SESSAO",
          origemReferencia: buildAtaOriginRef(params.runId),
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        })
        .returning({ id: propostasLicitacao.id });
      proposalIdByKey.set(
        `${proposal.licitanteKey}|${proposal.itemId}`,
        created.id,
      );
    }
  }

  for (const lotAnalysis of params.analysis.lots) {
    if (
      lotAnalysis.shouldSetWinnerHabilitado &&
      lotAnalysis.winnerLicitanteKey
    ) {
      const winnerLicitanteId = licitanteIdByKey.get(
        lotAnalysis.winnerLicitanteKey,
      );
      if (winnerLicitanteId) {
        await params.db
          .update(licitantes)
          .set({
            statusHabilitacao: "HABILITADO",
            atualizadoEm: new Date(),
          })
          .where(eq(licitantes.id, winnerLicitanteId));
      }
    }
  }

  for (const lotAnalysis of params.analysis.lots) {
    for (const lance of lotAnalysis.lancePlans) {
      const proposalId = proposalIdByKey.get(
        `${lance.licitanteKey}|${lance.itemId}`,
      );
      if (!proposalId) continue;
      await params.db.insert(lancesLicitacao).values({
        propostaId: proposalId,
        valorLance: lance.valorLance.toFixed(2),
        dataLance: lance.dataLance,
        usuarioId: params.userId,
        observacao: lance.observacao,
        origemAtualizacao: "ATA_SESSAO",
        origemReferencia: buildAtaOriginRef(params.runId),
      });
    }
  }

  for (const lotAnalysis of params.analysis.lots) {
    for (const recurso of lotAnalysis.recursoPlans) {
      const licitanteId = licitanteIdByKey.get(recurso.licitanteKey);
      if (!licitanteId) continue;
      await params.db.insert(recursosLicitacao).values({
        licitacaoId,
        licitanteId,
        dataInterposicao: recurso.dataInterposicao,
        dataJulgamento: recurso.dataJulgamento,
        resultado: recurso.resultado,
        descricao: recurso.descricao,
        decisao: recurso.decisao,
        criadoPor: params.userId,
        origemAtualizacao: "ATA_SESSAO",
        origemReferencia: buildAtaOriginRef(params.runId),
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });
    }
  }

  for (const lotAnalysis of params.analysis.lots) {
    if (!lotAnalysis.itemValuePlan) continue;
    const plan = lotAnalysis.itemValuePlan;
    const winnerLicitanteId = plan.fornecedorKey
      ? licitanteIdByKey.get(buildLicitanteKey(plan.fornecedorKey))
      : null;
    const [licitanteWithSupplier] =
      winnerLicitanteId !== null && winnerLicitanteId !== undefined
        ? await params.db
            .select({ fornecedorId: licitantes.fornecedorId })
            .from(licitantes)
            .where(eq(licitantes.id, winnerLicitanteId))
            .limit(1)
        : [];

    await params.db
      .insert(itensProcessoValores)
      .values({
        itemProcessoId: plan.itemId,
        valorLanceVencedorUnitario:
          plan.valorUnitario !== null ? plan.valorUnitario.toFixed(2) : null,
        valorLanceVencedorTotal:
          plan.valorTotal !== null ? plan.valorTotal.toFixed(2) : null,
        fornecedorVencedorId: licitanteWithSupplier?.fornecedorId ?? null,
        fornecedorVencedorNome: plan.fornecedorNome,
        fornecedorVencedorCnpj: plan.fornecedorDocumento,
        itemHomologado: false,
        itemDeserto: plan.itemDeserto,
        itemFracassado: plan.itemFracassado,
        motivoFracasso: plan.motivoFracasso,
        numeroLote: String(lotAnalysis.lot.numero_lote),
        origemAlteracao: buildAtaOriginRef(params.runId),
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      })
      .onConflictDoUpdate({
        target: itensProcessoValores.itemProcessoId,
        set: {
          valorLanceVencedorUnitario:
            plan.valorUnitario !== null ? plan.valorUnitario.toFixed(2) : null,
          valorLanceVencedorTotal:
            plan.valorTotal !== null ? plan.valorTotal.toFixed(2) : null,
          fornecedorVencedorId: licitanteWithSupplier?.fornecedorId ?? null,
          fornecedorVencedorNome: plan.fornecedorNome,
          fornecedorVencedorCnpj: plan.fornecedorDocumento,
          itemHomologado: false,
          itemDeserto: plan.itemDeserto,
          itemFracassado: plan.itemFracassado,
          motivoFracasso: plan.motivoFracasso,
          numeroLote: String(lotAnalysis.lot.numero_lote),
          origemAlteracao: buildAtaOriginRef(params.runId),
          atualizadoEm: new Date(),
        },
      });
  }

  const suggestedPhase = params.analysis.preview.phase.suggested;
  if (suggestedPhase) {
    await params.db
      .update(licitacoes)
      .set({
        statusLicitacao: suggestedPhase as any,
        atualizadoEm: new Date(),
      })
      .where(eq(licitacoes.id, licitacaoId));
    await syncWorkflowPhase(params.db, params.processId, suggestedPhase);
  }

  const processPatch: Record<string, unknown> = {
    atualizadoEm: new Date(),
  };
  if (
    params.payload.edital?.trim() &&
    !normalizeAtaIdentifier(
      (await loadProcessPreviewBase(params.db, params.processId)).numeroEdital,
    )
  ) {
    processPatch.numeroEdital = params.payload.edital.trim();
  }
  if (
    params.payload.processo_administrativo?.trim() &&
    !normalizeAtaIdentifier(
      (await loadProcessPreviewBase(params.db, params.processId))
        .numeroAdministrativo,
    )
  ) {
    processPatch.numeroAdministrativo =
      params.payload.processo_administrativo.trim();
  }
  await params.db
    .update(processos)
    .set(processPatch)
    .where(eq(processos.id, params.processId));

  await appendAtaMovement(
    params.db,
    params.processId,
    params.userId,
    "Ata de sessão sincronizada com a licitação",
    [
      params.payload.edital ? `Edital: ${params.payload.edital}` : null,
      params.payload.processo_administrativo
        ? `Processo administrativo: ${params.payload.processo_administrativo}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ") || null,
  );
}

export async function discoverAtaSessaoProcess(params: {
  sourcePath: string;
  originalFileName: string;
  providedProcessoId?: number | null;
  userId: number | null;
}): Promise<AtaSessaoDiscoveryResult> {
  const db = requireDb();
  const pipeline = await runAtaSessaoPipeline({
    sourcePath: params.sourcePath,
    arquivoOrigem: params.originalFileName,
  });
  const suggestedProcesses = buildAtaSessaoSuggestedProcesses({
    candidates: await loadProcessSuggestionCandidates(db),
    edital: pipeline.payload.edital ?? null,
    processoAdministrativo: pipeline.payload.processo_administrativo ?? null,
  });
  const artifacts = buildAtaPreviewArtifacts(
    pipeline.outputDir,
    pipeline.jsonPath,
    pipeline.payload,
  );
  const providedProcess = params.providedProcessoId
    ? await loadProcessPreviewBase(db, params.providedProcessoId)
    : null;

  const [run] = await db
    .insert(licitacaoAtaSyncRuns)
    .values({
      processoId: params.providedProcessoId ?? null,
      documentoId: null,
      status: "DISCOVERED",
      modoDescoberta: null,
      arquivoOriginal: params.originalFileName,
      arquivoFontePath: pipeline.sourceFile,
      parsedJsonPath: pipeline.jsonPath,
      outputDir: pipeline.outputDir,
      editalExtraido: pipeline.payload.edital ?? null,
      processoAdministrativoExtraido:
        pipeline.payload.processo_administrativo ?? null,
      summary: pipeline.payload.summary,
      criadoPor: params.userId,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    })
    .returning({ id: licitacaoAtaSyncRuns.id });

  return ataSessaoDiscoveryResultSchema.parse({
    discoveryId: run.id,
    generatedAt: pipeline.payload.generated_at,
    originalFileName: params.originalFileName,
    summary: {
      totalLotes: pipeline.payload.summary.total_lotes,
      emAndamento: pipeline.payload.summary.em_andamento,
      adjudicados: pipeline.payload.summary.adjudicados,
      faseRecursal: pipeline.payload.summary.fase_recursal,
      malsucedidos: pipeline.payload.summary.malsucedidos,
      warnings: pipeline.payload.summary.warnings,
      parsingErrors: pipeline.payload.summary.parsing_errors,
    },
    artifacts,
    metadata: {
      edital: pipeline.payload.edital ?? null,
      processoAdministrativo: pipeline.payload.processo_administrativo ?? null,
      providedProcessoId: params.providedProcessoId ?? null,
      providedProcessoNumeroSirel: providedProcess?.numeroSirel ?? null,
    },
    suggestedProcesses,
  });
}

export async function createAtaSessaoPreviewFromDiscovery(
  input: AtaSessaoCreatePreviewFromDiscoveryInput,
  userId: number | null,
) {
  const db = requireDb();
  const run = await loadRun(input.discoveryId);
  const payload = readParsedPayload(run.parsedJsonPath);
  const suggestedProcesses = buildAtaSessaoSuggestedProcesses({
    candidates: await loadProcessSuggestionCandidates(db),
    edital: payload.edital ?? null,
    processoAdministrativo: payload.processo_administrativo ?? null,
  });
  const discoveryMode = decideSelectionMode(
    suggestedProcesses,
    input.processoId,
    input.selectionMode ?? null,
  );
  const document = await createDocumentoFromAtaTempFile({
    db,
    processoId: input.processoId,
    draft: input.document,
    sourceAbsolutePath: run.arquivoFontePath ?? "",
    originalFileName: run.arquivoOriginal ?? "ata-sessao.pdf",
    criadoPor: userId,
  });
  const analysis = await buildAtaPreviewAnalysis({
    db,
    runId: run.id,
    processId: input.processoId,
    documentId: document.id,
    discoveryMode,
    payload,
    artifacts: buildAtaPreviewArtifacts(
      run.outputDir ?? reportsRoot,
      run.parsedJsonPath,
      payload,
    ),
  });
  const previewJsonPath = await writePreviewFile(
    run.id,
    run.outputDir ?? reportsRoot,
    analysis.preview,
  );

  await db
    .update(licitacaoAtaSyncRuns)
    .set({
      processoId: input.processoId,
      documentoId: document.id,
      status: "PREVIEW",
      modoDescoberta: discoveryMode,
      previewJsonPath,
      atualizadoEm: new Date(),
    })
    .where(eq(licitacaoAtaSyncRuns.id, run.id));

  return analysis.preview;
}

export async function createAtaSessaoPreviewFromDocumento(
  input: AtaSessaoPreviewProcessInput,
) {
  const db = requireDb();
  const pipeline = await runAtaSessaoPipeline({
    documentoId: input.documentoId,
  });
  const [run] = await db
    .insert(licitacaoAtaSyncRuns)
    .values({
      processoId: input.processoId,
      documentoId: input.documentoId,
      status: "PREVIEW",
      modoDescoberta: "PROCESSO_EXPLICITO",
      arquivoOriginal:
        pipeline.sourceFile.split(/[\\/]/).pop() ?? "ata-sessao.pdf",
      arquivoFontePath: pipeline.sourceFile,
      parsedJsonPath: pipeline.jsonPath,
      outputDir: pipeline.outputDir,
      editalExtraido: pipeline.payload.edital ?? null,
      processoAdministrativoExtraido:
        pipeline.payload.processo_administrativo ?? null,
      summary: pipeline.payload.summary,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    })
    .returning({ id: licitacaoAtaSyncRuns.id });

  const analysis = await buildAtaPreviewAnalysis({
    db,
    runId: run.id,
    processId: input.processoId,
    documentId: input.documentoId,
    discoveryMode: "PROCESSO_EXPLICITO",
    payload: pipeline.payload,
    artifacts: buildAtaPreviewArtifacts(
      pipeline.outputDir,
      pipeline.jsonPath,
      pipeline.payload,
    ),
  });
  const previewJsonPath = await writePreviewFile(
    run.id,
    pipeline.outputDir,
    analysis.preview,
  );

  await db
    .update(licitacaoAtaSyncRuns)
    .set({
      previewJsonPath,
      atualizadoEm: new Date(),
    })
    .where(eq(licitacaoAtaSyncRuns.id, run.id));

  return analysis.preview;
}

export async function applyAtaSessaoPreview(params: {
  runId: number;
  userId: number | null;
}): Promise<AtaSessaoApplyResult> {
  const db = requireDb();
  const run = await loadRun(params.runId);
  if (!run.processoId) {
    throw new Error(
      "A execução da ata ainda não está vinculada a um processo.",
    );
  }
  const payload = readParsedPayload(run.parsedJsonPath);
  const analysis = await buildAtaPreviewAnalysis({
    db,
    runId: run.id,
    processId: run.processoId,
    documentId: run.documentoId ?? null,
    discoveryMode: (run.modoDescoberta as AtaDiscoveryMode | null) ?? null,
    payload,
    artifacts: buildAtaPreviewArtifacts(
      run.outputDir ?? reportsRoot,
      run.parsedJsonPath,
      payload,
    ),
  });

  if (analysis.preview.blockingIssues.length) {
    throw new Error(
      "A prévia da ata possui conflitos bloqueantes e não pode ser aplicada.",
    );
  }

  await db.transaction(async (tx) => {
    await applyAtaAnalysis({
      db: tx as unknown as DbClient,
      runId: run.id,
      processId: run.processoId!,
      userId: params.userId,
      payload,
      analysis,
    });

    await (tx as unknown as DbClient)
      .update(licitacaoAtaSyncRuns)
      .set({
        status: "APPLIED",
        aplicadoPor: params.userId,
        aplicadoEm: new Date(),
        atualizadoEm: new Date(),
        summary: analysis.preview.counts,
      })
      .where(eq(licitacaoAtaSyncRuns.id, run.id));
  });

  return ataSessaoApplyResultSchema.parse({
    success: true,
    runId: run.id,
    processId: run.processoId,
    documentId: run.documentoId ?? null,
    appliedAt: new Date().toISOString(),
    phase: analysis.preview.phase,
    counts: analysis.preview.counts,
  });
}
