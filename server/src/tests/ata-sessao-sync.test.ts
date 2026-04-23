import { describe, expect, it } from "vitest";

import {
  ataTokenSimilarity,
  buildAtaSessaoSuggestedProcesses,
  normalizeAtaIdentifier,
  resolveAtaLotItemMatch,
} from "../lib/ata-sessao-sync.js";

describe("ata sessao sync", () => {
  it("prioriza processo com edital e administrativo coincidentes", () => {
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

  it("retorna sugestao media quando apenas o administrativo coincide", () => {
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

  it("associa item pelo numero do item quando a ata traz mapeamento direto", () => {
    const match = resolveAtaLotItemMatch(
      {
        numero_lote: 7,
        status: "EM ADJUDICAÇÃO",
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
    expect(match.reason).toContain("Número do item");
  });

  it("marca ambiguidade quando mais de um item tem descrição semelhante", () => {
    const match = resolveAtaLotItemMatch(
      {
        numero_lote: 1,
        status: "JULGAMENTO",
        titulo: "Aquisição de caneta esferográfica azul",
        itens: [
          {
            descricao: "Caneta esferográfica azul",
          },
        ],
      },
      [
        {
          id: 21,
          numeroItem: 1,
          descricao: "Caneta esferográfica azul fina",
          quantidade: "100.000",
          unidade: "UN",
          loteId: null,
          loteNumero: null,
        },
        {
          id: 22,
          numeroItem: 2,
          descricao: "Caneta esferográfica azul média",
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

  it("normaliza identificadores e similaridade textual", () => {
    expect(normalizeAtaIdentifier(" PE-029/2026 ")).toBe("PE0292026");
    expect(ataTokenSimilarity("medicamento aciclovir", "aciclovir medicamento")).toBe(1);
  });
});
