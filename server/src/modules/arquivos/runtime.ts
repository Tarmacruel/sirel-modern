import { watch } from "node:fs";
import { existsSync } from "node:fs";

import { arquivosConfig } from "./config.js";
import { reindexArquivos } from "./indexer.js";
import { cleanupPreviewCache, resolveLibreOffice } from "./preview.js";

let watcherStarted = false;
let reindexTimer: NodeJS.Timeout | null = null;

function scheduleReindex() {
  if (reindexTimer) clearTimeout(reindexTimer);
  reindexTimer = setTimeout(() => {
    reindexArquivos().catch((error) => {
      console.error("[SIREL Arquivos] Reindexação por watcher falhou:", error);
    });
  }, 5000);
}

export async function startArquivosRuntime() {
  if (!arquivosConfig.enabled) {
    console.info("[SIREL Arquivos] Desabilitado por configuração.");
    return;
  }

  if (!arquivosConfig.rootResolved) {
    console.warn("[SIREL Arquivos] ARQUIVOS_ROOT não configurada; módulo ficará indisponível.");
    return;
  }

  if (!existsSync(arquivosConfig.rootResolved)) {
    console.warn(`[SIREL Arquivos] Raiz não encontrada: ${arquivosConfig.rootResolved}`);
    return;
  }

  console.info(`[SIREL Arquivos] Raiz: ${arquivosConfig.rootResolved}`);
  console.info(`[SIREL Arquivos] LibreOffice: ${resolveLibreOffice() ?? "não encontrado"}`);

  cleanupPreviewCache()
    .then(({ removed }) => {
      if (removed > 0) {
        console.info(`[SIREL Arquivos] Cache de preview limpo: ${removed} entrada(s).`);
      }
    })
    .catch((error) => {
      console.warn("[SIREL Arquivos] Falha não crítica ao limpar cache de preview:", error);
    });

  if (arquivosConfig.autoIndex) {
    reindexArquivos().catch((error) => {
      console.error("[SIREL Arquivos] Indexação inicial falhou:", error);
    });
  }

  if (arquivosConfig.watch && !watcherStarted) {
    try {
      const watcher = watch(
        arquivosConfig.rootResolved,
        { recursive: true },
        () => scheduleReindex(),
      );
      watcher.on("error", (error) => {
        console.warn(
          "[SIREL Arquivos] Watcher recursivo encerrou; use reindexação manual/automática.",
          error instanceof Error ? error.message : String(error),
        );
      });
      watcherStarted = true;
      console.info("[SIREL Arquivos] Watcher recursivo ativo.");
    } catch (error) {
      console.warn("[SIREL Arquivos] Watcher recursivo indisponível; use reindexação manual/automática.", error);
    }
  }
}
