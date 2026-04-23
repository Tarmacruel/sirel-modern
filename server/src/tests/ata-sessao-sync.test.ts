import { describe, expect, it } from "vitest";

import {
  ataTokenSimilarity,
  buildAtaSessaoSuggestedProcesses,
  normalizeAtaIdentifier,
  resolveAtaLotItemMatch,
} from "../lib/ata-sessao-sync.js";

describe("ata sessao sync", () => {
  it("prioritizes process with matching edital and administrative number", () => {
    const suggestions = buildAtaSessaoSuggestedProcesses({
      edital: "PE-029-2026",
      processoAdministrativo: "1657/2025",
      candidates: [
        {
          id: 1,
          numeroSirel: "SIR-001",
          numeroEdital: "PE-029-2026",
          numeroAdministrativo: "1657/2025",
          objeto: "Medicamentos",
          moduloAtual: "LICITACAO",
          anoReferencia: 2026,
          atualizadoEm: new Date("2026-04-20T10:00:00Z"),
        },
        {
          id: 2,
          numeroSirel: "SIR-002",
          numeroEdital: "PE-029-2026",
          numeroAdministrativo: "9999/2025",
          objeto: "Medicamentos",
          moduloAtual: "PLANEJAMENTO",
          anoReferencia: 2026,
          atualizadoEm: new Date("2026-04-21T10:00:00Z"),
        },
      ],
    });

    expect(suggestions[0]?.processId).toBe(1);
    expect(suggestions[0]?.level).toBe("ALTO");
    expect(suggestions[0]?.score).toBe(100);
  });

  it("returns medium confidence when only the administrative number matches", () => {
    const suggestions = buildAtaSessaoSuggestedProcesses({
      edital: "PE-888-2026",
      processoAdministrativo: "1657/2025",
      candidates: [
        {
          id: 1,
          numeroSirel: "SIR-003",
          numeroEdital: "PE-029-2026",
          numeroAdministrativo: "1657/2025",
          objeto: "Medicamentos",
          moduloAtual: "LICITACAO",
          anoReferencia: 2025,
          atualizadoEm: new Date("2026-04-21T10:00:00Z"),
        },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.level).toBe("MEDIO");
    expect(suggestions[0]?.score).toBe(68);
  });

  it("matches by item number when the ata points to the global process item", () => {
    const match = resolveAtaLotItemMatch(
      {
        numero_lote: 7,
        status: "EM ADJUDICACAO",
        titulo: "Lote 7",
        itens: [
          {
            item_numero: "14",
            descricao: "Aciclovir comprimido 200mg",
          },
        ],
      },
      [
        {
          id: 11,
          numeroItem: 14,
          descricao: "Aciclovir comprimido 200mg",
          quantidade: "100.000",
          unidade: "CO",
          loteId: null,
          loteNumero: null,
        },
      ],
    );

    expect(match.status).toBe("MATCHED");
    expect(match.matchedItem?.id).toBe(11);
    expect(match.reason).toContain("item");
  });

  it("prefers the internal lot mapping when the ata resets item_numero inside each lot", () => {
    const match = resolveAtaLotItemMatch(
      {
        numero_lote: 225,
        status: "ADJUDICADO",
        titulo: "36910 GLIBENCLAMIDA:5MG.:GLIBENCLAMIDA:5MG. COTA DE 25% RESERVADA PARA ME/EPP.",
        itens: [
          {
            item_numero: "1",
            descricao:
              "36910 GLIBENCLAMIDA:5MG.:GLIBENCLAMIDA:5MG. COTA DE 25% RESERVADA PARA ME/EPP.",
          },
        ],
      },
      [
        {
          id: 342,
          numeroItem: 1,
          descricao:
            "9901100288 ACEBROFILINA:10mg/ml, xarope, frasco com 120ml. EXCLUSIVO PARA ME/EPP.",
          quantidade: "100.000",
          unidade: "FR",
          loteId: null,
          loteNumero: "1",
        },
        {
          id: 566,
          numeroItem: 225,
          descricao:
            "36910 GLIBENCLAMIDA:5MG.:GLIBENCLAMIDA:5MG. COTA DE 25% RESERVADA PARA ME/EPP.",
          quantidade: "451450.000",
          unidade: "CO",
          loteId: null,
          loteNumero: "225",
        },
      ],
    );

    expect(match.status).toBe("MATCHED");
    expect(match.matchedItem?.id).toBe(566);
    expect(match.reason).toContain("lote");
  });

  it("does not trust a local ata item number when the description clearly points elsewhere", () => {
    const match = resolveAtaLotItemMatch(
      {
        numero_lote: 225,
        status: "ADJUDICADO",
        titulo: "36910 GLIBENCLAMIDA:5MG.:GLIBENCLAMIDA:5MG. COTA DE 25% RESERVADA PARA ME/EPP.",
        itens: [
          {
            item_numero: "1",
            descricao:
              "36910 GLIBENCLAMIDA:5MG.:GLIBENCLAMIDA:5MG. COTA DE 25% RESERVADA PARA ME/EPP.",
          },
        ],
      },
      [
        {
          id: 342,
          numeroItem: 1,
          descricao:
            "9901100288 ACEBROFILINA:10mg/ml, xarope, frasco com 120ml. EXCLUSIVO PARA ME/EPP.",
          quantidade: "100.000",
          unidade: "FR",
          loteId: null,
          loteNumero: null,
        },
        {
          id: 566,
          numeroItem: 225,
          descricao:
            "36910 GLIBENCLAMIDA:5MG.:GLIBENCLAMIDA:5MG. COTA DE 25% RESERVADA PARA ME/EPP.",
          quantidade: "451450.000",
          unidade: "CO",
          loteId: null,
          loteNumero: null,
        },
      ],
    );

    expect(match.status).toBe("MATCHED");
    expect(match.matchedItem?.id).toBe(566);
    expect(match.reason).toContain("descri");
  });

  it("marks ambiguity when more than one item has a similar description", () => {
    const match = resolveAtaLotItemMatch(
      {
        numero_lote: 1,
        status: "JULGAMENTO",
        titulo: "Aquisicao de caneta esferografica azul",
        itens: [
          {
            descricao: "Caneta esferografica azul",
          },
        ],
      },
      [
        {
          id: 21,
          numeroItem: 1,
          descricao: "Caneta esferografica azul fina",
          quantidade: "100.000",
          unidade: "UN",
          loteId: null,
          loteNumero: null,
        },
        {
          id: 22,
          numeroItem: 2,
          descricao: "Caneta esferografica azul media",
          quantidade: "100.000",
          unidade: "UN",
          loteId: null,
          loteNumero: null,
        },
      ],
    );

    expect(match.status).toBe("AMBIGUOUS");
    expect(match.matchedItem).toBeNull();
  });

  it("normalizes identifiers and text similarity", () => {
    expect(normalizeAtaIdentifier(" PE-029/2026 ")).toBe("PE0292026");
    expect(
      ataTokenSimilarity("medicamento aciclovir", "aciclovir medicamento"),
    ).toBe(1);
  });
});
