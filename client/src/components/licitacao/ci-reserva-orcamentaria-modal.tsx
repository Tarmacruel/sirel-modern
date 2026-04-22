import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Download,
  FileText,
  Italic,
  Paperclip,
  RefreshCw,
  Upload,
  Underline as UnderlineIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/shared/modal";
import {
  prefeituraLines,
  prefeituraLogoUrl,
  systemFooterText,
  useRuntimeBranding,
  type RuntimeBrandingSnapshot,
} from "@/lib/branding";
import { formatCurrencyBRL } from "@/lib/formatters";
import { uploadProcessoDocumento } from "@/lib/document-upload";
import { cn } from "@/lib/utils";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DEFAULT_CI_CATEGORY = "LICITACAO_COMUNICACAO_RESERVA_ORCAMENTARIA";

type DocxModule = typeof import("docx");

interface ProcessoCIReserva {
  id: number;
  numeroSirel: string;
  numeroAdministrativo?: string | null;
  objeto?: string | null;
  modalidadeCodigo?: string | null;
  modalidade?: string | null;
  secretaria?: string | null;
  condutorProcesso?: {
    nome?: string | null;
    cargo?: string | null;
  } | null;
  valorEstimado?: number | string | null;
}

interface CIReservaOrcamentariaModalProps {
  open: boolean;
  onClose: () => void;
  processo: ProcessoCIReserva;
  processoId: number;
  categoria?: string;
  onDocumentoSalvo?: (message: string) => void | Promise<void>;
  onOperacaoErro?: (message: string) => void;
}

type TabKey = "gerar" | "anexar";
type SavingMode = "save" | "external" | null;
type DocxImageType = "png" | "jpg" | "gif" | "bmp";

interface InlineFormatting {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
}

interface ParagraphTextStyle {
  size?: number;
  color?: string;
  bold?: boolean;
}

interface CIBrandingContext {
  logoUrl: string;
  docxLogoUrl: string;
  lines: readonly [string, string, string, string];
  footerText: string;
}

const imageBytesCache = new Map<string, Uint8Array>();

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateBR(date = new Date()) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatShortDateBR(date = new Date()) {
  return date.toLocaleDateString("pt-BR");
}

function resolveModalidadeTexto(processo: ProcessoCIReserva) {
  if (processo.modalidade?.trim()) return processo.modalidade.trim();

  const map: Record<string, string> = {
    PREGAO_ELETRONICO: "Pregão Eletrônico",
    PREGAO_PRESENCIAL: "Pregão Presencial",
    CONCORRENCIA: "Concorrência",
    CONCORRENCIA_ELETRONICA: "Concorrência Eletrônica",
    DISPENSA: "Dispensa de Licitação",
    DISPENSA_ELETRONICA: "Dispensa Eletrônica",
    DISPENSA_SIMPLIFICADA: "Dispensa Simplificada",
    INEXIGIBILIDADE: "Inexigibilidade",
    LEILAO: "Leilão",
    CONCURSO: "Concurso",
    CREDENCIAMENTO: "Credenciamento",
    COMPRA_DIRETA: "Compra Direta",
  };

  return map[processo.modalidadeCodigo ?? ""] ?? "Licitação";
}

function resolveBaseJuridica(processo: ProcessoCIReserva) {
  const codigo = processo.modalidadeCodigo ?? "";
  if (codigo.includes("PREGAO")) {
    return "art. 6º, incisos XIII e XLI, da Lei nº 14.133/2021, com adoção da modalidade pregão para bens e serviços comuns";
  }
  if (codigo.includes("DISPENSA")) {
    return "art. 75 da Lei nº 14.133/2021, nas hipóteses de dispensa de licitação";
  }
  if (codigo.includes("INEXIGIBILIDADE")) {
    return "art. 74 da Lei nº 14.133/2021, nas hipóteses de inexigibilidade";
  }
  return "Lei nº 14.133/2021";
}

function buildDefaultCiNumber() {
  return `___/${new Date().getFullYear()}`;
}

function buildExternalTitle(numeroCi: string) {
  return numeroCi.trim()
    ? `CI ${numeroCi.trim()} - Reserva Orçamentária`
    : "CI - Reserva Orçamentária";
}

function resolveAbsoluteAssetUrl(url: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (typeof window === "undefined") return url;
  return new URL(url, window.location.origin).toString();
}

function resolveDocxLogoUrl(url: string) {
  return /\.(png|jpe?g|gif|bmp)$/i.test(url) ? url : "/logo-prefeitura.png";
}

function resolveDemandanteLine(
  processo: ProcessoCIReserva | null | undefined,
  branding: RuntimeBrandingSnapshot | null | undefined,
) {
  const demandante = processo?.secretaria?.trim();
  return demandante || branding?.prefeituraLines?.[1] || prefeituraLines[1];
}

function buildBrandingContext(
  branding: RuntimeBrandingSnapshot | null | undefined,
  processo: ProcessoCIReserva | null | undefined,
): CIBrandingContext {
  const demandanteLine = resolveDemandanteLine(processo, branding);

  return {
    logoUrl: resolveAbsoluteAssetUrl(
      branding?.prefeituraLogoUrl || prefeituraLogoUrl,
    ),
    docxLogoUrl: resolveAbsoluteAssetUrl(
      resolveDocxLogoUrl(branding?.prefeituraLogoUrl || prefeituraLogoUrl),
    ),
    lines: [
      branding?.prefeituraLines?.[0] ?? prefeituraLines[0],
      demandanteLine,
      branding?.prefeituraLines?.[2] ?? prefeituraLines[2],
      branding?.prefeituraLines?.[3] ?? prefeituraLines[3],
    ] as const,
    footerText: branding?.systemFooterText?.trim() || systemFooterText,
  };
}

function buildCIHeaderHtml(
  branding: CIBrandingContext,
  numeroCi: string,
  numeroProcesso: string,
) {
  const [orgLine, secretariaLine, cnpjLine, enderecoLine] = branding.lines;

  return `
<div data-ci-branding="true" style="display:flex;align-items:center;gap:18px;border-bottom:3px solid #2440A7;padding-bottom:12px;margin-bottom:18px;">
  <div style="width:220px;min-width:220px;display:flex;align-items:center;justify-content:flex-start;">
    <img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(secretariaLine)}" style="display:block;width:100%;max-width:220px;max-height:78px;height:auto;object-fit:contain;" />
  </div>
  <div style="display:grid;gap:4px;min-width:0;flex:1;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#2440A7;">${escapeHtml(orgLine)}</div>
    <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#2440A7;">${escapeHtml(secretariaLine)}</div>
    <div style="font-size:11px;color:#475569;">${escapeHtml(cnpjLine)}</div>
    <div style="font-size:11px;color:#475569;">${escapeHtml(enderecoLine)}</div>
  </div>
</div>
<div style="border-bottom:3px solid #2440A7;padding-bottom:12px;margin-bottom:20px;">
  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#2440A7;">Licitação · Comunicação Interna</p>
  <p style="margin:8px 0 0;font-size:28px;line-height:1.15;color:#0f172a;"><strong>CI ${escapeHtml(numeroCi.trim() || "Reserva Orçamentária")}</strong></p>
  <p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:#475569;">Processo administrativo ${escapeHtml(numeroProcesso)}</p>
</div>
  `.trim();
}

function buildCIFooterHtml(branding: CIBrandingContext) {
  return `
<div data-ci-footer="true" style="margin-top:24px;padding-top:12px;border-top:1px solid #2440A7;font-size:11px;line-height:1.6;color:#475569;text-align:center;">
  ${escapeHtml(branding.footerText)} • Documento gerado em ${escapeHtml(formatShortDateBR())}.
</div>
  `.trim();
}

function buildCIHtml(
  processo: ProcessoCIReserva,
  numeroCi: string,
  branding: CIBrandingContext,
) {
  const modalidade = resolveModalidadeTexto(processo);
  const baseJuridica = resolveBaseJuridica(processo);
  const assinante = processo.condutorProcesso?.nome?.trim() || "";
  const cargo =
    processo.condutorProcesso?.cargo?.trim() || "Agente de Contratação";
  const funcaoAssinante = /agente de contrat/i.test(cargo)
    ? ""
    : "Agente de Contratação";
  const numeroProcesso =
    processo.numeroAdministrativo?.trim() || processo.numeroSirel || "___/____";
  const objeto = processo.objeto?.trim() || "[objeto da contratação]";
  const secretaria = processo.secretaria?.trim() || "Secretaria Municipal";

  return `
${buildCIHeaderHtml(branding, numeroCi, numeroProcesso)}
<table style="width:100%;border-collapse:separate;border-spacing:12px 12px;margin:0 0 18px;">
  <tr>
    <td style="width:50%;border:1px solid #2440A7;border-radius:16px;padding:12px 14px;background:#F8FAFF;">
      <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#2440A7;">Número da CI</p>
      <p style="margin:6px 0 0;font-size:14px;font-weight:600;color:#0F172A;">${escapeHtml(numeroCi)}</p>
    </td>
    <td style="width:50%;border:1px solid #2440A7;border-radius:16px;padding:12px 14px;background:#F8FAFF;">
      <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#2440A7;">Processo administrativo</p>
      <p style="margin:6px 0 0;font-size:14px;font-weight:600;color:#0F172A;">${escapeHtml(numeroProcesso)}</p>
    </td>
  </tr>
  <tr>
    <td style="width:50%;border:1px solid #2440A7;border-radius:16px;padding:12px 14px;background:#F8FAFF;">
      <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#2440A7;">Data</p>
      <p style="margin:6px 0 0;font-size:14px;font-weight:600;color:#0F172A;">${escapeHtml(formatDateBR())}</p>
    </td>
    <td style="width:50%;border:1px solid #2440A7;border-radius:16px;padding:12px 14px;background:#F8FAFF;">
      <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#2440A7;">De</p>
      <p style="margin:6px 0 0;font-size:14px;font-weight:600;color:#0F172A;">Assessoria de Licitação</p>
    </td>
  </tr>
  <tr>
    <td style="width:50%;border:1px solid #2440A7;border-radius:16px;padding:12px 14px;background:#F8FAFF;">
      <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#2440A7;">Para</p>
      <p style="margin:6px 0 0;font-size:14px;font-weight:600;color:#0F172A;">Departamento de Orçamento</p>
    </td>
    <td style="width:50%;border:1px solid #2440A7;border-radius:16px;padding:12px 14px;background:#F8FAFF;">
      <p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#2440A7;">Assunto</p>
      <p style="margin:6px 0 0;font-size:14px;font-weight:600;color:#0F172A;">Solicitação de reserva orçamentária</p>
    </td>
  </tr>
</table>
<h2 style="margin:22px 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:0.12em;color:#0F172A;">Objeto</h2>
<p style="margin:0 0 12px;text-align:justify;line-height:1.6;">Solicita-se a indicação de disponibilidade orçamentária para a futura e eventual contratação referente a <strong>${escapeHtml(objeto)}</strong>, destinada ao atendimento das demandas da ${escapeHtml(secretaria)}.</p>
<h2 style="margin:22px 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:0.12em;color:#0F172A;">Fundamentação</h2>
<p style="margin:0 0 12px;text-align:justify;line-height:1.6;">A presente comunicação interna observa o disposto no ${escapeHtml(baseJuridica)} e formaliza a necessidade de prosseguimento da contratação na modalidade <strong>${escapeHtml(modalidade)}</strong>.</p>
<h2 style="margin:22px 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:0.12em;color:#0F172A;">Providência requerida</h2>
<p style="margin:0 0 12px;text-align:justify;line-height:1.6;">Solicita-se a este setor a informação da dotação orçamentária aplicável e, se houver disponibilidade, a indicação da respectiva fonte de recurso para instrução regular do processo.</p>
<p style="margin:26px 0 0;text-align:right;line-height:1.6;">Teixeira de Freitas-BA, ${escapeHtml(formatDateBR())}.</p>
<p style="margin:42px 0 0;">___________________________________</p>
${assinante ? `<p style="margin:8px 0 0;"><strong>${escapeHtml(assinante)}</strong></p>` : ""}
<p style="margin:4px 0 0;">${escapeHtml(cargo)}</p>
${funcaoAssinante ? `<p style="margin:4px 0 0;">${escapeHtml(funcaoAssinante)}</p>` : ""}
${buildCIFooterHtml(branding)}
  `.trim();
}

function isDocxInstitutionalHeaderText(
  value: string,
  branding: CIBrandingContext,
) {
  const text = value.trim();
  return branding.lines.some((line) => line.trim() === text);
}

function isDocxGeneratedFooterText(value: string, branding: CIBrandingContext) {
  const text = value.trim();
  return (
    text.includes(branding.footerText) || text.includes("Documento gerado em")
  );
}

function resolveNodeFormatting(
  element: Element,
  current: InlineFormatting,
): InlineFormatting {
  const tag = element.tagName.toLowerCase();
  const style = (element.getAttribute("style") ?? "").toLowerCase();

  return {
    bold:
      current.bold ||
      tag === "strong" ||
      tag === "b" ||
      style.includes("font-weight:bold") ||
      style.includes("font-weight: bold"),
    italics:
      current.italics ||
      tag === "em" ||
      tag === "i" ||
      style.includes("font-style:italic") ||
      style.includes("font-style: italic"),
    underline:
      current.underline ||
      tag === "u" ||
      style.includes("text-decoration:underline") ||
      style.includes("text-decoration: underline"),
  };
}

function buildRunsFromNode(
  node: ChildNode,
  docx: DocxModule,
  formatting: InlineFormatting = {},
  textStyle: ParagraphTextStyle = {},
): any[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\u00a0/g, " ") ?? "";
    if (!text.trim()) return [];
    return [
      new docx.TextRun({
        text,
        bold: formatting.bold || textStyle.bold,
        italics: formatting.italics,
        underline: formatting.underline
          ? { type: docx.UnderlineType.SINGLE }
          : undefined,
        font: "Arial",
        size: textStyle.size ?? 22,
        color: textStyle.color,
      }),
    ];
  }

  if (!(node instanceof Element)) return [];

  if (node.tagName.toLowerCase() === "br") {
    return [
      new docx.TextRun({
        text: "",
        break: 1,
        font: "Arial",
        size: textStyle.size ?? 22,
        color: textStyle.color,
      }),
    ];
  }

  const nextFormatting = resolveNodeFormatting(node, formatting);
  return Array.from(node.childNodes).flatMap((child) =>
    buildRunsFromNode(child, docx, nextFormatting, textStyle),
  );
}

function resolveParagraphAlignment(
  element: Element,
  docx: DocxModule,
): (typeof docx.AlignmentType)[keyof typeof docx.AlignmentType] | undefined {
  const htmlElement =
    element instanceof HTMLElement ? element : (null as HTMLElement | null);
  const textAlign =
    htmlElement?.style.textAlign ||
    (element.getAttribute("style") ?? "")
      .split(";")
      .find((chunk) => chunk.trim().startsWith("text-align"))
      ?.split(":")[1]
      ?.trim();

  if (textAlign === "center") return docx.AlignmentType.CENTER;
  if (textAlign === "right") return docx.AlignmentType.RIGHT;
  if (textAlign === "justify") return docx.AlignmentType.JUSTIFIED;
  return undefined;
}

function buildParagraphFromElement(element: Element, docx: DocxModule) {
  const tag = element.tagName.toLowerCase();
  const textStyle: ParagraphTextStyle =
    tag === "h1"
      ? { size: 34, bold: true, color: "0F172A" }
      : tag === "h2"
        ? { size: 26, bold: true, color: "0F172A" }
        : {};
  const children = Array.from(element.childNodes).flatMap((child) =>
    buildRunsFromNode(child, docx, {}, textStyle),
  );

  return new docx.Paragraph({
    alignment: resolveParagraphAlignment(element, docx),
    spacing: {
      after: tag === "h1" ? 180 : tag === "h2" ? 150 : 220,
    },
    children:
      children.length > 0
        ? children
        : [
            new docx.TextRun({
              text: "",
              font: "Arial",
              size: textStyle.size ?? 22,
              color: textStyle.color,
            }),
          ],
  });
}

function buildTableFromElement(table: HTMLTableElement, docx: DocxModule) {
  const border = { style: docx.BorderStyle.SINGLE, size: 6, color: "2440A7" };
  const rows = Array.from(table.rows).map(
    (row) =>
      new docx.TableRow({
        children: Array.from(row.cells).map((cell) => {
          const paragraphs = Array.from(cell.children)
            .filter(
              (child): child is HTMLElement => child instanceof HTMLElement,
            )
            .map((child) => buildParagraphFromElement(child, docx));

          if (!paragraphs.length) {
            paragraphs.push(
              new docx.Paragraph({
                children: [
                  new docx.TextRun({
                    text: cell.textContent?.trim() ?? "",
                    font: "Arial",
                    size: 22,
                  }),
                ],
              }),
            );
          }

          return new docx.TableCell({
            borders: {
              top: border,
              bottom: border,
              left: border,
              right: border,
            },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: paragraphs,
          });
        }),
      }),
  );

  return new docx.Table({
    rows,
    width: {
      size: 9072,
      type: docx.WidthType.DXA,
    },
  });
}

function inferDocxImageType(url: string): DocxImageType {
  const normalizedUrl = url.toLowerCase();
  if (normalizedUrl.endsWith(".jpg") || normalizedUrl.endsWith(".jpeg")) {
    return "jpg";
  }
  if (normalizedUrl.endsWith(".gif")) return "gif";
  if (normalizedUrl.endsWith(".bmp")) return "bmp";
  return "png";
}

async function fetchImageBytes(url: string) {
  if (!url) return null;
  const cached = imageBytesCache.get(url);
  if (cached) return cached;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Não foi possível carregar a logo institucional.");
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  imageBytesCache.set(url, bytes);
  return bytes;
}

async function buildBrandingHeaderDocxChildren(
  branding: CIBrandingContext,
  docx: DocxModule,
) {
  const [orgLine, secretariaLine, cnpjLine, enderecoLine] = branding.lines;
  const children: any[] = [];
  const imageBytes = await fetchImageBytes(branding.docxLogoUrl).catch(
    () => null,
  );

  if (imageBytes) {
    children.push(
      new docx.Paragraph({
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 140 },
        children: [
          new docx.ImageRun({
            data: imageBytes,
            type: inferDocxImageType(branding.docxLogoUrl),
            transformation: { width: 250, height: 84 },
          }),
        ],
      }),
    );
  }

  children.push(
    new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      spacing: { after: 90 },
      children: [
        new docx.TextRun({
          text: orgLine,
          font: "Arial",
          size: 18,
          color: "2440A7",
          bold: true,
        }),
      ],
    }),
    new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      spacing: { after: 90 },
      children: [
        new docx.TextRun({
          text: secretariaLine,
          font: "Arial",
          size: 18,
          color: "2440A7",
          bold: true,
        }),
      ],
    }),
    new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      spacing: { after: 50 },
      children: [
        new docx.TextRun({
          text: cnpjLine,
          font: "Arial",
          size: 17,
          color: "475569",
        }),
      ],
    }),
    new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new docx.TextRun({
          text: enderecoLine,
          font: "Arial",
          size: 17,
          color: "475569",
        }),
      ],
    }),
    new docx.Paragraph({
      spacing: { after: 180 },
      border: {
        bottom: {
          style: docx.BorderStyle.SINGLE,
          color: "2440A7",
          size: 8,
        },
      },
      children: [new docx.TextRun({ text: "", font: "Arial", size: 2 })],
    }),
  );

  return children;
}

function buildFooterDocxChildren(
  branding: CIBrandingContext,
  docx: DocxModule,
) {
  return [
    new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      spacing: { before: 280, after: 0 },
      border: {
        top: {
          style: docx.BorderStyle.SINGLE,
          color: "2440A7",
          size: 6,
        },
      },
      children: [
        new docx.TextRun({
          text: `${branding.footerText} • Documento gerado em ${formatShortDateBR()}.`,
          font: "Arial",
          size: 16,
          color: "475569",
        }),
      ],
    }),
  ];
}

async function createDocxBlobFromHtml(
  html: string,
  branding: CIBrandingContext,
) {
  const docx = await import("docx");
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const brandingChildren = await buildBrandingHeaderDocxChildren(
    branding,
    docx,
  );
  const footerChildren = buildFooterDocxChildren(branding, docx);

  const bodyChildren = Array.from(parsed.body.childNodes).flatMap((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (
        !text ||
        isDocxInstitutionalHeaderText(text, branding) ||
        isDocxGeneratedFooterText(text, branding)
      ) {
        return [];
      }
      return [
        new docx.Paragraph({
          children: [new docx.TextRun({ text, font: "Arial", size: 22 })],
        }),
      ];
    }

    if (!(node instanceof HTMLElement)) return [];
    if (node.tagName.toLowerCase() === "img") return [];

    const normalizedText = node.textContent?.trim() ?? "";
    if (
      isDocxInstitutionalHeaderText(normalizedText, branding) ||
      isDocxGeneratedFooterText(normalizedText, branding)
    ) {
      return [];
    }

    if (node.tagName.toLowerCase() === "table") {
      return [buildTableFromElement(node as HTMLTableElement, docx)];
    }

    return [buildParagraphFromElement(node, docx)];
  });

  const document = new docx.Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1701 },
          },
        },
        children: [...brandingChildren, ...bodyChildren, ...footerChildren],
      },
    ],
  });

  return docx.Packer.toBlob(document);
}

function sanitizeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function buildDocFileName(numeroCi: string) {
  const suffix = sanitizeFilename(numeroCi.trim() || "rascunho");
  return `ci-reserva-orcamentaria-${suffix || "rascunho"}.docx`;
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  const actions: Array<{
    key: string;
    title: string;
    icon: ReactNode;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      key: "bold",
      title: "Negrito",
      icon: <Bold className="h-4 w-4" />,
      active: editor?.isActive("bold") ?? false,
      onClick: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      title: "Italico",
      icon: <Italic className="h-4 w-4" />,
      active: editor?.isActive("italic") ?? false,
      onClick: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      key: "underline",
      title: "Sublinhado",
      icon: <UnderlineIcon className="h-4 w-4" />,
      active: editor?.isActive("underline") ?? false,
      onClick: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      key: "left",
      title: "Alinhar a esquerda",
      icon: <AlignLeft className="h-4 w-4" />,
      active: editor?.isActive({ textAlign: "left" }) ?? false,
      onClick: () => editor?.chain().focus().setTextAlign("left").run(),
    },
    {
      key: "center",
      title: "Centralizar",
      icon: <AlignCenter className="h-4 w-4" />,
      active: editor?.isActive({ textAlign: "center" }) ?? false,
      onClick: () => editor?.chain().focus().setTextAlign("center").run(),
    },
    {
      key: "right",
      title: "Alinhar a direita",
      icon: <AlignRight className="h-4 w-4" />,
      active: editor?.isActive({ textAlign: "right" }) ?? false,
      onClick: () => editor?.chain().focus().setTextAlign("right").run(),
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
      {actions.map((action) => (
        <Button
          key={action.key}
          type="button"
          size="icon"
          variant={action.active ? "secondary" : "ghost"}
          onClick={action.onClick}
          disabled={!editor}
          title={action.title}
          aria-label={action.title}
          className={cn(
            "h-9 w-9 rounded-xl",
            action.active
              ? "border-[var(--border-strong)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)]",
          )}
        >
          {action.icon}
        </Button>
      ))}
    </div>
  );
}

export default function CIReservaOrcamentariaModal({
  open,
  onClose,
  processo,
  processoId,
  categoria = DEFAULT_CI_CATEGORY,
  onDocumentoSalvo,
  onOperacaoErro,
}: CIReservaOrcamentariaModalProps) {
  const branding = useRuntimeBranding();
  const [activeTab, setActiveTab] = useState<TabKey>("gerar");
  const [numeroCi, setNumeroCi] = useState("");
  const [tituloExterno, setTituloExterno] = useState(buildExternalTitle(""));
  const [arquivoExterno, setArquivoExterno] = useState<File | null>(null);
  const [savingMode, setSavingMode] = useState<SavingMode>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ciBranding = useMemo(
    () => buildBrandingContext(branding, processo),
    [branding, processo],
  );

  const ciNumeroEfetivo = numeroCi.trim() || buildDefaultCiNumber();
  const documentoBaseHtml = useMemo(
    () => buildCIHtml(processo, ciNumeroEfetivo, ciBranding),
    [ciBranding, ciNumeroEfetivo, processo],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      TextAlign.configure({ types: ["paragraph"] }),
    ],
    content: documentoBaseHtml,
    editorProps: {
      attributes: {
        class:
          "ci-editor prose prose-sm max-w-none min-h-[720px] px-8 py-10 font-serif text-[14px] leading-7 text-[var(--text-primary)] focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!open) return;
    setActiveTab("gerar");
    setNumeroCi("");
    setTituloExterno(buildExternalTitle(""));
    setArquivoExterno(null);
    setSavingMode(null);
  }, [open]);

  useEffect(() => {
    if (!open || !editor) return;
    editor.commands.setContent(
      buildCIHtml(processo, buildDefaultCiNumber(), ciBranding),
    );
  }, [editor, open, processo]);

  function handleRegenerarDocumento() {
    if (!editor) return;
    editor.commands.setContent(documentoBaseHtml);
  }

  async function notifySaved(message: string) {
    await onDocumentoSalvo?.(message);
  }

  function notifyError(message: string) {
    onOperacaoErro?.(message);
  }

  async function handleDownloadDocx() {
    if (!editor) return;

    try {
      const [{ saveAs }, blob] = await Promise.all([
        import("file-saver"),
        createDocxBlobFromHtml(editor.getHTML(), ciBranding),
      ]);
      saveAs(blob, buildDocFileName(ciNumeroEfetivo));
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o arquivo DOCX.",
      );
    }
  }

  async function handleSalvarNoSistema() {
    if (!editor || savingMode) return;

    try {
      setSavingMode("save");
      const blob = await createDocxBlobFromHtml(editor.getHTML(), ciBranding);
      const file = new File([blob], buildDocFileName(ciNumeroEfetivo), {
        type: DOCX_MIME,
      });

      await uploadProcessoDocumento({
        processoId,
        tipo: "COMUNICACAO_INTERNA",
        categoria,
        titulo: buildExternalTitle(ciNumeroEfetivo),
        descricao:
          "Comunicação interna para solicitação de reserva orçamentária.",
        arquivo: file,
      });

      await notifySaved("CI de reserva orçamentária salva no processo.");
      onClose();
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a CI no processo.",
      );
    } finally {
      setSavingMode(null);
    }
  }

  async function handleUploadExterno() {
    if (!arquivoExterno || savingMode) return;

    try {
      setSavingMode("external");
      await uploadProcessoDocumento({
        processoId,
        tipo: "COMUNICACAO_INTERNA",
        categoria,
        titulo: tituloExterno.trim() || buildExternalTitle(ciNumeroEfetivo),
        descricao:
          "Arquivo externo vinculado como comunicação interna de reserva orçamentária.",
        arquivo: arquivoExterno,
      });

      await notifySaved("CI externa vinculada ao processo.");
      onClose();
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Não foi possível anexar a CI externa.",
      );
    } finally {
      setSavingMode(null);
    }
  }

  const summaryItems = [
    { label: "Processo", value: processo.numeroSirel },
    {
      label: "Modalidade",
      value: resolveModalidadeTexto(processo),
    },
    {
      label: "Secretaria",
      value: processo.secretaria || "Não informada",
    },
    {
      label: "Valor estimado",
      value:
        processo.valorEstimado != null
          ? formatCurrencyBRL(Number(processo.valorEstimado))
          : "Não consolidado",
    },
  ];

  const footerActions =
    activeTab === "gerar" ? (
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleDownloadDocx}
          disabled={!editor}
          icon={<Download className="h-4 w-4" />}
        >
          Baixar DOCX
        </Button>
        <Button
          type="button"
          onClick={() => void handleSalvarNoSistema()}
          disabled={!editor || savingMode !== null}
          loading={savingMode === "save"}
          icon={<Upload className="h-4 w-4" />}
        >
          Salvar no processo
        </Button>
      </div>
    ) : (
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => void handleUploadExterno()}
          disabled={!arquivoExterno || savingMode !== null}
          loading={savingMode === "external"}
          icon={<Paperclip className="h-4 w-4" />}
        >
          Vincular arquivo
        </Button>
      </div>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="CI de Reserva Orçamentária"
      description="Gere, revise ou vincule a comunicação interna da reserva orçamentária sem sair da fase interna."
      size="xl"
      actions={footerActions}
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          {summaryItems.map((item) => (
            <article
              key={item.label}
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {item.label}
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                {item.value}
              </p>
            </article>
          ))}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabKey)}
          items={[
            {
              value: "gerar",
              label: "Gerar documento",
              content: (
                <div className="space-y-5">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
                    <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-5 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-primary-50)] text-[var(--color-primary-700)]">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary-600)]">
                            Texto-base automático
                          </div>
                          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                            O sistema monta a CI com processo, modalidade,
                            secretaria e assinatura do condutor.
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4">
                        <FormField
                          label="Número da CI"
                          description="Use o número oficial da comunicação antes de consolidar a versão final."
                        >
                          <Input
                            value={numeroCi}
                            placeholder={buildDefaultCiNumber()}
                            onChange={(event) =>
                              setNumeroCi(event.target.value)
                            }
                          />
                        </FormField>

                        <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                            Dados aproveitados
                          </div>
                          <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
                            <p>
                              <strong className="text-[var(--text-primary)]">
                                Processo:
                              </strong>{" "}
                              {processo.numeroAdministrativo ||
                                processo.numeroSirel}
                            </p>
                            <p>
                              <strong className="text-[var(--text-primary)]">
                                Objeto:
                              </strong>{" "}
                              {processo.objeto || "Não informado"}
                            </p>
                            <p>
                              <strong className="text-[var(--text-primary)]">
                                Assinatura:
                              </strong>{" "}
                              {processo.condutorProcesso?.nome ||
                                "Condutor em definição"}
                            </p>
                          </div>
                        </article>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleRegenerarDocumento}
                            icon={<RefreshCw className="h-4 w-4" />}
                          >
                            Atualizar texto-base
                          </Button>
                        </div>
                      </div>
                    </article>

                    <div className="overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                      <EditorToolbar editor={editor} />
                      <div className="max-h-[70dvh] overflow-auto bg-[linear-gradient(180deg,var(--surface-soft),transparent)] p-4">
                        <div className="mx-auto w-full max-w-[780px] rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white shadow-[0_28px_64px_-44px_rgba(15,23,42,0.42)] dark:bg-[var(--surface-card)]">
                          {editor ? (
                            <EditorContent editor={editor} />
                          ) : (
                            <div className="space-y-4 px-8 py-10">
                              <Skeleton className="h-4 w-2/3 rounded-full" />
                              <Skeleton className="h-4 w-full rounded-full" />
                              <Skeleton className="h-4 w-11/12 rounded-full" />
                              <Skeleton className="h-32 w-full rounded-[24px]" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              value: "anexar",
              label: "Anexar arquivo externo",
              content: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,0.44fr)_minmax(0,0.56fr)]">
                  <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-5 py-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-primary-600)]">
                      Vinculação direta
                    </div>
                    <h4 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">
                      Suba uma CI pronta sem reabrir o fluxo documental.
                    </h4>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      Use esta aba quando a comunicação já vier assinada ou
                      produzida externamente. O documento será registrado no ato
                      da CI para reserva orçamentária.
                    </p>
                  </article>

                  <div className="space-y-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-5">
                    <FormField
                      label="Título do documento"
                      description="Esse título aparecerá no acervo do processo."
                    >
                      <Input
                        value={tituloExterno}
                        onChange={(event) =>
                          setTituloExterno(event.target.value)
                        }
                        placeholder="CI 0033/2026 - Reserva Orçamentária"
                      />
                    </FormField>

                    <FormField
                      label="Arquivo"
                      description="Aceita arquivos DOCX, DOC ou PDF."
                    >
                      <div className="space-y-3">
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept=".docx,.doc,.pdf"
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            setArquivoExterno(event.target.files?.[0] ?? null)
                          }
                        />
                        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4 text-sm text-[var(--text-secondary)]">
                          {arquivoExterno ? (
                            <span className="font-medium text-[var(--text-primary)]">
                              {arquivoExterno.name}
                            </span>
                          ) : (
                            "Nenhum arquivo selecionado."
                          )}
                        </div>
                      </div>
                    </FormField>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
    </Modal>
  );
}
