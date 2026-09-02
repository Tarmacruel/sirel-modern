import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { arquivosConfig } from "./config.js";
import { kindFor } from "./mime.js";

const previewJobs = new Map<string, Promise<string>>();

function windowsCandidates() {
  return [
    arquivosConfig.libreOfficePath,
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  ].filter(Boolean);
}

export function resolveLibreOffice() {
  for (const candidate of windowsCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function runLibreOffice(inputPath: string, outDir: string) {
  const executable = resolveLibreOffice();
  if (!executable) throw new Error("LibreOffice não encontrado.");

  await mkdir(outDir, { recursive: true });
  const profileDir = join(outDir, ".lo-profile");
  await mkdir(profileDir, { recursive: true });
  const profileUrl = pathToFileURL(profileDir).href;

  try {
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(
        executable,
        [
          `-env:UserInstallation=${profileUrl}`,
          "--headless",
          "--norestore",
          "--nodefault",
          "--nolockcheck",
          "--convert-to",
          "pdf",
          "--outdir",
          outDir,
          inputPath,
        ],
        {
          windowsHide: true,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stderr = "";
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolvePromise();
      };

      const timeout = setTimeout(() => {
        child.kill();
        finish(new Error("Tempo limite excedido ao gerar preview."));
      }, 90_000);

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk).slice(0, 4000);
      });

      child.on("error", (error) => finish(error));
      child.on("close", (code) => {
        if (code === 0) finish();
        else finish(new Error(`LibreOffice retornou código ${code}. ${stderr}`.trim()));
      });
    });
  } finally {
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function officePreviewPath(inputPath: string, relativePath: string) {
  const info = await stat(inputPath);
  if (info.size > arquivosConfig.previewMaxBytes) {
    throw new Error("Arquivo excede o limite configurado para preview.");
  }

  const key = createHash("sha256")
    .update(`${relativePath}\0${info.size}\0${info.mtimeMs}`)
    .digest("hex");

  const cacheDir = resolve(arquivosConfig.previewCacheDir, key.slice(0, 2), key);
  const outputName = `${basename(inputPath, extname(inputPath))}.pdf`;
  const outputPath = join(cacheDir, outputName);

  if (existsSync(outputPath)) return outputPath;

  const existingJob = previewJobs.get(key);
  if (existingJob) return existingJob;

  const job = (async () => {
    await rm(cacheDir, { recursive: true, force: true });
    await mkdir(cacheDir, { recursive: true });
    await runLibreOffice(inputPath, cacheDir);

    if (!existsSync(outputPath)) {
      throw new Error("LibreOffice não gerou o PDF esperado.");
    }

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
      if (!entry.isDirectory()) continue;
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
