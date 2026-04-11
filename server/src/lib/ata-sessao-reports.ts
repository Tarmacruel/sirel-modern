import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { ataSessaoProcessResultSchema, type AtaSessaoProcessInput, type AtaSessaoProcessResult } from "@sirel/shared/schemas/ata-sessao";
import { eq } from "drizzle-orm";

import { requireDb } from "../db/client.js";
import { documentos } from "../db/schema.js";
import { getSystemParamValue } from "./system-params.js";

const execFileAsync = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const reportsRoot = resolve(repoRoot, "storage/reports/atas-sessao");
const uploadsRoot = resolve(repoRoot, "storage/uploads");
const pythonScriptPath = resolve(repoRoot, "scripts/process_ata_sessao_reports.py");
const defaultLogoPath = resolve(repoRoot, "client/public/logo-prefeitura.png");

type ParsedPayload = {
  source_path: string;
  generated_at: string;
  summary: {
    total_lotes: number;
    adjudicados: number;
    malsucedidos: number;
    warnings: number;
    parsing_errors: number;
  };
  artifacts?: Record<string, string>;
};

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

function resolveDocumentoPath(arquivoChave: string) {
  const normalizedKey = arquivoChave.replace(/\\/g, "/").replace(/^\/+/, "");
  const candidates = [join(uploadsRoot, normalizedKey), normalizedKey];
  return candidates.find((candidate) => existsSync(candidate)) ?? join(uploadsRoot, normalizedKey);
}

async function resolveSourcePath(input: AtaSessaoProcessInput) {
  if (input.sourcePath) {
    return resolve(repoRoot, input.sourcePath);
  }
  const db = requireDb();
  const [documento] = await db
    .select({ arquivoChave: documentos.arquivoChave })
    .from(documentos)
    .where(eq(documentos.id, Number(input.documentoId)))
    .limit(1);
  if (!documento?.arquivoChave) {
    throw new Error("Documento informado não possui arquivo vinculado.");
  }
  return resolveDocumentoPath(documento.arquivoChave);
}

function resolvePythonCommand() {
  if (process.platform === "win32") {
    return { command: "py", args: ["-3.12"] };
  }
  return { command: process.env.PYTHON_BIN || "python3", args: [] };
}

async function resolveBrandingData() {
  try {
    const db = requireDb();
    const nome = String((await getSystemParamValue(db, "INSTITUCIONAL.NOME_ORGAO")) ?? "PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS").trim();
    const cnpj = String((await getSystemParamValue(db, "INSTITUCIONAL.CNPJ_ORGAO")) ?? "13.650.403/0001-28").trim();
    const enderecoValue = ((await getSystemParamValue(db, "INSTITUCIONAL.ENDERECO")) as Record<string, unknown> | undefined) ?? {};
    const endereco = [
      String(enderecoValue.logradouro ?? "").trim(),
      String(enderecoValue.numero ?? "").trim(),
      String(enderecoValue.bairro ?? "").trim(),
      String(enderecoValue.cep ?? "").trim(),
      String(enderecoValue.municipio ?? "").trim(),
      String(enderecoValue.uf ?? "").trim(),
    ].filter(Boolean).join(", ");

    return {
      lines: [
        "MUNICÍPIO DE TEIXEIRA DE FREITAS",
        nome,
        `CNPJ: ${cnpj}`,
        endereco || "AV MARECHAL CASTELO BRANCO, 145, CENTRO, TEIXEIRA DE FREITAS-BA",
      ],
      footer: String((await getSystemParamValue(db, "SISTEMA.RODAPE")) ?? "SIREL - Sistema Integrado de Relatórios e Licitações").trim(),
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

async function runPythonPipeline(input: AtaSessaoProcessInput, sourceFile: string, outputDir: string) {
  ensureDirectory(outputDir);
  const jsonOutput = join(outputDir, "ata-sessao-relatorio.json");
  const brandingJsonPath = join(outputDir, "ata-sessao-branding.json");
  writeFileSync(brandingJsonPath, JSON.stringify(await resolveBrandingData(), null, 2), "utf-8");

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

  await execFileAsync(python.command, args, { cwd: repoRoot, windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
  return jsonOutput;
}

export async function generateAtaSessaoReports(input: AtaSessaoProcessInput): Promise<AtaSessaoProcessResult> {
  ensureDirectory(reportsRoot);
  const sourceFile = await resolveSourcePath(input);
  if (!existsSync(sourceFile)) {
    throw new Error(`Arquivo PDF não encontrado: ${sourceFile}`);
  }

  const outputDir = input.outputDir
    ? resolve(repoRoot, input.outputDir)
    : join(reportsRoot, `${Date.now()}-${slugifyFileName(basename(sourceFile, ".pdf"))}`);
  ensureDirectory(outputDir);

  const jsonPath = await runPythonPipeline(input, sourceFile, outputDir);
  const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as ParsedPayload;

  const artifacts = [
    { label: "JSON consolidado", path: jsonPath, type: "json" as const },
    { label: "Relatório Adjudicados (PDF)", path: String(parsed.artifacts?.adjudicados_pdf ?? join(outputDir, "Relatorio_Adjudicados.pdf")), type: "pdf" as const },
    { label: "Relatório Adjudicados (XLSX)", path: String(parsed.artifacts?.adjudicados_xlsx ?? join(outputDir, "Relatorio_Adjudicados.xlsx")), type: "xlsx" as const },
    { label: "Relatório Malsucedidos (PDF)", path: String(parsed.artifacts?.malsucedidos_pdf ?? join(outputDir, "Relatorio_MalSucedidos.pdf")), type: "pdf" as const },
    { label: "Relatório Malsucedidos (XLSX)", path: String(parsed.artifacts?.malsucedidos_xlsx ?? join(outputDir, "Relatorio_MalSucedidos.xlsx")), type: "xlsx" as const },
    { label: "Warnings", path: join(outputDir, "warnings.log"), type: "log" as const },
    { label: "Erros de parsing", path: join(outputDir, "erros_parsing.log"), type: "log" as const },
    { label: "Erros de renderização", path: join(outputDir, "erros_renderizacao.log"), type: "log" as const },
  ];

  return ataSessaoProcessResultSchema.parse({
    sourceFile,
    outputDir,
    generatedAt: parsed.generated_at,
    summary: {
      totalLotes: parsed.summary.total_lotes,
      adjudicados: parsed.summary.adjudicados,
      malsucedidos: parsed.summary.malsucedidos,
      warnings: parsed.summary.warnings,
      parsingErrors: parsed.summary.parsing_errors,
    },
    artifacts,
  });
}
