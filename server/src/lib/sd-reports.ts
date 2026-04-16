import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const reportsRoot = resolve(repoRoot, "storage/reports/sd");
const pythonScriptPath = resolve(repoRoot, "scripts/process_sd_reports.py");

export interface SdProcessResult {
  sourcePath: string;
  outputDir: string;
  generatedAt: string;
  summary: {
    totalItens: number;
    warnings: number;
    parsingErrors: number;
  };
  metadata: Record<string, unknown>;
  warnings: string[];
  parsingErrors: Array<Record<string, unknown>>;
  itens: Array<Record<string, unknown>>;
}

function ensureDirectory(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function slugifyFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function resolvePythonCommand() {
  if (process.platform === "win32") {
    return { command: "py", args: ["-3.12"] };
  }
  return { command: process.env.PYTHON_BIN || "python3", args: [] };
}

export async function parseSdReport(sourceFile: string): Promise<SdProcessResult> {
  ensureDirectory(reportsRoot);
  const outputDir = join(reportsRoot, `${Date.now()}-${slugifyFileName(basename(sourceFile, ".pdf")) || "sd"}`);
  ensureDirectory(outputDir);
  const jsonOutput = join(outputDir, "sd-parsed.json");

  const python = resolvePythonCommand();
  await execFileAsync(
    python.command,
    [...python.args, pythonScriptPath, "--input", sourceFile, "--json-out", jsonOutput],
    { cwd: repoRoot, windowsHide: true, maxBuffer: 1024 * 1024 * 10 },
  );

  const parsed = JSON.parse(readFileSync(jsonOutput, "utf-8")) as {
    source_path: string;
    generated_at: string;
    summary: { total_itens: number; warnings: number; parsing_errors: number };
    metadata: Record<string, unknown>;
    warnings: string[];
    parsing_errors: Array<Record<string, unknown>>;
    itens: Array<Record<string, unknown>>;
  };

  return {
    sourcePath: parsed.source_path,
    outputDir,
    generatedAt: parsed.generated_at,
    summary: {
      totalItens: parsed.summary.total_itens,
      warnings: parsed.summary.warnings,
      parsingErrors: parsed.summary.parsing_errors,
    },
    metadata: parsed.metadata,
    warnings: parsed.warnings,
    parsingErrors: parsed.parsing_errors,
    itens: parsed.itens,
  };
}
