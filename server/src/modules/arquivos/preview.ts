import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import { arquivosConfig } from "./config.js";
import { kindFor } from "./mime.js";
import { withOfficeConversion } from "./office.js";

const previewJobs = new Map<string, Promise<string>>();

export { resolveLibreOffice } from "./office.js";

export async function officePreviewPath(
  inputPath: string,
  relativePath: string,
) {
  const info = await stat(inputPath);
  if (info.size > arquivosConfig.previewMaxBytes) {
    throw new Error("Arquivo excede o limite configurado para preview.");
  }

  const key = createHash("sha256")
    .update(`${relativePath}\0${info.size}\0${info.mtimeMs}`)
    .digest("hex");

  const cacheDir = resolve(
    arquivosConfig.previewCacheDir,
    key.slice(0, 2),
    key,
  );
  const outputName = `${basename(inputPath, extname(inputPath))}.pdf`;
  const outputPath = join(cacheDir, outputName);

  if (existsSync(outputPath)) return outputPath;

  const existingJob = previewJobs.get(key);
  if (existingJob) return existingJob;

  const job = (async () => {
    await mkdir(cacheDir, { recursive: true });
    await withOfficeConversion(
      {
        inputPath,
        format: "pdf",
        timeoutMs: arquivosConfig.officePreviewTimeoutMs,
      },
      async (outputDir) => {
        const converted = join(outputDir, outputName);
        const outputInfo = await stat(converted).catch(() => null);
        if (!outputInfo?.size)
          throw new Error("LibreOffice não gerou o PDF esperado.");
        // Publish only a complete PDF; another caller must never see a partial cache file.
        const pending = join(cacheDir, `${randomUUID()}.pending`);
        try {
          await copyFile(converted, pending);
          await rename(pending, outputPath);
        } finally {
          await rm(pending, { force: true, maxRetries: 3, retryDelay: 200 });
        }
      },
    );

    return outputPath;
  })().finally(() => {
    previewJobs.delete(key);
  });

  previewJobs.set(key, job);
  return job;
}

export function previewKind(name: string) {
  return kindFor(name);
}

export async function cleanupPreviewCache() {
  const cacheRoot = arquivosConfig.previewCacheDir;
  if (!existsSync(cacheRoot)) return { removed: 0 };

  const cutoff =
    Date.now() - arquivosConfig.previewCacheMaxAgeDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  const prefixes = await readdir(cacheRoot, { withFileTypes: true });
  for (const prefix of prefixes) {
    if (!prefix.isDirectory()) continue;
    const prefixPath = join(cacheRoot, prefix.name);
    const entries = await readdir(prefixPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || previewJobs.has(entry.name)) continue;
      const entryPath = join(prefixPath, entry.name);
      try {
        const info = await stat(entryPath);
        if (info.mtimeMs < cutoff) {
          await rm(entryPath, { recursive: true, force: true });
          removed++;
        }
      } catch {
        // Cache efêmero: ignorar entradas removidas concorrencialmente.
      }
    }
  }

  return { removed };
}
