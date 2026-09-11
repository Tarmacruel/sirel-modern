import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { arquivosConfig } from "./config.js";
import {
  officeMetrics,
  officeOwnerFile,
  removeOfficeTemp,
  stopOfficeCollector,
} from "./office-temp.js";
import { OfficeError, runOfficeProcess } from "./office-process.js";

export function resolveLibreOffice() {
  return (
    [
      arquivosConfig.libreOfficePath,
      "C:\\Program Files\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ].find((candidate) => candidate && existsSync(candidate)) ?? null
  );
}

const active = new Map<
  string,
  { controller: AbortController; done: Promise<void> }
>();
const queue: Array<() => boolean> = [];
let stopping = false;
let slots = 0;

async function acquire(signal?: AbortSignal) {
  if (stopping || signal?.aborted) throw new OfficeError("CANCELLED");
  if (slots < arquivosConfig.officeConcurrency) {
    slots++;
    return;
  }
  officeMetrics.officeQueuedJobs++;
  await new Promise<void>((resolvePromise, reject) => {
    const cancel = () => {
      const index = queue.indexOf(ready);
      if (index >= 0) queue.splice(index, 1);
      signal?.removeEventListener("abort", cancel);
      officeMetrics.officeQueuedJobs--;
      reject(new OfficeError("CANCELLED"));
    };
    const ready = () => {
      signal?.removeEventListener("abort", cancel);
      officeMetrics.officeQueuedJobs--;
      if (stopping || signal?.aborted) {
        reject(new OfficeError("CANCELLED"));
        return false;
      }
      resolvePromise();
      return true;
    };
    queue.push(ready);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
function release() {
  let next;
  while ((next = queue.shift())) if (next()) return;
  slots--;
}

export async function withOfficeConversion<T>(
  options: {
    inputPath: string;
    format: string;
    timeoutMs: number;
    signal?: AbortSignal;
  },
  consume: (outputDir: string) => Promise<T>,
): Promise<T> {
  await acquire(options.signal);
  const job = randomUUID();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (stopping || options.signal?.aborted) cancel();
  let finish!: () => void;
  const done = new Promise<void>((r) => {
    finish = r;
  });
  active.set(job, { controller, done });
  officeMetrics.officeActiveJobs++;
  officeMetrics.officeConversionsTotal++;
  const started = Date.now();
  const directories: string[] = [];
  let safeToClean = true;
  try {
    if (controller.signal.aborted) throw new OfficeError("CANCELLED");
    const executable = resolveLibreOffice();
    if (!executable) throw new OfficeError("NOT_INSTALLED");
    // Register each allocation immediately, including failures creating the next one.
    const profileDir = await mkdtemp(join(tmpdir(), "sirel-office-profile-"));
    directories.push(profileDir);
    const marker = JSON.stringify({
      version: 1,
      job,
      pid: process.pid,
      released: false,
    });
    await writeFile(join(profileDir, officeOwnerFile), marker);
    const outputDir = await mkdtemp(join(tmpdir(), "sirel-office-text-"));
    directories.push(outputDir);
    await writeFile(join(outputDir, officeOwnerFile), marker);
    const internalTemp = join(outputDir, "internal-temp");
    await mkdir(internalTemp);
    console.info("[OFFICE] Conversão iniciada", {
      job,
      format: options.format,
      temp: basename(outputDir),
      profile: basename(profileDir),
    });
    await runOfficeProcess({
      executable,
      tempDir: internalTemp,
      timeoutMs: options.timeoutMs,
      signal: controller.signal,
      job,
      args: [
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        "--headless",
        "--norestore",
        "--nodefault",
        "--nolockcheck",
        "--convert-to",
        options.format,
        "--outdir",
        outputDir,
        options.inputPath,
      ],
    });
    if (controller.signal.aborted) throw new OfficeError("CANCELLED");
    const result = await consume(outputDir);
    console.info("[OFFICE] Conversão concluída", {
      job,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (error) {
    officeMetrics.officeConversionsFailed++;
    if (
      error instanceof OfficeError &&
      error.code === "TERMINATION_UNCONFIRMED"
    )
      safeToClean = false;
    console.warn("[OFFICE] Conversão falhou", {
      job,
      code: error instanceof OfficeError ? error.code : "PROCESSING",
      durationMs: Date.now() - started,
    });
    throw error;
  } finally {
    if (safeToClean) {
      let bytes = 0;
      let failures = 0;
      for (const directory of directories) {
        const result = await removeOfficeTemp(directory);
        bytes += result.bytes;
        if (!result.removed) {
          failures++;
          // Allow retry by GC even while this backend PID is still alive.
          await writeFile(
            join(directory, officeOwnerFile),
            JSON.stringify({
              version: 1,
              job,
              pid: process.pid,
              released: true,
            }),
          ).catch(() => undefined);
        }
      }
      console.info("[OFFICE] Cleanup concluído", { job, bytes, failures });
    } else
      console.error("[OFFICE] Cleanup adiado: encerramento não confirmado", {
        job,
      });
    options.signal?.removeEventListener("abort", cancel);
    active.delete(job);
    officeMetrics.officeActiveJobs--;
    release();
    finish();
  }
}

export async function stopOfficeJobs() {
  stopping = true;
  stopOfficeCollector();
  for (const { controller } of active.values()) controller.abort();
  await Promise.all([...active.values()].map(({ done }) => done));
}
