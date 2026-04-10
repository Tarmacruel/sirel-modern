import cron, { type ScheduledTask } from "node-cron";
import type { ImportacaoBllSource } from "@sirel/shared/schemas/importacoes";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { chromium, type Browser, type Page } from "playwright";

import { requireDb } from "../db/client.js";
import {
  importacaoBllExecucoes,
  importacaoBllProcessos,
  licitacoes,
  processos,
  users,
} from "../db/schema.js";
import { refreshDossieAutonomoProcesso } from "./dossie-autonomia.js";
import { linkImportedProcessToInternal } from "./importacoes-conciliacao.js";
import { persistEnhancedNormalizedDataset } from "./importacoes-bll-v2-integration.js";
import { normalizeEnhancedDataset } from "./importacoes-bll-v2.js";

type ActiveRun = {
  executionId: number;
  startedAt: string;
  dryRun: boolean;
  mode: "PROCESSOS_VINCULADOS" | "CAPTURA_PUBLICA";
  sources: ImportacaoBllSource[];
  processIds: number[];
  totalTargets: number;
  processed: number;
  importedRecords: number;
  updatedItems: number;
  updatedContracts: number;
  refreshedLinkedProcesses: number;
  failed: number;
  pageLimit: number;
  message: string;
  cancelled: boolean;
};

type SearchRow = {
  origem: ImportacaoBllSource;
  detailUrl: string;
  detailParam: string | null;
  organizacao: string | null;
  numero: string | null;
  modalidade: string | null;
  situacao: string | null;
  publicacao: string | null;
  secundarioEm: string | null;
  cidade: string | null;
};

type LinkedTarget = {
  processoId: number;
  numeroSirel: string;
  origem: ImportacaoBllSource;
  detailUrl: string;
};

type CapturedBllRecord = {
  origem: ImportacaoBllSource;
  numeroReferencia: string | null;
  raw: Record<string, unknown>;
  snapshot: Record<string, unknown>;
};

type LocalSyncSourceSummary = {
  origem: ImportacaoBllSource;
  discovered: number;
  captured: number;
  imported: number;
  refreshedLinked: number;
  executionIds: number[];
  errors: string[];
};

type BllWindow = Window & {
  ExecSearch?: (offset: number, callback?: () => void) => void;
  GetBatchesInfo?: (processId: string) => void;
  GetBatchItemsInfo?: (
    batchId: string,
    element: Element | null,
    processId: string,
  ) => void;
  GetItemsInfo?: (directBuyId: string) => void;
  GetDirectBuyData?: (itemId: string, element: Element | null) => void;
};

const DEFAULT_BLL_BASE_URL = "https://bllcompras.com";
const DEFAULT_SYNC_SOURCES: ImportacaoBllSource[] = [
  "LICITACAO",
  "COMPRA_DIRETA",
];
const BLL_SYNC_ENABLED = ["1", "true", "on", "sim", "yes"].includes(
  String(process.env.BLL_SYNC_ENABLED ?? "").trim().toLowerCase(),
);
const BLL_BASE_URL =
  String(process.env.BLL_BASE_URL ?? "").trim() || DEFAULT_BLL_BASE_URL;
const BLL_SYNC_CRON_DAILY =
  String(process.env.BLL_SYNC_CRON_DAILY ?? "").trim() || "0 4 * * *";
const BLL_SYNC_CRON_WEEKLY =
  String(process.env.BLL_SYNC_CRON_WEEKLY ?? "").trim() || "";
const BLL_SYNC_TIMEZONE =
  String(process.env.BLL_SYNC_TIMEZONE ?? "").trim() || "America/Sao_Paulo";
const BLL_PROMOTOR_FILTER = "MUNICIPIO DE TEIXEIRA DE FREITAS";
const DEFAULT_PUBLIC_CAPTURE_LIMIT = Math.max(
  1_500,
  Number(process.env.BLL_SYNC_DEFAULT_LIMIT ?? 5_000),
);
const DEFAULT_PUBLIC_CAPTURE_PAGE_LIMIT = Math.max(
  20,
  Number(process.env.BLL_SYNC_DEFAULT_PAGE_LIMIT ?? 100),
);
const BLL_RATE_LIMIT_MS = Math.max(
  250,
  Number(process.env.BLL_RATE_LIMIT_MS ?? 1200),
);
const BLL_DETAIL_TIMEOUT_MS = Math.max(
  20_000,
  Number(process.env.BLL_DETAIL_TIMEOUT_MS ?? 60_000),
);

let activeRun: ActiveRun | null = null;
let currentAbortController: AbortController | null = null;
let activeBrowser: Browser | null = null;
let dailyTask: ScheduledTask | null = null;
let weeklyTask: ScheduledTask | null = null;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Sincronizacao local cancelada pelo usuario.");
  }
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeLookup(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function buildStableLocalKey(
  origem: ImportacaoBllSource,
  numeroEdital: string | null,
  numeroAdministrativo: string | null,
  anoReferencia: string | null,
  detailUrl: string,
) {
  const parts = [
    normalizeLookup(numeroEdital).replace(/\s+/g, ""),
    normalizeLookup(numeroAdministrativo).replace(/\s+/g, ""),
    normalizeLookup(anoReferencia).replace(/\s+/g, ""),
  ].filter(Boolean);

  if (parts.length) {
    return `${origem}:${parts.join(":")}`;
  }

  const detailParam = extractUrlParam(detailUrl);
  return `${origem}:${detailParam ?? detailUrl}`;
}

function buildListingKey(row: SearchRow) {
  const numero = normalizeLookup(row.numero);
  if (numero) {
    return `${row.origem}:${numero}`;
  }

  const detailParam = row.detailParam ? normalizeLookup(row.detailParam) : "";
  if (detailParam) {
    return `${row.origem}:${detailParam}`;
  }

  return `${row.origem}:${normalizeLookup(row.detailUrl)}`;
}

function extractUrlParam(url: string) {
  try {
    return new URL(url).searchParams.get("param1");
  } catch {
    return null;
  }
}

function resolveSearchUrl(origem: ImportacaoBllSource) {
  return origem === "LICITACAO"
    ? `${BLL_BASE_URL}/Process/ProcessSearchPublic?param1=0`
    : `${BLL_BASE_URL}/DirectBuy/DirectBuySearchPublic`;
}

function delayWithRateLimit() {
  return wait(BLL_RATE_LIMIT_MS);
}

function mapLoteTipo(value: string | null) {
  const normalized = normalizeLookup(value);
  if (!normalized) return null;
  if (normalized.includes("ITEM")) return "ITEM";
  if (normalized.includes("LOTE")) return "LOTE";
  if (normalized.includes("GLOBAL") || normalized.includes("KIT")) {
    return "GLOBAL";
  }
  return null;
}

async function resolveTargetProcessIds(input?: {
  processoIds?: number[];
  processoId?: number;
}) {
  if (input?.processoId) return [input.processoId];
  if (input?.processoIds?.length) return input.processoIds;
  return [];
}

async function resolveLinkedTargets(processIds: number[]) {
  if (!processIds.length) return [] as LinkedTarget[];

  const db = requireDb();
  const rows = await db
    .select({
      processoId: processos.id,
      numeroSirel: processos.numeroSirel,
      origem: importacaoBllProcessos.origem,
      detailUrl: importacaoBllProcessos.linkExterno,
      manualDetailUrl: licitacoes.linkBllPublico,
    })
    .from(processos)
    .leftJoin(
      importacaoBllProcessos,
      eq(importacaoBllProcessos.processoInternoId, processos.id),
    )
    .leftJoin(licitacoes, eq(licitacoes.processoId, processos.id))
    .where(inArray(processos.id, processIds));

  return rows
    .filter(
      (row): row is typeof row & {
        origem: ImportacaoBllSource | null;
        detailUrl: string;
        manualDetailUrl: string | null;
      } => Boolean(row.detailUrl || row.manualDetailUrl),
    )
    .map((row) => ({
      processoId: row.processoId,
      numeroSirel: row.numeroSirel,
      origem: row.origem ?? "LICITACAO",
      detailUrl: row.detailUrl ?? row.manualDetailUrl ?? "",
    }));
}

async function createExecution(
  userId: number | null,
  dryRun: boolean,
  sources: ImportacaoBllSource[],
  mode: ActiveRun["mode"],
) {
  const db = requireDb();
  const normalizedUserId =
    userId && Number.isFinite(userId)
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .then((rows) => rows[0]?.id ?? null)
      : null;
  const [execution] = await db
    .insert(importacaoBllExecucoes)
    .values({
      origem: sources[0] ?? "LICITACAO",
      modo: "PLAYWRIGHT_LOCAL",
      status: "PROCESSANDO",
      agendada: false,
      urlFonte: BLL_BASE_URL,
      mensagem: dryRun
        ? "Captura local BLL iniciada em modo simulacao."
        : "Captura local BLL iniciada.",
      criadoPor: normalizedUserId,
      detalhes: {
        dryRun,
        ambienteLocal: true,
        usuarioSolicitante: normalizedUserId,
        mode,
        sources,
      },
    })
    .returning({ id: importacaoBllExecucoes.id });
  return execution.id;
}

async function finalizeExecution(
  executionId: number,
  status: "CONCLUIDA" | "ERRO",
  payload: Record<string, unknown>,
  message: string,
) {
  const db = requireDb();
  await db
    .update(importacaoBllExecucoes)
    .set({
      status,
      mensagem: message,
      detalhes: payload,
      totalRegistros: Number(payload.importedRecords ?? 0),
      totalItens: Number(payload.updatedItems ?? 0),
      finalizadoEm: new Date(),
    })
    .where(eq(importacaoBllExecucoes.id, executionId));
}

async function openPage(browser: Browser, url: string, signal?: AbortSignal) {
  assertNotAborted(signal);
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: BLL_DETAIL_TIMEOUT_MS,
  });
  await page.waitForTimeout(1_200);
  assertNotAborted(signal);
  return page;
}

async function requestJsonHtml(
  page: Page,
  responseMatcher: (url: string) => boolean,
  trigger: () => Promise<void>,
  signal?: AbortSignal,
) {
  assertNotAborted(signal);
  const responsePromise = page.waitForResponse(
    (response) => responseMatcher(response.url()),
    { timeout: BLL_DETAIL_TIMEOUT_MS },
  );
  void responsePromise.catch(() => null);
  await trigger();
  const response = await responsePromise;
  const payload = (await response.json().catch(() => null)) as
    | { html?: string | null }
    | null;
  assertNotAborted(signal);
  return typeof payload?.html === "string" ? payload.html : "";
}

async function evaluateWithPayload<TResult, TPayload>(
  page: Page,
  payload: TPayload,
  body: string,
) {
  return page.evaluate(
    ({ body, payload }) => {
      const runner = new Function("payload", body);
      return runner(payload) as TResult;
    },
    { body, payload },
  );
}

async function parseSearchRows(
  page: Page,
  html: string,
  origem: ImportacaoBllSource,
) {
  const rows = await evaluateWithPayload<SearchRow[], {
    html: string;
    origem: ImportacaoBllSource;
    baseUrl: string;
  }>(
    page,
    { html, origem, baseUrl: BLL_BASE_URL },
    `
      const normalizeText = (value) => {
        const normalized = String(value ?? "")
          .replace(/\\u00a0/g, " ")
          .replace(/\\s+/g, " ")
          .trim();
        return normalized || null;
      };

      const host = document.createElement("tbody");
      host.innerHTML = payload.html;

      return Array.from(host.querySelectorAll("tr"))
        .map((row) => {
          const anchor = row.querySelector("a[href]");
          const href = anchor?.getAttribute("href");
          if (!href) return null;

          const cells = Array.from(row.querySelectorAll("td")).map((cell) =>
            normalizeText(cell.textContent),
          );
          const detailUrl = new URL(href, payload.baseUrl).href;

          if (payload.origem === "LICITACAO") {
            return {
              origem: payload.origem,
              detailUrl,
              detailParam: new URL(detailUrl).searchParams.get("param1"),
              organizacao: cells[1] ?? null,
              numero: cells[2] ?? null,
              modalidade: cells[3] ?? null,
              cidade: cells[4] ?? null,
              situacao: cells[5] ?? null,
              publicacao: cells[6] ?? null,
              secundarioEm: cells[7] ?? null,
            };
          }

          return {
            origem: payload.origem,
            detailUrl,
            detailParam: new URL(detailUrl).searchParams.get("param1"),
            organizacao: cells[1] ?? null,
            numero: cells[2] ?? null,
            modalidade: cells[4] ?? null,
            cidade: null,
            situacao: cells[3] ?? null,
            publicacao: cells[5] ?? null,
            secundarioEm: cells[6] ?? null,
          };
        })
        .filter((row) => row !== null);
    `,
  );
  return rows as SearchRow[];
}

async function requestSearchRowsPage(
  page: Page,
  origem: ImportacaoBllSource,
  offset: number,
  signal?: AbortSignal,
) {
  const endpoint =
    origem === "LICITACAO"
      ? "/Process/GetProcessByParams?"
      : "/DirectBuy/GetDirectBuyByParams?";

  const html = await requestJsonHtml(
    page,
    (url) => {
      if (!url.includes(endpoint)) return false;
      try {
        return new URL(url).searchParams.get("Offset") === String(offset);
      } catch {
        return false;
      }
    },
    async () => {
      await evaluateWithPayload(
        page,
        { origem, offset },
        `
          const bllWindow = window;
          const assign = (selector, value) => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
              return;
            }
            element.value = value;
            element.dispatchEvent(new Event("change", { bubbles: true }));
          };
          const clearSelect = (selector) => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLSelectElement)) {
              return;
            }
            const options = Array.from(element.options);
            const preferredIndex =
              options.findIndex((option) => option.value === "") > -1
                ? options.findIndex((option) => option.value === "")
                : options.findIndex((option) => option.value === "0") > -1
                  ? options.findIndex((option) => option.value === "0")
                  : options.findIndex((option) =>
                      /todos|todas|selecione|all/i.test(
                        option.textContent || "",
                      ),
                    );
            const preferred =
              (preferredIndex > -1 ? options[preferredIndex] : null) ??
              options[0] ??
              null;
            if (!preferred) {
              return;
            }
            options.forEach((option) => {
              option.selected = option === preferred;
            });
            element.selectedIndex = Math.max(0, options.indexOf(preferred));
            element.value = preferred.value;
            element.dispatchEvent(new Event("change", { bubbles: true }));
          };

          assign('input[name="Organization"]', "${BLL_PROMOTOR_FILTER}");
          assign('input[name="Number"]', "");
          assign('input[name="City"]', "");
          assign('input[name="DateStart"]', "");
          assign('input[name="DateEnd"]', "");
          assign('input[name="DateStartDispute"]', "");
          assign('input[name="DateEndDispute"]', "");
          assign('#HasButtonClick', "True");
          clearSelect('select[name="fkModality"]');
          clearSelect('select[name="fkStatus"]');
          clearSelect('select[name="fkState"]');
          clearSelect('select[name="fkDisputeKind"]');

          bllWindow.ExecSearch?.(payload.offset, () => {});
        `,
      );
    },
    signal,
  );

  return parseSearchRows(page, html, origem);
}

async function capturePublicListings(params: {
  browser: Browser;
  origem: ImportacaoBllSource;
  limit: number;
  pageLimit: number;
  signal?: AbortSignal;
}) {
  const page = await openPage(
    params.browser,
    resolveSearchUrl(params.origem),
    params.signal,
  );

  try {
    const collected: SearchRow[] = [];
    const seen = new Set<string>();

    for (let pageIndex = 0; pageIndex < params.pageLimit; pageIndex += 1) {
      assertNotAborted(params.signal);
      const rows = await requestSearchRowsPage(
        page,
        params.origem,
        pageIndex,
        params.signal,
      );

      if (!rows.length) break;

      for (const row of rows) {
        const listingKey = buildListingKey(row);
        if (seen.has(listingKey)) continue;
        seen.add(listingKey);
        collected.push(row);
        if (collected.length >= params.limit) {
          return collected;
        }
      }

      await delayWithRateLimit();
    }

    return collected;
  } finally {
    await page.close();
  }
}

async function recoverOrphanedLocalExecutions() {
  if (activeRun) return;

  const db = requireDb();
  await db
    .update(importacaoBllExecucoes)
    .set({
      status: "ERRO",
      mensagem:
        "Execucao local anterior interrompida antes da finalizacao. Marcada como encerrada na recuperacao automatica.",
      finalizadoEm: new Date(),
    })
    .where(
      and(
        eq(importacaoBllExecucoes.modo, "PLAYWRIGHT_LOCAL"),
        eq(importacaoBllExecucoes.status, "PROCESSANDO"),
        isNull(importacaoBllExecucoes.finalizadoEm),
      ),
    );
}

async function readMainProcessFields(page: Page) {
  return evaluateWithPayload<
    {
      title: string;
      processParam: string | null;
      organization: string | null;
      number: string | null;
      admNumber: string | null;
      modality: string | null;
      status: string | null;
      conductor: string | null;
      authority: string | null;
      contractKind: string | null;
      publication: string | null;
      proposalReceivingStart: string | null;
      proposalAnalysisStart: string | null;
      disputeStart: string | null;
      regulation: string | null;
      disputeKind: string | null;
      closingKind: string | null;
      yearReference: string | null;
      totalBaseValue: string | null;
      productOrService: string | null;
      observation: string | null;
      reportLinks: Array<{ label: string; href: string }>;
    },
    null
  >(
    page,
    null,
    `
      const getValue = (id) => {
        const element = document.getElementById(id);
        const value = element?.value?.trim?.() ?? "";
        return value || null;
      };

      const links = Array.from(document.querySelectorAll("a[href]"))
        .map((anchor) => ({
          label: anchor.textContent?.replace(/\\s+/g, " ").trim() || "",
          href: anchor.href,
        }))
        .filter(
          (link) =>
            link.href &&
            /pdf|relat|document|arquivo|report/i.test(
              link.label + " " + link.href,
            ),
        )
        .slice(0, 20);

      return {
        title: document.title.trim(),
        processParam: new URLSearchParams(window.location.search).get("param1"),
        organization: getValue("Organization"),
        number: getValue("Number"),
        admNumber: getValue("AdmNumber"),
        modality: getValue("Modality"),
        status: getValue("Status"),
        conductor: getValue("Conductor"),
        authority: getValue("Authority"),
        contractKind: getValue("ContractKind"),
        publication: getValue("PublicationTime"),
        proposalReceivingStart: getValue("ProposalReceivingStart"),
        proposalAnalysisStart: getValue("ProposalAnalysisStart"),
        disputeStart: getValue("DisputeStart"),
        regulation: getValue("Regulation"),
        disputeKind: getValue("DisputeKind"),
        closingKind: getValue("ClosingKind"),
        yearReference: getValue("YearReference"),
        totalBaseValue: getValue("TotalBaseValue"),
        productOrService: getValue("ProductOrService"),
        observation: getValue("Observation"),
        reportLinks: links,
      };
    `,
  );
}

async function parseLicitacaoBatchPayload(
  page: Page,
  html: string,
  fallbackNumber?: string | null,
) {
  return evaluateWithPayload<
    {
      batchRows: Array<{
        batchParam: string;
        processParam: string;
        numero: string | null;
      }>;
      current: {
        numero: string | null;
        fase: string | null;
        titulo: string | null;
        tipo: string | null;
        quantidade: string | null;
        intervaloMinimo: string | null;
        exclusivoME: string | null;
        localEntrega: string | null;
        garantia: string | null;
        valorReferencia: string | null;
        vencedor: string | null;
        melhorOferta: string | null;
        itens: Array<{
          numero: string | null;
          especificacao: string | null;
          unidade: string | null;
          quantidade: string | null;
          valorReferencia: string | null;
        }>;
      };
    },
    { html: string; fallbackNumber: string | null | undefined }
  >(
    page,
    { html, fallbackNumber },
    `
      const normalizeText = (value) => {
        const normalized = String(value ?? "")
          .replace(/\\u00a0/g, " ")
          .replace(/\\s+/g, " ")
          .trim();
        return normalized || null;
      };

      const normalizeKey = (value) =>
        normalizeText(value)
          ?.normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .replace(/[^a-z0-9]+/gi, " ")
          .trim()
          .toLowerCase() ?? "";

      const host = document.createElement("div");
      host.innerHTML = payload.html;

      const getLabeledValues = (root) => {
        const values = new Map();
        if (!root) return values;
        for (const label of Array.from(root.querySelectorAll("label"))) {
          const container = label.parentElement;
          const field = container?.querySelector("input, textarea");
          values.set(normalizeKey(label.textContent), normalizeText(field?.value));
        }
        return values;
      };

      const getValue = (values, labels) => {
        for (const label of labels) {
          const found = values.get(normalizeKey(label));
          if (found) return found;
        }
        return null;
      };

      const parseItems = (root) => {
        const tables = Array.from(root?.querySelectorAll("table") ?? []);
        const target = tables.find((table) =>
          Array.from(table.querySelectorAll("th")).some((header) =>
            normalizeKey(header.textContent).includes("especificacao"),
          ),
        );

        if (!target) return [];

        const headers = Array.from(target.querySelectorAll("th")).map((header) =>
          normalizeKey(header.textContent),
        );

        return Array.from(target.querySelectorAll("tr"))
          .slice(1)
          .map((row) => {
            const cells = Array.from(row.querySelectorAll("td")).map((cell) =>
              normalizeText(cell.textContent),
            );
            if (!cells.length) return null;
            const byHeader = new Map();
            headers.forEach((header, index) => {
              byHeader.set(header, cells[index] ?? null);
            });
            return {
              numero:
                byHeader.get("n") ??
                byHeader.get("n o") ??
                byHeader.get("nº") ??
                null,
              especificacao: byHeader.get("especificacao") ?? null,
              unidade: byHeader.get("unidade") ?? null,
              quantidade: byHeader.get("quant") ?? byHeader.get("quant.") ?? null,
              valorReferencia:
                byHeader.get("val ref") ??
                byHeader.get("val. ref.") ??
                byHeader.get("valor ref") ??
                null,
            };
          })
          .filter((row) => row !== null);
      };

      const detailRoot = host.querySelector("#ProcessBatchItems") ?? host;
      const values = getLabeledValues(detailRoot);

      const batchRows = Array.from(host.querySelectorAll("#batchListRows tr[onclick]"))
        .map((row) => {
          const onclick = row.getAttribute("onclick") ?? "";
          const match = onclick.match(
            /GetBatchItemsInfo\\('(.*?)',\\s*this,\\s*'(.*?)'\\)/,
          );
          if (!match) return null;
          return {
            batchParam: match[1],
            processParam: match[2],
            numero: normalizeText(row.textContent),
          };
        })
        .filter((row) => row !== null);

      return {
        batchRows,
        current: {
          numero: getValue(values, ["n", "nº"]) ?? payload.fallbackNumber ?? null,
          fase: getValue(values, ["fase"]),
          titulo: getValue(values, ["titulo"]),
          tipo: getValue(values, ["tipo de lote"]),
          quantidade: getValue(values, ["quantidade"]),
          intervaloMinimo: getValue(values, ["intervalo minimo"]),
          exclusivoME: getValue(values, ["exclusivo me epp", "exclusivo me/epp"]),
          localEntrega: getValue(values, ["local de entrega"]),
          garantia: getValue(values, ["garantia"]),
          valorReferencia: getValue(values, ["valor ref"]),
          vencedor: getValue(values, ["detentor da melhor oferta"]),
          melhorOferta: getValue(values, ["melhor oferta"]),
          itens: parseItems(detailRoot),
        },
      };
    `,
  );
}

async function captureLicitacaoRecord(
  browser: Browser,
  detailUrl: string,
  signal?: AbortSignal,
): Promise<CapturedBllRecord> {
  const page = await openPage(browser, detailUrl, signal);

  try {
    const main = await readMainProcessFields(page);
    const processParam = main.processParam ?? extractUrlParam(detailUrl);
    if (!processParam) {
      throw new Error("Nao foi possivel identificar o processo publico da BLL.");
    }

    const batchesHtml = await requestJsonHtml(
      page,
      (url) => url.includes("/Process/ProcessBatches?"),
      async () => {
        await page.evaluate((param) => {
          const bllWindow = window as BllWindow;
          bllWindow.GetBatchesInfo?.(param);
        }, processParam);
      },
      signal,
    );

    const firstBatch = await parseLicitacaoBatchPayload(page, batchesHtml);
    const lotes = new Map<string, Record<string, unknown>>();

    if (firstBatch.current.numero) {
      lotes.set(firstBatch.current.numero, {
        numero: firstBatch.current.numero,
        titulo: firstBatch.current.titulo,
        tipo: mapLoteTipo(firstBatch.current.tipo),
        fase: firstBatch.current.fase,
        intervalo_minimo: firstBatch.current.intervaloMinimo,
        exclusivo_me: firstBatch.current.exclusivoME,
        local_entrega: firstBatch.current.localEntrega,
        garantia: firstBatch.current.garantia,
        valor_referencia: firstBatch.current.valorReferencia,
        melhor_oferta: firstBatch.current.melhorOferta,
        vencedor: firstBatch.current.vencedor,
        itens: firstBatch.current.itens.map((item) => ({
          numero: item.numero,
          loteNumero: firstBatch.current.numero,
          especificacao: item.especificacao,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valorReferencia: item.valorReferencia,
        })),
      });
    }

    for (const batchRow of firstBatch.batchRows) {
      assertNotAborted(signal);
      if (!batchRow.numero || lotes.has(batchRow.numero)) continue;

      const batchHtml = await requestJsonHtml(
        page,
        (url) => url.includes("/Process/ProcessBatchItems?"),
        async () => {
          await page.evaluate(
            ({ batchParam, processParam }) => {
              const bllWindow = window as BllWindow;
              bllWindow.GetBatchItemsInfo?.(batchParam, null, processParam);
            },
            {
              batchParam: batchRow.batchParam,
              processParam: batchRow.processParam,
            },
          );
        },
        signal,
      );

      const batch = await parseLicitacaoBatchPayload(
        page,
        batchHtml,
        batchRow.numero,
      );
      if (!batch.current.numero) continue;

      lotes.set(batch.current.numero, {
        numero: batch.current.numero,
        titulo: batch.current.titulo,
        tipo: mapLoteTipo(batch.current.tipo),
        fase: batch.current.fase,
        intervalo_minimo: batch.current.intervaloMinimo,
        exclusivo_me: batch.current.exclusivoME,
        local_entrega: batch.current.localEntrega,
        garantia: batch.current.garantia,
        valor_referencia: batch.current.valorReferencia,
        melhor_oferta: batch.current.melhorOferta,
        vencedor: batch.current.vencedor,
        itens: batch.current.itens.map((item) => ({
          numero: item.numero,
          loteNumero: batch.current.numero,
          especificacao: item.especificacao,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valorReferencia: item.valorReferencia,
        })),
      });

      await delayWithRateLimit();
    }

    const chaveExterna = buildStableLocalKey(
      "LICITACAO",
      main.number,
      main.admNumber,
      main.yearReference,
      detailUrl,
    );

    return {
      origem: "LICITACAO",
      numeroReferencia: main.number,
      raw: {
        chaveExterna,
        idOrigem: processParam,
        numeroEdital: main.number,
        numero_adm: main.admNumber,
        anoReferencia: main.yearReference,
        modalidade: main.modality,
        situacao: main.status,
        tipoContrato: main.contractKind,
        condutorNome: main.conductor,
        autoridadeNome: main.authority,
        fornecedorNome: main.organization,
        publicacao: main.publication,
        inicioRecepcaoEm: main.proposalReceivingStart,
        fimRecepcaoEm: main.proposalAnalysisStart,
        inicioDisputaEm: main.disputeStart,
        legislacao: main.regulation,
        observacao: main.observation,
        objeto: main.productOrService,
        valorReferencia: main.totalBaseValue,
        link: detailUrl,
        lotes: Array.from(lotes.values()),
        dadosLocais: {
          disputa: main.disputeKind,
          encerramento: main.closingKind,
          linksDisponiveis: main.reportLinks,
          capturadoEm: new Date().toISOString(),
        },
      },
      snapshot: {
        title: main.title,
        number: main.number,
        totalLotes: lotes.size,
      },
    };
  } finally {
    await page.close();
  }
}

async function readDirectBuyFields(page: Page) {
  return evaluateWithPayload<
    {
      title: string;
      directBuyParam: string | null;
      organization: string | null;
      number: string | null;
      admNumber: string | null;
      modality: string | null;
      status: string | null;
      conductor: string | null;
      authority: string | null;
      yearReference: string | null;
      publication: string | null;
      conclusion: string | null;
      lawArticle: string | null;
      lawIdent: string | null;
      justificatory: string | null;
      legislation: string | null;
      productOrService: string | null;
      observation: string | null;
      reportLinks: Array<{ label: string; href: string }>;
    },
    null
  >(
    page,
    null,
    `
      const getValue = (id) => {
        const element = document.getElementById(id);
        const value = element?.value?.trim?.() ?? "";
        return value || null;
      };

      const links = Array.from(document.querySelectorAll("a[href]"))
        .map((anchor) => ({
          label: anchor.textContent?.replace(/\\s+/g, " ").trim() || "",
          href: anchor.href,
        }))
        .filter(
          (link) =>
            link.href &&
            /pdf|relat|document|arquivo|report/i.test(
              link.label + " " + link.href,
            ),
        )
        .slice(0, 20);

      return {
        title: document.title.trim(),
        directBuyParam: new URLSearchParams(window.location.search).get("param1"),
        organization: getValue("OrganizationName") ?? getValue("Organization"),
        number: getValue("Number"),
        admNumber: getValue("AdmNumber"),
        modality: getValue("ModalityName") ?? getValue("Modality"),
        status: getValue("StatusName") ?? getValue("Status"),
        conductor: getValue("ConductorName") ?? getValue("Conductor"),
        authority: getValue("AuthorityName") ?? getValue("Authority"),
        yearReference: getValue("YearReference"),
        publication: getValue("PublicationTime"),
        conclusion: getValue("ConclusionTime"),
        lawArticle: getValue("LawArticle"),
        lawIdent: getValue("LawIdent"),
        justificatory: getValue("Justificatory"),
        legislation: getValue("Legislation"),
        productOrService: getValue("ProductOrService"),
        observation: getValue("Observation"),
        reportLinks: links,
      };
    `,
  );
}

async function parseDirectBuyPayload(page: Page, html: string) {
  return evaluateWithPayload<
    {
      itemRows: Array<{ itemParam: string; numero: string | null }>;
      current: {
        numero: string | null;
        quantidade: string | null;
        unidade: string | null;
        descricao: string | null;
        fornecedor: string | null;
        marca: string | null;
        modelo: string | null;
        valor: string | null;
      };
    },
    { html: string }
  >(
    page,
    { html },
    `
      const normalizeText = (value) => {
        const normalized = String(value ?? "")
          .replace(/\\u00a0/g, " ")
          .replace(/\\s+/g, " ")
          .trim();
        return normalized || null;
      };

      const normalizeKey = (value) =>
        normalizeText(value)
          ?.normalize("NFD")
          .replace(/[\\u0300-\\u036f]/g, "")
          .replace(/[^a-z0-9]+/gi, " ")
          .trim()
          .toLowerCase() ?? "";

      const host = document.createElement("div");
      host.innerHTML = payload.html;

      const getLabeledValues = (root) => {
        const values = new Map();
        if (!root) return values;
        for (const label of Array.from(root.querySelectorAll("label"))) {
          const container = label.parentElement;
          const field = container?.querySelector("input, textarea");
          values.set(normalizeKey(label.textContent), normalizeText(field?.value));
        }
        return values;
      };

      const getValue = (values, labels) => {
        for (const label of labels) {
          const found = values.get(normalizeKey(label));
          if (found) return found;
        }
        return null;
      };

      const values = getLabeledValues(host.querySelector("#ProcessBatchItems"));
      const itemRows = Array.from(host.querySelectorAll("#batchListRows tr[onclick]"))
        .map((row) => {
          const onclick = row.getAttribute("onclick") ?? "";
          const match = onclick.match(/GetDirectBuyData\\('(.*?)',\\s*this\\)/);
          if (!match) return null;
          return {
            itemParam: match[1],
            numero: normalizeText(row.textContent),
          };
        })
        .filter((row) => row !== null);

      return {
        itemRows,
        current: {
          numero: getValue(values, ["n", "nº"]),
          quantidade: getValue(values, ["quantidade"]),
          unidade: getValue(values, ["unidade"]),
          descricao: getValue(values, ["descricao"]),
          fornecedor: getValue(values, ["razao social"]),
          marca: getValue(values, ["marca"]),
          modelo: getValue(values, ["modelo"]),
          valor: getValue(values, ["valor"]),
        },
      };
    `,
  );
}

async function captureDirectBuyRecord(
  browser: Browser,
  detailUrl: string,
  signal?: AbortSignal,
): Promise<CapturedBllRecord> {
  const page = await openPage(browser, detailUrl, signal);

  try {
    const main = await readDirectBuyFields(page);
    const directBuyParam = main.directBuyParam ?? extractUrlParam(detailUrl);
    if (!directBuyParam) {
      throw new Error("Nao foi possivel identificar a compra direta publica.");
    }

    const itemsHtml = await requestJsonHtml(
      page,
      (url) => url.includes("/DirectBuy/DirectBuyItemView?"),
      async () => {
        await page.evaluate((param) => {
          const bllWindow = window as BllWindow;
          bllWindow.GetItemsInfo?.(param);
        }, directBuyParam);
      },
      signal,
    );

    const firstItem = await parseDirectBuyPayload(page, itemsHtml);
    const itens = new Map<string, Record<string, unknown>>();

    if (firstItem.current.numero) {
      itens.set(firstItem.current.numero, {
        numero: firstItem.current.numero,
        descricao: firstItem.current.descricao,
        unidade: firstItem.current.unidade,
        quantidade: firstItem.current.quantidade,
        fornecedor: firstItem.current.fornecedor,
        marca: firstItem.current.marca,
        modelo: firstItem.current.modelo,
        valorUnitario: firstItem.current.valor,
      });
    }

    for (const itemRow of firstItem.itemRows) {
      assertNotAborted(signal);
      if (!itemRow.numero || itens.has(itemRow.numero)) continue;

      const itemHtml = await requestJsonHtml(
        page,
        (url) => url.includes("/DirectBuy/DirectBuyItemData?"),
        async () => {
          await page.evaluate((itemParam) => {
            const bllWindow = window as BllWindow;
            bllWindow.GetDirectBuyData?.(itemParam, null);
          }, itemRow.itemParam);
        },
        signal,
      );

      const item = await parseDirectBuyPayload(page, itemHtml);
      if (!item.current.numero) continue;

      itens.set(item.current.numero, {
        numero: item.current.numero,
        descricao: item.current.descricao,
        unidade: item.current.unidade,
        quantidade: item.current.quantidade,
        fornecedor: item.current.fornecedor,
        marca: item.current.marca,
        modelo: item.current.modelo,
        valorUnitario: item.current.valor,
      });

      await delayWithRateLimit();
    }

    const chaveExterna = buildStableLocalKey(
      "COMPRA_DIRETA",
      null,
      main.admNumber ?? main.number,
      main.yearReference,
      detailUrl,
    );

    return {
      origem: "COMPRA_DIRETA",
      numeroReferencia: main.admNumber ?? main.number,
      raw: {
        chaveExterna,
        idOrigem: directBuyParam,
        numeroAdministrativo: main.admNumber ?? main.number,
        anoReferencia: main.yearReference,
        modalidade: main.modality,
        situacao: main.status,
        condutorNome: main.conductor,
        autoridadeNome: main.authority,
        fornecedorNome: main.organization,
        artigo: main.lawArticle,
        inciso: main.lawIdent,
        justificativa: main.justificatory,
        legislacao: main.legislation,
        publicacao: main.publication,
        conclusao: main.conclusion,
        objeto: main.productOrService,
        observacao: main.observation,
        link: detailUrl,
        itens: Array.from(itens.values()),
        dadosLocais: {
          linksDisponiveis: main.reportLinks,
          capturadoEm: new Date().toISOString(),
        },
      },
      snapshot: {
        title: main.title,
        number: main.number,
        totalItens: itens.size,
      },
    };
  } finally {
    await page.close();
  }
}

async function captureDetailRecord(
  browser: Browser,
  origem: ImportacaoBllSource,
  detailUrl: string,
  signal?: AbortSignal,
) {
  return origem === "LICITACAO"
    ? captureLicitacaoRecord(browser, detailUrl, signal)
    : captureDirectBuyRecord(browser, detailUrl, signal);
}

async function alignDatasetWithExistingImports(
  origem: ImportacaoBllSource,
  dataset: ReturnType<typeof normalizeEnhancedDataset>,
) {
  const db = requireDb();
  const existing = await db
    .select({
      chaveExterna: importacaoBllProcessos.chaveExterna,
      idOrigem: importacaoBllProcessos.idOrigem,
      numeroEdital: importacaoBllProcessos.numeroEdital,
      numeroAdministrativo: importacaoBllProcessos.numeroAdministrativo,
      linkExterno: importacaoBllProcessos.linkExterno,
    })
    .from(importacaoBllProcessos)
    .where(eq(importacaoBllProcessos.origem, origem));

  const byLink = new Map<string, (typeof existing)[number]>();
  const byEditalAdm = new Map<string, (typeof existing)[number]>();
  const byEdital = new Map<string, (typeof existing)[number]>();
  const byAdm = new Map<string, (typeof existing)[number]>();

  for (const row of existing) {
    const linkKey = normalizeLookup(row.linkExterno);
    const editalKey = normalizeLookup(row.numeroEdital);
    const admKey = normalizeLookup(row.numeroAdministrativo);
    if (linkKey) byLink.set(linkKey, row);
    if (editalKey && admKey) byEditalAdm.set(`${editalKey}|${admKey}`, row);
    if (editalKey) byEdital.set(editalKey, row);
    if (admKey) byAdm.set(admKey, row);
  }

  for (const record of dataset.registros) {
    const match =
      byLink.get(normalizeLookup(record.linkExterno)) ??
      byEditalAdm.get(
        `${normalizeLookup(record.numeroEdital)}|${normalizeLookup(
          record.numeroAdministrativo,
        )}`,
      ) ??
      byEdital.get(normalizeLookup(record.numeroEdital)) ??
      byAdm.get(normalizeLookup(record.numeroAdministrativo));

    if (!match) continue;
    record.chaveExterna = match.chaveExterna;
    record.idOrigem = match.idOrigem ?? record.idOrigem;
  }
}

async function refreshLinkedProcessDossiers(
  origem: ImportacaoBllSource,
  dataset: ReturnType<typeof normalizeEnhancedDataset>,
) {
  const keys = dataset.registros.map((record) => record.chaveExterna).filter(Boolean);
  if (!keys.length) {
    return {
      processIds: [] as number[],
      updatedItems: 0,
      updatedContracts: 0,
    };
  }

  const db = requireDb();
  const processIds = new Set<number>();

  for (const chunk of chunkArray(keys, 100)) {
    const rows = await db
      .select({ processoId: importacaoBllProcessos.processoInternoId })
      .from(importacaoBllProcessos)
      .where(
        and(
          eq(importacaoBllProcessos.origem, origem),
          isNotNull(importacaoBllProcessos.processoInternoId),
          inArray(importacaoBllProcessos.chaveExterna, chunk),
        ),
      );

    for (const row of rows) {
      if (row.processoId) processIds.add(row.processoId);
    }
  }

  let updatedItems = 0;
  let updatedContracts = 0;
  for (const processoId of processIds) {
    const refreshed = await refreshDossieAutonomoProcesso({
      processoId,
      includeLivePncp: true,
    });
    updatedItems += refreshed.values.atualizados;
    updatedContracts += refreshed.pncp.atualizados;
  }

  return {
    processIds: Array.from(processIds),
    updatedItems,
    updatedContracts,
  };
}

async function linkCapturedRecordsToProcesses(params: {
  origem: ImportacaoBllSource;
  linkedTargets: LinkedTarget[];
  userId?: number | null;
}) {
  if (!params.linkedTargets.length) {
    return;
  }

  const db = requireDb();
  const links = Array.from(
    new Set(
      params.linkedTargets
        .map((target) => target.detailUrl)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (!links.length) {
    return;
  }

  const rows = await db
    .select({
      id: importacaoBllProcessos.id,
      processoInternoId: importacaoBllProcessos.processoInternoId,
      linkExterno: importacaoBllProcessos.linkExterno,
    })
    .from(importacaoBllProcessos)
    .where(
      and(
        eq(importacaoBllProcessos.origem, params.origem),
        inArray(importacaoBllProcessos.linkExterno, links),
      ),
    );

  const byLink = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = normalizeLookup(row.linkExterno);
    if (key) {
      byLink.set(key, row);
    }
  }

  for (const target of params.linkedTargets) {
    const imported = byLink.get(normalizeLookup(target.detailUrl));
    if (!imported || imported.processoInternoId === target.processoId) {
      continue;
    }
    await linkImportedProcessToInternal(
      imported.id,
      target.processoId,
      params.userId ?? null,
      "MANUAL",
    ).catch(() => null);
  }
}

async function persistCapturedSource(params: {
  origem: ImportacaoBllSource;
  rawRecords: Record<string, unknown>[];
  dryRun: boolean;
  userId?: number | null;
  linkedTargets?: LinkedTarget[];
}) {
  const dataset = normalizeEnhancedDataset(
    {
      registros: params.rawRecords,
      atualizado_em: new Date().toISOString(),
      detalhes: {
        capturaLocal: true,
      },
    },
    params.origem,
  );

  await alignDatasetWithExistingImports(params.origem, dataset);

  if (params.dryRun) {
    return {
      executionIds: [] as number[],
      imported: dataset.registros.length,
      refreshedLinked: 0,
      updatedItems: 0,
      updatedContracts: 0,
    };
  }

  const persisted = await persistEnhancedNormalizedDataset({
    origem: params.origem,
    modo: "PLAYWRIGHT_LOCAL",
    criadoPor: params.userId ?? null,
    agendada: false,
    referenciaRotina: null,
    urlFonte: resolveSearchUrl(params.origem),
    dataset,
  });

  await linkCapturedRecordsToProcesses({
    origem: params.origem,
    linkedTargets: params.linkedTargets ?? [],
    userId: params.userId,
  });

  const refreshed = await refreshLinkedProcessDossiers(params.origem, dataset);
  return {
    executionIds: [persisted.executionId],
    imported: persisted.totalRegistros,
    refreshedLinked: refreshed.processIds.length,
    updatedItems: refreshed.updatedItems,
    updatedContracts: refreshed.updatedContracts,
  };
}

function setActiveMessage(message: string) {
  if (activeRun) activeRun.message = message;
}

async function runLocalSync(params: {
  executionId: number;
  processIds: number[];
  dryRun: boolean;
  userId?: number | null;
  limit: number;
  pageLimit: number;
  sources: ImportacaoBllSource[];
  mode: ActiveRun["mode"];
}) {
  const signal = currentAbortController?.signal;
  const summary = {
    mode: params.mode,
    sources: params.sources,
    pageLimit: params.pageLimit,
    totalTargets: 0,
    processed: 0,
    importedRecords: 0,
    updatedItems: 0,
    updatedContracts: 0,
    refreshedLinkedProcesses: 0,
    failed: 0,
    browserChecks: [] as unknown[],
    sourceSummaries: [] as LocalSyncSourceSummary[],
  };

  try {
    activeBrowser = await chromium.launch({ headless: true });

    const capturedBySource = new Map<ImportacaoBllSource, Record<string, unknown>[]>();
    const linkedTargetsBySource = new Map<ImportacaoBllSource, LinkedTarget[]>();
    const sourceSummaries = new Map<ImportacaoBllSource, LocalSyncSourceSummary>();

    const touchSourceSummary = (origem: ImportacaoBllSource) => {
      const current =
        sourceSummaries.get(origem) ??
        ({
          origem,
          discovered: 0,
          captured: 0,
          imported: 0,
          refreshedLinked: 0,
          executionIds: [],
          errors: [],
        } satisfies LocalSyncSourceSummary);
      sourceSummaries.set(origem, current);
      return current;
    };

    const appendCaptured = (record: CapturedBllRecord) => {
      const bucket = capturedBySource.get(record.origem) ?? [];
      bucket.push(record.raw);
      capturedBySource.set(record.origem, bucket);
      const sourceSummary = touchSourceSummary(record.origem);
      sourceSummary.captured += 1;
      summary.processed += 1;
      if (activeRun) {
        activeRun.processed = summary.processed;
      }
      if (summary.browserChecks.length < 25) {
        summary.browserChecks.push(record.snapshot);
      }
    };
    const appendLinkedTarget = (target: LinkedTarget) => {
      const current = linkedTargetsBySource.get(target.origem) ?? [];
      current.push(target);
      linkedTargetsBySource.set(target.origem, current);
    };

    if (params.mode === "PROCESSOS_VINCULADOS") {
      const targets = await resolveLinkedTargets(params.processIds);
      if (!targets.length) {
        throw new Error(
          "Nao ha processos vinculados com link BLL disponivel para captura local.",
        );
      }

      summary.totalTargets = targets.length;
      if (activeRun) activeRun.totalTargets = targets.length;

      for (const target of targets) {
        assertNotAborted(signal);
        setActiveMessage(
          `Capturando ${target.numeroSirel} (${summary.processed + 1}/${targets.length})`,
        );

        const sourceSummary = touchSourceSummary(target.origem);
        sourceSummary.discovered += 1;

        try {
          const captured = await captureDetailRecord(
            activeBrowser,
            target.origem,
            target.detailUrl,
            signal,
          );
          appendCaptured(captured);
          appendLinkedTarget(target);
        } catch (error) {
          summary.failed += 1;
          if (activeRun) activeRun.failed = summary.failed;
          sourceSummary.errors.push(
            `${target.numeroSirel}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        await delayWithRateLimit();
      }
    } else {
      for (const origem of params.sources) {
        assertNotAborted(signal);
        setActiveMessage(`Mapeando listagem publica da ${origem}.`);

        const listings = await capturePublicListings({
          browser: activeBrowser,
          origem,
          limit: params.limit,
          pageLimit: params.pageLimit,
          signal,
        });
        const sourceSummary = touchSourceSummary(origem);
        sourceSummary.discovered = listings.length;
        summary.totalTargets += listings.length;
        if (activeRun) activeRun.totalTargets = summary.totalTargets;

        for (const [index, listing] of listings.entries()) {
          assertNotAborted(signal);
          setActiveMessage(
            `Capturando ${origem} ${listing.numero ?? ""} (${index + 1}/${listings.length})`,
          );

          try {
            const captured = await captureDetailRecord(
              activeBrowser,
              origem,
              listing.detailUrl,
              signal,
            );
            appendCaptured(captured);
          } catch (error) {
            summary.failed += 1;
            if (activeRun) activeRun.failed = summary.failed;
            sourceSummary.errors.push(
              `${listing.numero ?? listing.detailUrl}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }

          await delayWithRateLimit();
        }
      }
    }

    for (const origem of params.sources) {
      const rawRecords = capturedBySource.get(origem) ?? [];
      const sourceSummary = touchSourceSummary(origem);
      if (!rawRecords.length) continue;

      setActiveMessage(`Persistindo captura local da ${origem}.`);
      const persisted = await persistCapturedSource({
        origem,
        rawRecords,
        dryRun: params.dryRun,
        userId: params.userId,
        linkedTargets: linkedTargetsBySource.get(origem) ?? [],
      });

      sourceSummary.imported = persisted.imported;
      sourceSummary.refreshedLinked = persisted.refreshedLinked;
      sourceSummary.executionIds.push(...persisted.executionIds);
      summary.importedRecords += persisted.imported;
      summary.updatedItems += persisted.updatedItems;
      summary.updatedContracts += persisted.updatedContracts;
      summary.refreshedLinkedProcesses += persisted.refreshedLinked;

      if (activeRun) {
        activeRun.importedRecords = summary.importedRecords;
        activeRun.updatedItems = summary.updatedItems;
        activeRun.updatedContracts = summary.updatedContracts;
        activeRun.refreshedLinkedProcesses = summary.refreshedLinkedProcesses;
      }
    }

    summary.sourceSummaries = Array.from(sourceSummaries.values());

    await finalizeExecution(
      params.executionId,
      "CONCLUIDA",
      summary,
      params.dryRun
        ? "Captura local BLL concluida em simulacao."
        : "Captura local BLL concluida com persistencia completa.",
    );
  } catch (error) {
    await finalizeExecution(
      params.executionId,
      "ERRO",
      {
        ...summary,
        erro: error instanceof Error ? error.message : String(error),
      },
      error instanceof Error ? error.message : "Falha na captura local da BLL.",
    );
  } finally {
    await activeBrowser?.close().catch(() => null);
    activeBrowser = null;
    activeRun = null;
    currentAbortController = null;
  }
}

export async function getBllLocalSyncStatus() {
  await recoverOrphanedLocalExecutions();
  const db = requireDb();
  const [lastExecution] = await db
    .select()
    .from(importacaoBllExecucoes)
    .where(eq(importacaoBllExecucoes.modo, "PLAYWRIGHT_LOCAL"))
    .orderBy(desc(importacaoBllExecucoes.iniciadoEm), desc(importacaoBllExecucoes.id))
    .limit(1);

  return {
    enabled: BLL_SYNC_ENABLED,
    baseUrl: BLL_BASE_URL,
    rateLimitMs: BLL_RATE_LIMIT_MS,
    cronDaily: BLL_SYNC_CRON_DAILY,
    cronWeekly: BLL_SYNC_CRON_WEEKLY || null,
    timezone: BLL_SYNC_TIMEZONE,
    activeRun,
    lastExecution: lastExecution ?? null,
  };
}

export async function startBllLocalSync(params: {
  processoId?: number;
  processoIds?: number[];
  source?: ImportacaoBllSource;
  dryRun?: boolean;
  userId?: number | null;
  limit?: number;
  pageLimit?: number;
}) {
  await recoverOrphanedLocalExecutions();

  if (activeRun) {
    throw new Error("Ja existe uma sincronizacao local BLL em andamento.");
  }

  const processIds = await resolveTargetProcessIds({
    processoId: params.processoId,
    processoIds: params.processoIds,
  });
  const hasExplicitProcesses = processIds.length > 0;
  const sources = params.source ? [params.source] : DEFAULT_SYNC_SOURCES;
  const mode: ActiveRun["mode"] = hasExplicitProcesses
    ? "PROCESSOS_VINCULADOS"
    : "CAPTURA_PUBLICA";

  if (!hasExplicitProcesses && !sources.length) {
    throw new Error("Nao ha origem publica configurada para a captura local.");
  }

  const executionId = await createExecution(
    params.userId ?? null,
    Boolean(params.dryRun),
    sources,
    mode,
  );
  currentAbortController = new AbortController();
  activeRun = {
    executionId,
    startedAt: new Date().toISOString(),
    dryRun: Boolean(params.dryRun),
    mode,
    sources,
    processIds,
    totalTargets: hasExplicitProcesses ? processIds.length : 0,
    processed: 0,
    importedRecords: 0,
    updatedItems: 0,
    updatedContracts: 0,
    refreshedLinkedProcesses: 0,
    failed: 0,
    pageLimit: Math.max(1, params.pageLimit ?? DEFAULT_PUBLIC_CAPTURE_PAGE_LIMIT),
    message: hasExplicitProcesses
      ? "Fila de processos vinculados iniciada."
      : "Captura publica local iniciada.",
    cancelled: false,
  };

  runLocalSync({
    executionId,
    processIds,
    dryRun: Boolean(params.dryRun),
    userId: params.userId ?? null,
    limit: Math.max(1, params.limit ?? DEFAULT_PUBLIC_CAPTURE_LIMIT),
    pageLimit: Math.max(1, params.pageLimit ?? DEFAULT_PUBLIC_CAPTURE_PAGE_LIMIT),
    sources,
    mode,
  }).catch(() => null);

  return {
    executionId,
    processIds,
    dryRun: Boolean(params.dryRun),
    mode,
    sources,
    message: hasExplicitProcesses
      ? `Captura local iniciada para ${processIds.length} processo(s) vinculado(s).`
      : `Captura publica local iniciada para ${sources.join(", ")}.`,
  };
}

export async function cancelBllLocalSync() {
  if (!activeRun || !currentAbortController) {
    return {
      cancelled: false,
      message: "Nao existe sincronizacao local BLL em andamento.",
    };
  }

  activeRun.cancelled = true;
  activeRun.message = "Cancelamento solicitado.";
  currentAbortController.abort();
  await activeBrowser?.close().catch(() => null);
  return {
    cancelled: true,
    executionId: activeRun.executionId,
    message: "Cancelamento solicitado para a captura local BLL.",
  };
}

function startCronTask(expression: string, callback: () => Promise<void>) {
  if (!expression) return null;
  return cron.schedule(
    expression,
    () => {
      void callback();
    },
    { timezone: BLL_SYNC_TIMEZONE },
  );
}

export function startBllLocalScheduler() {
  if (!BLL_SYNC_ENABLED || dailyTask || weeklyTask) {
    return;
  }

  dailyTask = startCronTask(BLL_SYNC_CRON_DAILY, async () => {
    if (activeRun) return;
    try {
      await startBllLocalSync({
        dryRun: false,
        limit: DEFAULT_PUBLIC_CAPTURE_LIMIT,
        pageLimit: DEFAULT_PUBLIC_CAPTURE_PAGE_LIMIT,
      });
    } catch {
      // Evita ruido extra durante o boot.
    }
  });

  if (BLL_SYNC_CRON_WEEKLY) {
    weeklyTask = startCronTask(BLL_SYNC_CRON_WEEKLY, async () => {
      if (activeRun) return;
      try {
        await startBllLocalSync({
          dryRun: false,
          limit: DEFAULT_PUBLIC_CAPTURE_LIMIT,
          pageLimit: DEFAULT_PUBLIC_CAPTURE_PAGE_LIMIT,
        });
      } catch {
        // Evita ruido extra durante o boot.
      }
    });
  }
}

export function stopBllLocalScheduler() {
  dailyTask?.stop();
  weeklyTask?.stop();
  dailyTask = null;
  weeklyTask = null;
}
