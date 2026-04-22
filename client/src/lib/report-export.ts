import {
  buildPrintableShell,
  type PrintableBranding,
} from "@sirel/shared/document-templates/planejamento";

import { getRuntimeBrandingSnapshot, systemFullName } from "@/lib/branding";

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportSummaryItem {
  label: string;
  value: unknown;
}

export interface WorkbookSheet {
  name: string;
  title?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary?: ReportSummaryItem[];
}

export interface ReportBrandingOptions {
  secondaryLine?: string | null;
  footerText?: string | null;
  eyebrow?: string | null;
}

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleString("pt-BR");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildSummaryLines(summary: ReportSummaryItem[]) {
  return summary.map((item) => `${item.label}: ${toText(item.value)}`);
}

function formatGeneratedAt(value = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function resolveAbsoluteAssetUrl(url: string | null | undefined) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === "undefined") return url;
  return new URL(url, window.location.origin).toString();
}

function resolvePdfLogoUrl(url: string | null | undefined) {
  const absoluteUrl = resolveAbsoluteAssetUrl(url);
  if (/\.(png|jpe?g)$/i.test(absoluteUrl)) return absoluteUrl;
  return resolveAbsoluteAssetUrl("/logo-prefeitura.png");
}

function buildReportBranding(
  override?: ReportBrandingOptions,
): PrintableBranding {
  const branding = getRuntimeBrandingSnapshot();

  return {
    logoUrl: resolveAbsoluteAssetUrl(branding.prefeituraLogoUrl),
    lines: branding.prefeituraLines,
    secondaryLine: override?.secondaryLine,
    footerText: override?.footerText ?? branding.systemFooterText,
  };
}

function buildSheetData(
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  summary: ReportSummaryItem[] = [],
  brandingOptions?: ReportBrandingOptions,
) {
  const branding = getRuntimeBrandingSnapshot();
  const secondaryLine =
    brandingOptions?.secondaryLine?.trim() || branding.prefeituraLines[1];
  const summaryLines = buildSummaryLines(summary);

  return [
    [branding.prefeituraLines[0]],
    [secondaryLine],
    [branding.prefeituraLines[2]],
    [branding.prefeituraLines[3]],
    [systemFullName],
    [],
    [title],
    [`Gerado em ${formatGeneratedAt()}`],
    [],
    ...summaryLines.map((line) => [line]),
    ...(summaryLines.length ? [[]] : []),
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => toText(row[column.key]))),
    [],
    [brandingOptions?.footerText ?? branding.systemFooterText],
  ];
}

function sanitizeSheetName(name: string, usedNames: Set<string>) {
  const base =
    name
      .replace(/[\\/*?:[\]]/g, " ")
      .trim()
      .slice(0, 31) || "Planilha";

  let candidate = base;
  let counter = 2;
  while (usedNames.has(candidate)) {
    const suffix = ` ${counter}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    counter += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

async function fetchImageDataUrl(url: string | null | undefined) {
  const absoluteUrl = resolveAbsoluteAssetUrl(url);
  if (!absoluteUrl) return null;

  try {
    const response = await fetch(absoluteUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolvePromise) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolvePromise(
          typeof reader.result === "string" ? reader.result : null,
        );
      reader.onerror = () => resolvePromise(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function renderSummaryCardsHtml(summary: ReportSummaryItem[]) {
  if (!summary.length) return "";

  return `
    <section class="grid">
      ${summary
        .map(
          (item) => `
            <article class="card">
              <div class="label">${escapeHtml(item.label)}</div>
              <div class="value">${escapeHtml(toText(item.value))}</div>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function buildPrintableReportBodyHtml(
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  summary: ReportSummaryItem[] = [],
  brandingOptions?: ReportBrandingOptions,
) {
  const eyebrow =
    brandingOptions?.eyebrow?.trim() || "Relatórios · Exportação institucional";
  const footerText =
    brandingOptions?.footerText?.trim() ||
    getRuntimeBrandingSnapshot().systemFooterText;

  return `
    <header class="header">
      <div class="eyebrow">${escapeHtml(eyebrow)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">Documento gerado em ${escapeHtml(formatGeneratedAt())}</p>
    </header>

    ${renderSummaryCardsHtml(summary)}

    <table>
      <thead>
        <tr>${columns
          .map((column) => `<th>${escapeHtml(column.label)}</th>`)
          .join("")}</tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows
                .map(
                  (row) => `
                    <tr>${columns
                      .map(
                        (column) =>
                          `<td>${escapeHtml(toText(row[column.key]))}</td>`,
                      )
                      .join("")}</tr>
                  `,
                )
                .join("")
            : `<tr><td colspan="${columns.length}">Nenhum registro encontrado para os filtros informados.</td></tr>`
        }
      </tbody>
    </table>

    <div class="footer">${escapeHtml(footerText)} • Documento gerado em ${escapeHtml(formatGeneratedAt())}.</div>
  `;
}

function drawPdfSummaryCards(
  doc: any,
  summary: ReportSummaryItem[],
  startY: number,
  pageWidth: number,
) {
  if (!summary.length) return startY;

  const columns = 2;
  const gap = 12;
  const left = 40;
  const contentWidth = pageWidth - 80;
  const cardWidth = (contentWidth - gap) / columns;
  const cardHeight = 46;
  let currentY = startY;

  summary.forEach((item, index) => {
    const columnIndex = index % columns;
    const rowIndex = Math.floor(index / columns);
    const x = left + columnIndex * (cardWidth + gap);
    const y = currentY + rowIndex * (cardHeight + gap);

    doc.setFillColor(248, 250, 255);
    doc.setDrawColor(36, 64, 167);
    doc.roundedRect(x, y, cardWidth, cardHeight, 8, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(36, 64, 167);
    doc.text(String(item.label).toUpperCase(), x + 10, y + 14, {
      maxWidth: cardWidth - 20,
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(toText(item.value), x + 10, y + 29, {
      maxWidth: cardWidth - 20,
    });
  });

  const totalRows = Math.ceil(summary.length / columns);
  return currentY + totalRows * (cardHeight + gap);
}

function drawPdfHeader(
  doc: any,
  title: string,
  brandingOptions?: ReportBrandingOptions,
  logoDataUrl?: string | null,
) {
  const branding = getRuntimeBrandingSnapshot();
  const secondaryLine =
    brandingOptions?.secondaryLine?.trim() || branding.prefeituraLines[1];
  const pageWidth = doc.internal.pageSize.getWidth();
  const logoX = 40;
  const logoY = 24;
  const logoWidth = 150;
  const logoHeight = 50;
  const textX = logoDataUrl ? 205 : 40;
  const eyebrow =
    brandingOptions?.eyebrow?.trim() || "Relatórios · Exportação institucional";

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoWidth, logoHeight);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(36, 64, 167);
  doc.text(branding.prefeituraLines[0], textX, 36);
  doc.text(secondaryLine, textX, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(branding.prefeituraLines[2], textX, 64);
  doc.text(branding.prefeituraLines[3], textX, 77, {
    maxWidth: pageWidth - textX - 40,
  });

  doc.setDrawColor(36, 64, 167);
  doc.setLineWidth(1.8);
  doc.line(40, 94, pageWidth - 40, 94);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(36, 64, 167);
  doc.text(eyebrow.toUpperCase(), 40, 116);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 40, 138);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Documento gerado em ${formatGeneratedAt()}`, 40, 154);

  return 172;
}

export function exportReportToCsv(
  filename: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
) {
  const lines = [
    columns
      .map((column) => `"${column.label.replaceAll('"', '""')}"`)
      .join(";"),
    ...rows.map((row) =>
      columns
        .map((column) => `"${toText(row[column.key]).replaceAll('"', '""')}"`)
        .join(";"),
    ),
  ];

  downloadBlob(
    filename,
    new Blob([`\uFEFF${lines.join("\r\n")}`], {
      type: "text/csv;charset=utf-8;",
    }),
  );
}

export function exportReportToJson(
  filename: string,
  payload: {
    title: string;
    generatedAt: unknown;
    columns: ReportColumn[];
    rows: Record<string, unknown>[];
    summary?: ReportSummaryItem[];
  },
) {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8;",
    }),
  );
}

export async function exportReportToXlsx(
  filename: string,
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  summary: ReportSummaryItem[] = [],
  brandingOptions?: ReportBrandingOptions,
) {
  const XLSX = await import("xlsx");
  const sheetData = buildSheetData(
    title,
    columns,
    rows,
    summary,
    brandingOptions,
  );

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  worksheet["!cols"] = columns.map((column) => ({
    wch: Math.max(column.label.length + 4, 20),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório");
  XLSX.writeFile(workbook, filename);
}

export async function exportWorkbookToXlsx(
  filename: string,
  title: string,
  sheets: WorkbookSheet[],
  summary: ReportSummaryItem[] = [],
  brandingOptions?: ReportBrandingOptions,
) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  if (summary.length) {
    const resumoColumns: ReportColumn[] = [
      { key: "label", label: "Indicador" },
      { key: "value", label: "Valor" },
    ];
    const resumoRows = summary.map((item) => ({
      label: item.label,
      value: toText(item.value),
    }));
    const resumoSheet = XLSX.utils.aoa_to_sheet(
      buildSheetData(
        `${title} - Resumo`,
        resumoColumns,
        resumoRows,
        [],
        brandingOptions,
      ),
    );
    resumoSheet["!cols"] = [{ wch: 34 }, { wch: 42 }];
    XLSX.utils.book_append_sheet(
      workbook,
      resumoSheet,
      sanitizeSheetName("Resumo", usedNames),
    );
  }

  sheets.forEach((sheet) => {
    const worksheet = XLSX.utils.aoa_to_sheet(
      buildSheetData(
        sheet.title ?? `${title} - ${sheet.name}`,
        sheet.columns,
        sheet.rows,
        sheet.summary ?? [],
        brandingOptions,
      ),
    );
    worksheet["!cols"] = sheet.columns.map((column) => ({
      wch: Math.max(column.label.length + 4, 20),
    }));
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      sanitizeSheetName(sheet.name, usedNames),
    );
  });

  XLSX.writeFile(workbook, filename);
}

export async function exportReportToPdf(
  filename: string,
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  summary: ReportSummaryItem[] = [],
  brandingOptions?: ReportBrandingOptions,
) {
  const branding = getRuntimeBrandingSnapshot();
  const [{ default: jsPDF }, autoTableModule, logoDataUrl] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    fetchImageDataUrl(resolvePdfLogoUrl(branding.prefeituraLogoUrl)),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({
    orientation: columns.length > 6 ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });

  let currentY = drawPdfHeader(doc, title, brandingOptions, logoDataUrl);
  currentY = drawPdfSummaryCards(
    doc,
    summary,
    currentY,
    doc.internal.pageSize.getWidth(),
  );

  autoTable(doc, {
    startY: currentY,
    head: [columns.map((column) => column.label)],
    body: rows.length
      ? rows.map((row) => columns.map((column) => toText(row[column.key])))
      : [["Nenhum registro encontrado para os filtros informados."]],
    theme: "grid",
    headStyles: {
      fillColor: [36, 64, 167],
      textColor: 255,
      fontStyle: "bold",
    },
    bodyStyles: {
      textColor: [15, 23, 42],
      fontSize: 9,
      cellPadding: 6,
      valign: "top",
    },
    styles: {
      lineColor: [36, 64, 167],
      lineWidth: 0.5,
      overflow: "linebreak",
    },
    margin: { left: 40, right: 40, top: 40, bottom: 54 },
    didDrawPage: () => {
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setDrawColor(36, 64, 167);
      doc.setLineWidth(0.8);
      doc.line(40, pageHeight - 30, pageWidth - 40, pageHeight - 30);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(
        brandingOptions?.footerText ?? branding.systemFooterText,
        40,
        pageHeight - 16,
      );
      doc.text(
        `Página ${doc.getCurrentPageInfo().pageNumber}`,
        pageWidth - 40,
        pageHeight - 16,
        { align: "right" },
      );
    },
  });

  doc.save(filename);
}

export function openPrintableReport(
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  summary: ReportSummaryItem[] = [],
  brandingOptions?: ReportBrandingOptions,
) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(
    buildPrintableShell(
      title,
      buildPrintableReportBodyHtml(
        title,
        columns,
        rows,
        summary,
        brandingOptions,
      ),
      buildReportBranding(brandingOptions),
    ),
  );
  printWindow.document.close();

  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}
