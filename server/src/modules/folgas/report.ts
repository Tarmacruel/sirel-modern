import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { requireDb } from "../../db/client.js";
import { getSystemParamValue } from "../../lib/system-params.js";

export interface FolgasReportData {
  organization: string;
  campaign: {
    id: number;
    name: string;
    start: string;
    end: string;
    status: string;
    maxFolgas: number;
  };
  generatedAt: Date;
  reservations: Array<{ date: string; participantId: number; name: string }>;
}

export async function loadFolgasReport(
  campaignId: number,
): Promise<FolgasReportData> {
  const db = requireDb();
  // One statement gives the campaign and its reservations a consistent database snapshot.
  const result = await db.execute(sql`
    SELECT c.id,c.nome,c.data_inicio::text,c.data_fim::text,c.status,c.max_folgas,
           r.data_folga::text,p.id AS participante_id,COALESCE(pe.nome,u.name) AS participante_nome
    FROM folga_campanhas c
    LEFT JOIN folga_reservas r ON r.campanha_id=c.id
    LEFT JOIN folga_participantes p ON p.id=r.participante_id AND p.campanha_id=c.id
    LEFT JOIN pessoas pe ON pe.id=p.pessoa_id
    LEFT JOIN users u ON u.id=p.user_id
    WHERE c.id=${campaignId}
    ORDER BY r.data_folga,r.id
  `);
  const first = result.rows[0];
  if (!first)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Campanha não encontrada.",
    });
  return {
    organization: String(
      (await getSystemParamValue(db, "INSTITUCIONAL.NOME_ORGAO")) ||
        "PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS",
    ),
    campaign: {
      id: Number(first.id),
      name: String(first.nome),
      start: String(first.data_inicio),
      end: String(first.data_fim),
      status: String(first.status),
      maxFolgas: Number(first.max_folgas),
    },
    generatedAt: new Date(),
    reservations: result.rows
      .filter((r) => r.data_folga != null)
      .map((r) => ({
        date: String(r.data_folga),
        participantId: Number(r.participante_id),
        name: String(r.participante_nome || "Participante sem nome"),
      })),
  };
}

const colors = {
  navy: "#102b46",
  blue: "#256da8",
  muted: "#64778d",
  line: "#c8d8e6",
  soft: "#f0f4f8",
};
const dateBR = (date: string) => date.split("-").reverse().join("/");
const text = (value: string) => value.replace(/[\x00-\x1f]/g, " ").trim();

export function renderFolgasReport(data: FolgasReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, left: 40, right: 40, bottom: 20 },
      bufferPages: true,
      info: {
        Title: "Relatório geral de folgas - " + data.campaign.name,
        Author: "SIREL",
        Subject: "Reservas confirmadas de folgas",
        CreationDate: data.generatedAt,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      const left = 40,
        width = doc.page.width - 80,
        bottom = doc.page.height - 105;
      let y = 0;
      const label = (
        value: string,
        x: number,
        top: number,
        w: number,
        size = 10,
        bold = false,
        color = colors.navy,
        align: "left" | "center" | "right" = "left",
      ) => {
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(size)
          .fillColor(color)
          .text(text(value), x, top, { width: w, align, lineGap: 2 });
        return doc.y;
      };
      const line = (top: number, color = colors.line, weight = 0.6) =>
        doc
          .moveTo(left, top)
          .lineTo(left + width, top)
          .lineWidth(weight)
          .strokeColor(color)
          .stroke();
      const masthead = () => {
        label("SIREL", left, 38, 130, 30, true);
        const orgEnd = label(
          data.organization.toUpperCase(),
          left + 158,
          43,
          width - 158,
          8.5,
          true,
          colors.navy,
          "right",
        );
        const sectionEnd = label(
          "Setor de Licitação",
          left + 158,
          orgEnd + 4,
          width - 158,
          9,
          false,
          colors.muted,
          "right",
        );
        y = Math.max(85, sectionEnd + 12);
        line(y, colors.blue, 2);
      };
      const headings = () => {
        y += 18;
        y = label("Folgas selecionadas", left, y, width, 16, true) + 4;
        y =
          label(
            "Reservas confirmadas em ordem cronológica",
            left,
            y,
            width,
            10,
            false,
            colors.muted,
          ) + 14;
        doc.rect(left, y, width, 27).fill(colors.navy);
        const col = [0, 99, 208, width - 48];
        ["DATA", "DIA DA SEMANA", "PARTICIPANTE", "FOLGA"].forEach((v, i) =>
          label(
            v,
            left + col[i] + 8,
            y + 9,
            (col[i + 1] ?? width) - col[i] - 12,
            8,
            true,
            "#ffffff",
          ),
        );
        y += 27;
      };
      masthead();
      y = label("Relatório geral de folgas", left, y + 27, width, 24, true) + 8;
      y =
        label(data.campaign.name, left, y, width, 15, true, colors.muted) + 18;
      const emitted = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(data.generatedAt);
      y =
        label(
          `Período: ${dateBR(data.campaign.start)} a ${dateBR(data.campaign.end)}`,
          left,
          y,
          width,
          10,
        ) + 5;
      y =
        label(
          `Emissão: ${emitted} (Brasília)   |   Campanha: ${data.campaign.status}`,
          left,
          y,
          width,
          9,
          false,
          colors.muted,
        ) + 17;
      line(y);
      y += 15;
      const count = new Set(data.reservations.map((r) => r.participantId)).size;
      const metrics = [
        [String(count).padStart(2, "0"), "Participantes com folgas"],
        [
          String(data.reservations.length).padStart(2, "0"),
          "Folgas selecionadas",
        ],
        [
          String(data.campaign.maxFolgas).padStart(2, "0"),
          "Limite por participante",
        ],
      ];
      metrics.forEach(([value, caption], i) => {
        const x = left + (i * width) / 3;
        label(value, x, y, width / 3, 29, true, colors.navy, "center");
        label(caption, x, y + 38, width / 3, 9, false, colors.muted, "center");
        if (i)
          doc
            .moveTo(x, y + 3)
            .lineTo(x, y + 53)
            .lineWidth(0.5)
            .strokeColor(colors.line)
            .stroke();
      });
      y += 70;
      line(y);
      headings();
      const ordinals = new Map<number, number>();
      const rows = [...data.reservations].sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.participantId - b.participantId,
      );
      rows.forEach((r, index) => {
        const nameWidth = width - 208 - 48 - 16;
        doc.font("Helvetica").fontSize(10);
        const rowHeight = Math.max(
          33,
          doc.heightOfString(text(r.name), { width: nameWidth, lineGap: 2 }) +
            18,
        );
        if (y + rowHeight > bottom) {
          doc.addPage();
          masthead();
          y =
            label(
              data.campaign.name + " - continuação",
              left,
              y + 17,
              width,
              12,
              true,
            ) + 4;
          headings();
        }
        if (index % 2) doc.rect(left, y, width, rowHeight).fill(colors.soft);
        label(dateBR(r.date), left + 8, y + 10, 88, 10, true);
        const weekday = new Intl.DateTimeFormat("pt-BR", {
          weekday: "long",
          timeZone: "UTC",
        }).format(new Date(r.date + "T12:00:00Z"));
        label(
          weekday.charAt(0).toUpperCase() + weekday.slice(1),
          left + 107,
          y + 10,
          93,
          9.5,
        );
        label(r.name, left + 216, y + 9, nameWidth, 10);
        const ordinal = (ordinals.get(r.participantId) ?? 0) + 1;
        ordinals.set(r.participantId, ordinal);
        label(
          `${ordinal}ª`,
          left + width - 48,
          y + 10,
          48,
          10,
          false,
          colors.navy,
          "center",
        );
        y += rowHeight;
        line(y);
      });
      if (!rows.length) {
        y =
          label(
            "Nenhuma folga confirmada nesta campanha.",
            left + 12,
            y + 20,
            width - 24,
            11,
            false,
            colors.muted,
          ) + 18;
      }
      if (y + 75 > doc.page.height - 75) {
        doc.addPage();
        masthead();
      }
      y = label("Critérios do relatório", left, y + 25, width, 11, true) + 7;
      label(
        "Somente reservas confirmadas. Ordenação por data. Informações consolidadas no momento da emissão. Alterações posteriores não estão refletidas neste documento.",
        left,
        y,
        width,
        9,
        false,
        colors.muted,
      );
      const pages = doc.bufferedPageRange();
      for (let page = 0; page < pages.count; page++) {
        doc.switchToPage(page);
        const footer = doc.page.height - 55;
        line(footer, colors.blue, 0.7);
        label(
          "SIREL Folgas - Relatório administrativo",
          left,
          footer + 12,
          width - 100,
          8,
          false,
          colors.muted,
        );
        label(
          `Página ${page + 1} de ${pages.count}`,
          left + width - 100,
          footer + 12,
          100,
          8,
          false,
          colors.muted,
          "right",
        );
      }
      doc.end();
    } catch (error) {
      reject(error);
      doc.end();
    }
  });
}
