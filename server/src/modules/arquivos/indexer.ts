import { readdir, realpath, stat } from "node:fs/promises";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { join, resolve } from "node:path";

import { sql } from "drizzle-orm";

import { requireDb } from "../../db/client.js";
import { arquivosConfig, assertArquivosConfigured } from "./config.js";
import { canIndexContent, extractIndexedContent } from "./content.js";
import { extensionOf, kindFor } from "./mime.js";
import { isBlockedExtension } from "./security.js";

type ExistingIndexItem = {
  size: number | null;
  modifiedAt: Date | null;
  contentIndexedAt: Date | null;
};

type IndexedItem = {
  relativePath: string;
  parentPath: string;
  name: string;
  extension: string;
  kind: string;
  size: number | null;
  modifiedAt: Date | null;
  absolutePath?: string;
  needsContentIndex?: boolean;
  contentText?: string | null;
  contentIndexedAt?: Date | null;
};

let running: Promise<{ files: number; folders: number; skipped: number; durationMs: number }> | null = null;

function normalizedCompare(value: string) {
  const v = resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? v.toLowerCase() : v;
}

function inside(root: string, target: string) {
  const r = normalizedCompare(root);
  const t = normalizedCompare(target);
  return t === r || t.startsWith(`${r}${process.platform === "win32" ? "\\" : "/"}`) || t.startsWith(`${r}/`);
}

async function walk(
  rootReal: string,
  absDir: string,
  relDir: string,
  out: IndexedItem[],
  counters: { skipped: number; scanned: number },
  visitedDirectories: Set<string>,
  existingIndex: Map<string, ExistingIndexItem>,
) {
  const directoryKey = normalizedCompare(absDir);
  if (visitedDirectories.has(directoryKey)) {
    counters.skipped++;
    return;
  }
  visitedDirectories.add(directoryKey);

  const entries = await readdir(absDir, { withFileTypes: true });

  for (const entry of entries) {
    counters.scanned++;
    if (counters.scanned % 500 === 0) {
      console.info(
        `[SIREL Arquivos] Indexação em andamento: ${counters.scanned} entradas examinadas, ${out.length} indexadas.`,
      );
      await yieldToEventLoop();
    }

    if (entry.isSymbolicLink()) {
      counters.skipped++;
      continue;
    }

    if (arquivosConfig.ignoredNames.has(entry.name.toLowerCase())) {
      counters.skipped++;
      continue;
    }

    const abs = join(absDir, entry.name);
    const rel = [relDir, entry.name].filter(Boolean).join("/");

    try {
      const real = await realpath(abs);
      if (!inside(rootReal, real)) {
        counters.skipped++;
        continue;
      }

      const info = await stat(real);
      if (info.isDirectory()) {
        out.push({
          relativePath: rel,
          parentPath: relDir,
          name: entry.name,
          extension: "",
          kind: "folder",
          size: null,
          modifiedAt: info.mtime,
        });
        await walk(rootReal, real, rel, out, counters, visitedDirectories, existingIndex);
      } else {
        if (isBlockedExtension(entry.name)) {
          counters.skipped++;
          continue;
        }
        const extension = extensionOf(entry.name);
        const kind = kindFor(entry.name);
        const existing = existingIndex.get(rel);
        const unchanged = Boolean(
          existing &&
            existing.size === info.size &&
            existing.modifiedAt?.getTime() === info.mtimeMs &&
            existing.contentIndexedAt,
        );
        out.push({
          relativePath: rel,
          parentPath: relDir,
          name: entry.name,
          // O acervo pode conter nomes legados com extensões arbitrariamente
          // longas; preserve o nome/caminho e limite apenas a coluna indexada.
          extension: extension.slice(0, 32),
          kind,
          size: info.size,
          modifiedAt: info.mtime,
          absolutePath: real,
          needsContentIndex: !unchanged,
        });
      }
    } catch {
      counters.skipped++;
    }
  }
}

function rowsFromResult(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

async function loadExistingIndex() {
  const db = requireDb();
  const result = await db.execute(sql`
    SELECT relative_path, size, modified_at, content_indexed_at
    FROM arquivo_index
    WHERE kind <> 'folder'
  `);
  const existing = new Map<string, ExistingIndexItem>();
  for (const row of rowsFromResult(result)) {
    existing.set(String(row.relative_path), {
      size: row.size == null ? null : Number(row.size),
      modifiedAt: row.modified_at ? new Date(row.modified_at) : null,
      contentIndexedAt: row.content_indexed_at ? new Date(row.content_indexed_at) : null,
    });
  }
  return existing;
}

async function indexChangedContent(items: IndexedItem[]) {
  let contentIndexed = 0;
  let contentSkipped = 0;
  const candidates = items.filter(
    (item) => item.kind !== "folder" && item.needsContentIndex,
  );

  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < candidates.length) {
      const index = nextIndex++;
      const item = candidates[index];
      if (!item?.absolutePath) continue;

      item.contentText = canIndexContent(item.kind)
        ? await extractIndexedContent(item.absolutePath, item.kind)
        : null;
      item.contentIndexedAt = new Date();
      if (item.contentText) contentIndexed++;
      else contentSkipped++;

      if ((index + 1) % 50 === 0) {
        console.info(
          `[SIREL Arquivos] Conteudo: ${index + 1}/${candidates.length} documentos processados no lote.`,
        );
        await yieldToEventLoop();
      }
    }
  };

  const workerCount = Math.min(arquivosConfig.contentIndexConcurrency, candidates.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { contentIndexed, contentSkipped };
}

async function upsertBatch(items: IndexedItem[]) {
  if (!items.length) return;
  const db = requireDb();
  const values = items.map(
    (item) => sql`(
      ${item.relativePath},
      ${item.parentPath},
      ${item.name},
      ${item.extension},
      ${item.kind},
      ${item.size},
      ${item.modifiedAt},
      ${item.contentText ?? null},
      ${item.contentIndexedAt ?? null},
      now()
    )`,
  );

  await db.execute(sql`
    INSERT INTO arquivo_index
      (relative_path, parent_path, name, extension, kind, size, modified_at, content_text, content_indexed_at, indexed_at)
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (relative_path)
    DO UPDATE SET
      parent_path = EXCLUDED.parent_path,
      name = EXCLUDED.name,
      extension = EXCLUDED.extension,
      kind = EXCLUDED.kind,
      size = EXCLUDED.size,
      modified_at = EXCLUDED.modified_at,
      content_text = CASE
        WHEN EXCLUDED.content_indexed_at IS NULL THEN arquivo_index.content_text
        ELSE EXCLUDED.content_text
      END,
      content_indexed_at = COALESCE(EXCLUDED.content_indexed_at, arquivo_index.content_indexed_at),
      indexed_at = now()
  `);
}

async function performIndex() {
  assertArquivosConfigured();
  const started = Date.now();
  const db = requireDb();
  const rootReal = await realpath(arquivosConfig.rootResolved);
  const existingIndex = await loadExistingIndex();
  const items: IndexedItem[] = [];
  const counters = { skipped: 0, scanned: 0 };

  console.info("[SIREL Arquivos] Indexação iniciada.");
  await walk(rootReal, rootReal, "", items, counters, new Set<string>(), existingIndex);
  const stamp = new Date();
  const batchSize = 300;
  const contentResult = { contentIndexed: 0, contentSkipped: 0 };
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchContentResult = await indexChangedContent(batch);
    contentResult.contentIndexed += batchContentResult.contentIndexed;
    contentResult.contentSkipped += batchContentResult.contentSkipped;
    await upsertBatch(batch);
    if ((i + batch.length) % 3000 === 0 || i + batch.length === items.length) {
      console.info(
        `[SIREL Arquivos] ${i + batch.length}/${items.length} entradas persistidas.`,
      );
    }
  }

  // Remove registros que não foram vistos recentemente nesta rodada.
  await db.execute(sql`
    DELETE FROM arquivo_index
    WHERE indexed_at < ${stamp}
  `);

  await db.execute(sql`
    DELETE FROM arquivo_favoritos f
    WHERE NOT EXISTS (
      SELECT 1 FROM arquivo_index i WHERE i.relative_path = f.relative_path
    )
  `);

  const files = items.filter((item) => item.kind !== "folder").length;
  const folders = items.length - files;
  const result = {
    files,
    folders,
    scanned: counters.scanned,
    skipped: counters.skipped,
    ...contentResult,
    durationMs: Date.now() - started,
  };
  console.info("[SIREL Arquivos] Indexação concluída", result);
  return result;
}

export function reindexArquivos() {
  if (!running) {
    running = performIndex().finally(() => {
      running = null;
    });
  }
  return running;
}
