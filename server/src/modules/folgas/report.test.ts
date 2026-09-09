import { describe, expect, it } from "vitest";
import { renderFolgasReport, type FolgasReportData } from "./report.js";

const report: FolgasReportData = {
  organization: "PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS",
  campaign: {
    id: 1,
    name: "Folgas 7 de setembro",
    start: "2026-09-08",
    end: "2026-12-31",
    status: "RASCUNHO",
    maxFolgas: 2,
  },
  generatedAt: new Date("2026-09-09T12:00:00Z"),
  reservations: [],
};
const pageCount = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
describe("PDF de Folgas", () => {
  it("gera relatórios vazio e curto legíveis em uma única página", async () => {
    const pdf = await renderFolgasReport(report);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
    const compact = await renderFolgasReport({
      ...report,
      reservations: Array.from({ length: 8 }, (_, i) => ({
        date: `2026-09-${String(i + 9).padStart(2, "0")}`,
        participantId: Math.floor(i / 2),
        name: `Participante ${Math.floor(i / 2) + 1}`,
      })),
    });
    expect(pageCount(compact)).toBe(1);
  });
  it("pagina relações extensas e nomes longos sem modificar os registros", async () => {
    const reservations = Array.from({ length: 40 }, (_, i) => ({
      date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
      participantId: i + 1,
      name:
        i === 0
          ? "Nome composto muito longo para conferir quebra de linhas "
              .repeat(3)
              .slice(0, 180)
          : `Participante de validação ${i + 1}`,
    })).reverse();
    const original = JSON.stringify(reservations);
    const pdf = await renderFolgasReport({ ...report, reservations });
    expect(pageCount(pdf)).toBeGreaterThan(1);
    expect(pageCount(pdf)).toBeLessThanOrEqual(5);
    expect(JSON.stringify(reservations)).toBe(original);
  });
});
