import { describe, expect, it } from "vitest";

import {
  buildResultadoItemStatus,
  calculateResumoEconomiaMetrics,
  hasAwardedResult,
  mergeBuiltItemValueSources,
} from "./dossie-autonomia.js";

function makeBaseRow() {
  return {
    itemProcessoId: 1,
    numeroItem: 9,
    numeroLote: null,
    valorEstimadoUnitario: 10,
    valorEstimadoTotal: 100,
    valorLanceVencedorUnitario: null,
    valorLanceVencedorTotal: null,
    percentualDesconto: null,
    economiaObtida: null,
    fornecedorVencedorId: null,
    fornecedorVencedorNome: null,
    fornecedorVencedorCnpj: null,
    itemHomologado: false,
    itemDeserto: false,
    itemFracassado: false,
    motivoFracasso: null,
    dataHomologacao: null,
    origemAlteracao: "DOSSIE_REFRESH",
    statusResumo: "NAO_IDENTIFICADO",
  };
}

describe("dossie autonomia merge", () => {
  it("fills missing lot and supplier data from ata fallback", () => {
    const merged = mergeBuiltItemValueSources({
      base: makeBaseRow(),
      ataFallback: {
        numeroLote: "9",
        valorLanceVencedorUnitario: 4.45,
        valorLanceVencedorTotal: 44.5,
        percentualDesconto: 55.5,
        economiaObtida: 55.5,
        fornecedorVencedorId: 77,
        fornecedorVencedorNome: "Calixto Medicamentos Ltda",
        fornecedorVencedorCnpj: "12345678000190",
        origemAlteracao: "DOSSIE_REFRESH:ATA_FALLBACK",
        statusResumo: "ADJUDICADO",
      },
    });

    expect(merged.numeroLote).toBe("9");
    expect(merged.fornecedorVencedorId).toBe(77);
    expect(merged.fornecedorVencedorNome).toBe("Calixto Medicamentos Ltda");
    expect(merged.fornecedorVencedorCnpj).toBe("12345678000190");
    expect(merged.valorLanceVencedorUnitario).toBe(4.45);
    expect(merged.valorLanceVencedorTotal).toBe(44.5);
    expect(merged.percentualDesconto).toBe(55.5);
    expect(merged.economiaObtida).toBe(55.5);
    expect(merged.statusResumo).toBe("ADJUDICADO");
    expect(merged.origemAlteracao).toBe("DOSSIE_REFRESH:ATA_FALLBACK");
  });

  it("preserves current refresh data when previous row has conflicting values", () => {
    const merged = mergeBuiltItemValueSources({
      base: {
        ...makeBaseRow(),
        numeroLote: "53",
        valorLanceVencedorTotal: 2077,
        fornecedorVencedorNome: "Vertice Medicamentos Ltda",
      },
      previous: {
        numeroLote: "52",
        valorLanceVencedorTotal: 3100,
        fornecedorVencedorNome: "Outro Fornecedor Ltda",
        origemAlteracao: "ATA_SESSAO:14",
      },
    });

    expect(merged.numeroLote).toBe("53");
    expect(merged.valorLanceVencedorTotal).toBe(2077);
    expect(merged.fornecedorVencedorNome).toBe("Vertice Medicamentos Ltda");
    expect(merged.origemAlteracao).toBe("DOSSIE_REFRESH");
  });

  it("marks awarded items as adjudicado only when there is a supplier", () => {
    expect(
      hasAwardedResult({
        fornecedorVencedorNome: "Fornecedor Exemplo Ltda",
        itemHomologado: false,
        itemFracassado: false,
        itemDeserto: false,
      }),
    ).toBe(true);

    expect(
      hasAwardedResult({
        valorLanceVencedorTotal: 100,
        itemHomologado: false,
        itemFracassado: false,
        itemDeserto: false,
      }),
    ).toBe(false);

    expect(
      buildResultadoItemStatus({
        fornecedorVencedorNome: "Fornecedor Exemplo Ltda",
        itemHomologado: false,
        itemFracassado: false,
        itemDeserto: false,
      }),
    ).toBe("ADJUDICADO");
  });

  it("uses the process estimate when awarded items have no item estimate", () => {
    const resumo = calculateResumoEconomiaMetrics({
      itemEstimatedTotals: [],
      awardedEstimatedTotals: [null],
      awardedWinnerTotals: [11684.6],
      processEstimatedTotal: 24559,
      processAwardedTotal: null,
      hasAwardedItems: true,
    });

    expect(resumo.valorEstimadoTotal).toBe(24559);
    expect(resumo.valorVencedorTotal).toBe(11684.6);
    expect(resumo.economiaTotal).toBe(12874.4);
    expect(resumo.percentualEconomia).toBe(52.4223);
  });
});
