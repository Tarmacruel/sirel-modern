import cron, { type ScheduledTask } from "node-cron";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { chromium } from "playwright";

import { requireDb } from "../db/client.js";
import {
  importacaoBllExecucoes,
  importacaoBllProcessos,
  processos,
  users,
} from "../db/schema.js";
import { refreshDossieAutonomoProcesso } from "./dossie-autonomia.js";

type ActiveRun = {
  executionId: number;
  startedAt: string;
  dryRun: boolean;
  processIds: number[];
  processed: number;
  updatedItems: number;
  updatedContracts: number;
  message: string;
  cancelled: boolean;
};

const BLL_SYNC_ENABLED = ["1", "true", "on", "sim", "yes"].includes(
  String(process.env.BLL_SYNC_ENABLED ?? "").trim().toLowerCase(),
);
const BLL_BASE_URL = String(process.env.BLL_BASE_URL ?? "").trim();
const BLL_SYNC_CRON_DAILY =
  String(process.env.BLL_SYNC_CRON_DAILY ?? "").trim() || "0 4 * * *";
const BLL_SYNC_CRON_WEEKLY =
  String(process.env.BLL_SYNC_CRON_WEEKLY ?? "").trim() || "";
const BLL_SYNC_TIMEZONE =
  String(process.env.BLL_SYNC_TIMEZONE ?? "").trim() || "America/Sao_Paulo";
const BLL_RATE_LIMIT_MS = Math.max(
  250,
  Number(process.env.BLL_RATE_LIMIT_MS ?? 1200),
);

let activeRun: ActiveRun | null = null;
let currentAbortController: AbortController | null = null;
let dailyTask: ScheduledTask | null = null;
let weeklyTask: ScheduledTask | null = null;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureProcessPageHint(url: string, signal: AbortSignal) {
  if (!url) return null;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    if (signal.aborted) return null;
    const snapshot = await page.evaluate(() => ({
      title: document.title,
      heading:
        document.querySelector("h1, h2, .titulo, .title")?.textContent?.trim() ??
        null,
      lotesVisiveis: Array.from(document.querySelectorAll("tr, li, a, button"))
        .map((item) => item.textContent?.trim() ?? "")
        .filter((value) => /^\d+$/.test(value))
        .slice(0, 20),
    }));
    return snapshot;
  } finally {
    await browser.close();
  }
}

async function resolveTargetProcessIds(input?: {
  processoIds?: number[];
  processoId?: number;
  limit?: number;
}) {
  if (input?.processoId) return [input.processoId];
  if (input?.processoIds?.length) return input.processoIds;

  const db = requireDb();
  const rows = await db
    .select({ processoId: importacaoBllProcessos.processoInternoId })
    .from(importacaoBllProcessos)
    .where(isNotNull(importacaoBllProcessos.processoInternoId))
    .orderBy(desc(importacaoBllProcessos.ultimaAtualizacaoEm))
    .limit(input?.limit ?? 20);

  return rows
    .map((row) => row.processoId)
    .filter((value): value is number => Number.isFinite(value));
}

async function createExecution(userId: number | null, dryRun: boolean) {
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
      origem: "LICITACAO",
      modo: "PLAYWRIGHT_LOCAL",
      status: "PROCESSANDO",
      agendada: false,
      urlFonte: BLL_BASE_URL || null,
      mensagem: dryRun
        ? "Sincronizacao local BLL iniciada em modo simulacao."
        : "Sincronizacao local BLL iniciada.",
      criadoPor: normalizedUserId,
      detalhes: {
        dryRun,
        ambienteLocal: true,
        usuarioSolicitante: normalizedUserId,
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
      totalRegistros: Number(payload.totalProcessos ?? 0),
      totalItens: Number(payload.updatedItems ?? 0),
      finalizadoEm: new Date(),
    })
    .where(eq(importacaoBllExecucoes.id, executionId));
}

async function runLocalSync(params: {
  executionId: number;
  processIds: number[];
  dryRun: boolean;
}) {
  const db = requireDb();
  const signal = currentAbortController?.signal;
  const summary = {
    totalProcessos: params.processIds.length,
    updatedItems: 0,
    updatedContracts: 0,
    processed: 0,
    browserChecks: [] as unknown[],
  };

  try {
    for (const processoId of params.processIds) {
      if (signal?.aborted) {
        throw new Error("Sincronizacao local cancelada pelo usuario.");
      }

      const [record] = await db
        .select({
          processoId: processos.id,
          numeroSirel: processos.numeroSirel,
          linkExterno: importacaoBllProcessos.linkExterno,
        })
        .from(processos)
        .leftJoin(
          importacaoBllProcessos,
          and(
            eq(importacaoBllProcessos.processoInternoId, processos.id),
            eq(importacaoBllProcessos.origem, "LICITACAO"),
          ),
        )
        .where(eq(processos.id, processoId))
        .limit(1);

      if (!record) continue;

      if (activeRun) {
        activeRun.processed += 1;
        activeRun.message = `Processando ${record.numeroSirel} (${activeRun.processed}/${activeRun.processIds.length})`;
      }

      if (record.linkExterno && !params.dryRun) {
        try {
          const snapshot = await captureProcessPageHint(record.linkExterno, signal!);
          if (snapshot) {
            summary.browserChecks.push({
              processoId,
              snapshot,
            });
          }
        } catch (error) {
          summary.browserChecks.push({
            processoId,
            erro: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (!params.dryRun) {
        const refreshed = await refreshDossieAutonomoProcesso({
          processoId,
          includeLivePncp: true,
        });
        summary.updatedItems += refreshed.values.atualizados;
        summary.updatedContracts += refreshed.pncp.atualizados;
        if (activeRun) {
          activeRun.updatedItems = summary.updatedItems;
          activeRun.updatedContracts = summary.updatedContracts;
        }
      }

      summary.processed += 1;
      await wait(BLL_RATE_LIMIT_MS);
    }

    await finalizeExecution(
      params.executionId,
      "CONCLUIDA",
      summary,
      params.dryRun
        ? "Simulacao local BLL concluida."
        : "Sincronizacao local BLL concluida.",
    );
  } catch (error) {
    await finalizeExecution(
      params.executionId,
      "ERRO",
      {
        ...summary,
        erro: error instanceof Error ? error.message : String(error),
      },
      error instanceof Error ? error.message : "Falha na sincronizacao local BLL.",
    );
  } finally {
    activeRun = null;
    currentAbortController = null;
  }
}

export async function getBllLocalSyncStatus() {
  const db = requireDb();
  const [lastExecution] = await db
    .select()
    .from(importacaoBllExecucoes)
    .where(eq(importacaoBllExecucoes.modo, "PLAYWRIGHT_LOCAL"))
    .orderBy(desc(importacaoBllExecucoes.iniciadoEm), desc(importacaoBllExecucoes.id))
    .limit(1);

  return {
    enabled: BLL_SYNC_ENABLED,
    baseUrl: BLL_BASE_URL || null,
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
  dryRun?: boolean;
  userId?: number | null;
  limit?: number;
}) {
  if (activeRun) {
    throw new Error("Ja existe uma sincronizacao local BLL em andamento.");
  }

  const processIds = await resolveTargetProcessIds({
    processoId: params.processoId,
    processoIds: params.processoIds,
    limit: params.limit,
  });

  if (!processIds.length) {
    throw new Error("Nao ha processos vinculados para sincronizar localmente.");
  }

  const executionId = await createExecution(params.userId ?? null, Boolean(params.dryRun));
  currentAbortController = new AbortController();
  activeRun = {
    executionId,
    startedAt: new Date().toISOString(),
    dryRun: Boolean(params.dryRun),
    processIds,
    processed: 0,
    updatedItems: 0,
    updatedContracts: 0,
    message: "Fila local da BLL iniciada.",
    cancelled: false,
  };

  void runLocalSync({
    executionId,
    processIds,
    dryRun: Boolean(params.dryRun),
  });

  return {
    executionId,
    processIds,
    dryRun: Boolean(params.dryRun),
    message: `Sincronizacao local iniciada para ${processIds.length} processo(s).`,
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
  return {
    cancelled: true,
    executionId: activeRun.executionId,
    message: "Cancelamento solicitado para a sincronizacao local BLL.",
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
      await startBllLocalSync({ dryRun: false, limit: 20 });
    } catch {
      // Sem ruído extra no boot do servidor.
    }
  });

  if (BLL_SYNC_CRON_WEEKLY) {
    weeklyTask = startCronTask(BLL_SYNC_CRON_WEEKLY, async () => {
      if (activeRun) return;
      try {
        await startBllLocalSync({ dryRun: false, limit: 40 });
      } catch {
        // Sem ruído extra no boot do servidor.
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
