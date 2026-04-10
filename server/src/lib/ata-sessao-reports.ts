import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import PDFDocument from "pdfkit";
import { ataSessaoProcessResultSchema, type AtaSessaoProcessInput, type AtaSessaoProcessResult } from "@sirel/shared/schemas/ata-sessao";
import { desc, eq } from "drizzle-orm";

import { requireDb } from "../db/client.js";
import { documentos } from "../db/schema.js";
import { getSystemParamValue } from "./system-params.js";

const execFileAsync = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const reportsRoot = resolve(repoRoot, "storage/reports/atas-sessao");
const uploadsRoot = resolve(repoRoot, "storage/uploads");
const pythonScriptPath = resolve(repoRoot, "scripts/process_ata_sessao_reports.py");

type ParsedParticipant = {
  section: string;
  ranking: number | null;
  participante_numero: string | null;
  razao_social: string;
  documento: string | null;
  oferta_inicial: number | null;
  oferta_final: number | null;
  diferenca_percentual: number | null;
  me_epp: boolean | null;
};

type ParsedLot = {
  numero_lote: number;
  status: string;
  titulo: string;
  item: {
    descricao: string | null;
    quantidade: number | null;
    valor_unitario: number | null;
    valor_total: number | null;
    valor_unitario_estimado: number | null;
    marca: string | null;
    modelo: string | null;
  };
  participantes: ParsedParticipant[];
  vencedor: string | null;
  cnpj_vencedor: string | null;
  melhor_lance: number | null;
  motivo_falha: string | null;
};

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
  lotes: ParsedLot[];
  warnings: string[];
  parsing_errors: Array<Record<string, string>>;
  artifacts?: Record<string, string>;
};

type PdfDoc = InstanceType<typeof PDFDocument>;

function isAdjudicavelStatus(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toUpperCase();
  return normalized === "ADJUDICADO" || normalized === "HABILITAÇÃO" || normalized === "HABILITACAO" || normalized === "HABILITA";
}

function isMalsucedidoStatus(status: string | null | undefined) {
  return ["FRACASSADO", "DESERTO", "CANCELADO"].includes(String(status ?? "").trim().toUpperCase());
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

function formatCurrencyBRL(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsed)
    : "-";
}

function formatNumberBR(value: number | null | undefined, maximumFractionDigits = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits }).format(parsed)
    : "-";
}

function ensureDirectory(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function resolveDocumentoPath(arquivoChave: string) {
  const normalizedKey = arquivoChave.replace(/\\/g, "/").replace(/^\/+/, "");
  const candidates = [
    join(uploadsRoot, normalizedKey),
    normalizedKey,
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? join(uploadsRoot, normalizedKey);
}

async function resolveSourcePath(input: AtaSessaoProcessInput) {
  if (input.sourcePath) {
    return resolve(repoRoot, input.sourcePath);
  }
  const db = requireDb();
  const [documento] = await db
    .select({ arquivoChave: documentos.arquivoChave, titulo: documentos.titulo })
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

async function runPythonParser(sourceFile: string, outputDir: string) {
  ensureDirectory(outputDir);
  const jsonOutput = join(outputDir, "ata-sessao-relatorio.json");
  const python = resolvePythonCommand();
  await execFileAsync(python.command, [
    ...python.args,
    pythonScriptPath,
    "--input",
    sourceFile,
    "--output-dir",
    outputDir,
    "--json-out",
    jsonOutput,
  ], { cwd: repoRoot, windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
  return jsonOutput;
}

function createPdfBuffer(render: (doc: PdfDoc) => void) {
  return new Promise<Buffer>((resolvePromise, rejectPromise) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, compress: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolvePromise(Buffer.concat(chunks)));
    doc.on("error", rejectPromise);
    render(doc);
    doc.end();
  });
}

async function resolveBrandingLines() {
  try {
    const db = requireDb();
    const nome = String(
      (await getSystemParamValue(db, "INSTITUCIONAL.NOME_ORGAO")) ?? "PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS",
    ).trim();
    const cnpj = String(
      (await getSystemParamValue(db, "INSTITUCIONAL.CNPJ_ORGAO")) ?? "13.650.403/0001-28",
    ).trim();
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
    };
  }
}

function ensureSpace(doc: PdfDoc, height = 24) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function drawHeader(doc: PdfDoc, lines: string[], title: string, subtitle: string) {
  doc.fillColor("#2440A7").font("Helvetica-Bold").fontSize(10).text(lines[0], { characterSpacing: 1.1 });
  doc.moveDown(0.25);
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(lines[1]);
  doc.fillColor("#475569").font("Helvetica").fontSize(9).text(lines[2]);
  doc.text(lines[3], { width: 500 });
  doc.moveDown(0.6);
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(20).text(title);
  doc.fillColor("#475569").font("Helvetica").fontSize(10).text(subtitle);
  doc.moveDown(0.8);
  const lineY = doc.y;
  doc.moveTo(doc.page.margins.left, lineY).lineTo(doc.page.width - doc.page.margins.right, lineY).strokeColor("#2440A7").lineWidth(1.8).stroke();
  doc.moveDown(0.9);
}

function drawSummary(doc: PdfDoc, items: Array<{ label: string; value: string }>) {
  const columnWidth = 180;
  const rowHeight = 48;
  const gap = 12;
  let x = doc.page.margins.left;
  let y = doc.y;
  for (const item of items) {
    if (x + columnWidth > doc.page.width - doc.page.margins.right) {
      x = doc.page.margins.left;
      y += rowHeight + gap;
    }
    ensureSpace(doc, rowHeight + gap);
    doc.roundedRect(x, y, columnWidth, rowHeight, 10).fillAndStroke("#f8fafc", "#cbd5e1");
    doc.fillColor("#475569").font("Helvetica-Bold").fontSize(8).text(item.label.toUpperCase(), x + 10, y + 8, { width: columnWidth - 20 });
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(item.value, x + 10, y + 22, { width: columnWidth - 20 });
    x += columnWidth + gap;
  }
  doc.y = y + rowHeight + 18;
}

function drawSectionTitle(doc: PdfDoc, title: string) {
  ensureSpace(doc, 24);
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11).text(title.toUpperCase(), { characterSpacing: 1.1 });
  doc.moveDown(0.4);
}

function drawTable(doc: PdfDoc, headers: string[], rows: string[][], widths: number[]) {
  const drawRow = (cells: string[], header = false) => {
    const font = header ? "Helvetica-Bold" : "Helvetica";
    const fontSize = header ? 8 : 8.6;
    const heights = cells.map((cell, index) => doc.font(font).fontSize(fontSize).heightOfString(cell, { width: widths[index] - 8, lineGap: 1 }));
    const rowHeight = Math.max(...heights, 14) + 8;
    ensureSpace(doc, rowHeight + 4);
    let x = doc.page.margins.left;
    const y = doc.y;
    cells.forEach((cell, index) => {
      doc.rect(x, y, widths[index], rowHeight).fillAndStroke(header ? "#e2e8f0" : "#ffffff", "#cbd5e1");
      doc.fillColor("#0f172a").font(font).fontSize(fontSize).text(cell, x + 4, y + 4, { width: widths[index] - 8 });
      x += widths[index];
    });
    doc.y = y + rowHeight;
  };

  drawRow(headers, true);
  rows.forEach((row) => drawRow(row));
  doc.moveDown(0.8);
}

function buildAdjudicadosSummaryRows(lotes: ParsedLot[]) {
  return lotes.map((lot) => [
    String(lot.numero_lote),
    lot.item.descricao || lot.titulo,
    formatNumberBR(lot.item.quantidade, 3),
    formatCurrencyBRL(lot.item.valor_unitario),
    formatCurrencyBRL(lot.item.valor_total),
    lot.item.marca || "-",
    lot.item.modelo || "-",
    lot.status,
    lot.vencedor || "-",
    lot.cnpj_vencedor || "-",
    formatCurrencyBRL(lot.melhor_lance),
  ]);
}

function buildMalSucedidosSummaryRows(lotes: ParsedLot[]) {
  return lotes.map((lot) => [
    String(lot.numero_lote),
    lot.item.descricao || lot.titulo,
    formatNumberBR(lot.item.quantidade, 3),
    formatCurrencyBRL(lot.item.valor_unitario_estimado),
    [lot.item.marca, lot.item.modelo].filter(Boolean).join(" / ") || "-",
    lot.status,
    lot.motivo_falha || "-",
  ]);
}

function buildParticipantRows(participantes: ParsedParticipant[]) {
  return participantes.map((participant) => [
    participant.ranking ? String(participant.ranking) : "-",
    participant.razao_social,
    participant.documento || "-",
    formatCurrencyBRL(participant.oferta_inicial),
    formatCurrencyBRL(participant.oferta_final),
    participant.diferenca_percentual !== null && participant.diferenca_percentual !== undefined ? `${formatNumberBR(participant.diferenca_percentual, 2)}%` : "-",
    participant.me_epp === true ? "Sim" : participant.me_epp === false ? "Não" : "-",
    participant.section,
  ]);
}

async function buildReportPdfBuffer(payload: ParsedPayload, report: "adjudicados" | "malsucedidos") {
  const branding = await resolveBrandingLines();
  const isAdjudicados = report === "adjudicados";
  const lotes = isAdjudicados ? payload.lotes.filter((lot) => isAdjudicavelStatus(lot.status)) : payload.lotes.filter((lot) => isMalsucedidoStatus(lot.status));
  const title = isAdjudicados ? "Relatório de lotes adjudicados / em habilitação" : "Relatório de lotes malsucedidos";
  const subtitle = `${basename(payload.source_path)} · ${new Date(payload.generated_at).toLocaleString("pt-BR")}`;
  const summaryRows = isAdjudicados ? buildAdjudicadosSummaryRows(lotes) : buildMalSucedidosSummaryRows(lotes);

  return createPdfBuffer((doc) => {
    drawHeader(doc, branding.lines, title, subtitle);
    drawSummary(doc, [
      { label: "Arquivo de origem", value: basename(payload.source_path) },
      { label: "Lotes no relatório", value: String(lotes.length) },
      { label: "Warnings", value: String(payload.summary.warnings) },
      { label: "Erros de parsing", value: String(payload.summary.parsing_errors) },
    ]);

    drawSectionTitle(doc, "Resumo consolidado");
    drawTable(
      doc,
      isAdjudicados
        ? ["Lote", "Descrição", "Qtd.", "Valor Unit.", "Valor Total", "Marca", "Modelo", "Status", "Vencedor", "CNPJ", "Melhor Lance"]
        : ["Lote", "Descrição", "Qtd.", "Valor Unit. Estimado", "Marca/Modelo", "Status", "Motivo"],
      summaryRows.length ? summaryRows : [["-", "Nenhum lote encontrado para o relatório.", "-", "-", "-", "-", "-", "-", "-", "-", "-"]].map((row) => row.slice(0, isAdjudicados ? 11 : 7)),
      isAdjudicados
        ? [40, 190, 44, 66, 66, 54, 54, 58, 112, 90, 76]
        : [40, 230, 50, 92, 84, 62, 190],
    );

    for (const lot of lotes) {
      drawSectionTitle(doc, `Lote ${lot.numero_lote} · ${lot.status}`);
      doc.fillColor("#1e293b").font("Helvetica").fontSize(9).text(lot.item.descricao || lot.titulo, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: "justify" });
      doc.moveDown(0.35);
      const infoLine = [
        `Quantidade: ${formatNumberBR(lot.item.quantidade, 3)}`,
        `Marca: ${lot.item.marca || "-"}`,
        `Modelo: ${lot.item.modelo || "-"}`,
        isAdjudicados ? `Melhor lance: ${formatCurrencyBRL(lot.melhor_lance)}` : `Motivo: ${lot.motivo_falha || "-"}`,
      ].join("  |  ");
      doc.fillColor("#475569").font("Helvetica").fontSize(8.5).text(infoLine);
      doc.moveDown(0.3);
      drawTable(
        doc,
        ["Class.", "Razão Social", "CNPJ/CPF", "Oferta Inicial", "Oferta Final", "Dif.(%)", "ME/EPP", "Seção"],
        buildParticipantRows(lot.participantes).length ? buildParticipantRows(lot.participantes) : [["-", "Nenhum participante identificado.", "-", "-", "-", "-", "-", "-"]],
        [46, 182, 102, 78, 78, 60, 56, 78],
      );
    }

    const footerY = doc.page.height - 18;
    doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(branding.footer, doc.page.margins.left, footerY, { align: "center", width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
  });
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

  const jsonPath = await runPythonParser(sourceFile, outputDir);
  const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as ParsedPayload;

  const adjudicadosPdfPath = join(outputDir, "Relatorio_Adjudicados.pdf");
  const malsucedidosPdfPath = join(outputDir, "Relatorio_MalSucedidos.pdf");
  writeFileSync(adjudicadosPdfPath, await buildReportPdfBuffer(parsed, "adjudicados"));
  writeFileSync(malsucedidosPdfPath, await buildReportPdfBuffer(parsed, "malsucedidos"));

  const artifacts = [
    { label: "JSON consolidado", path: jsonPath, type: "json" as const },
    { label: "Relatório Adjudicados (PDF)", path: adjudicadosPdfPath, type: "pdf" as const },
    { label: "Relatório Adjudicados (XLSX)", path: String(parsed.artifacts?.adjudicados_xlsx ?? join(outputDir, "Relatorio_Adjudicados.xlsx")), type: "xlsx" as const },
    { label: "Relatório Malsucedidos (PDF)", path: malsucedidosPdfPath, type: "pdf" as const },
    { label: "Relatório Malsucedidos (XLSX)", path: String(parsed.artifacts?.malsucedidos_xlsx ?? join(outputDir, "Relatorio_MalSucedidos.xlsx")), type: "xlsx" as const },
    { label: "Warnings", path: join(outputDir, "warnings.log"), type: "log" as const },
    { label: "Erros de parsing", path: join(outputDir, "erros_parsing.log"), type: "log" as const },
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
