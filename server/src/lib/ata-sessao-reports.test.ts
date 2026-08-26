import { describe, expect, it } from "vitest";

import {
  isAtaSessaoReportInputError,
  matchEstimateRowForLot,
  type ParsedAtaLot,
  type ProcessEstimateRow,
} from "./ata-sessao-reports.js";

function processRow(
  overrides: Partial<ProcessEstimateRow>,
): ProcessEstimateRow {
  return {
    itemId: 1,
    numeroItem: 1,
    descricao: "CIMENTO CP II",
    quantidade: "10",
    unidade: "SC",
    valorUnitarioEstimadoBase: "30.00",
    valorTotalEstimadoBase: "300.00",
    loteNumero: null,
    resultadoLoteNumero: null,
    loteValorEstimado: null,
    valorEstimadoUnitario: null,
    valorEstimadoTotal: null,
    ...overrides,
  };
}

function failedLot(overrides: Partial<ParsedAtaLot>): ParsedAtaLot {
  return {
    numero_lote: 2,
    status: "FRACASSADO",
    titulo: "AREIA LAVADA GROSSA",
    itens: [
      {
        item_numero: "1",
        descricao: "AREIA LAVADA GROSSA",
        quantidade: 20,
        unidade: "M3",
      },
    ],
    ...overrides,
  };
}

describe("ata sessao estimated value matching", () => {
  it("does not treat the BLL local item 1 as the global process item", () => {
    const itemOne = processRow({ itemId: 101 });
    const itemTwo = processRow({
      itemId: 102,
      numeroItem: 2,
      descricao: "AREIA LAVADA GROSSA",
      quantidade: "20",
      unidade: "M3",
    });

    const match = matchEstimateRowForLot(failedLot({}), [itemOne, itemTwo]);

    expect(match?.row.itemId).toBe(102);
    expect(match?.reason).toBe("melhor_candidato");
  });

  it("rejects an unconfirmed local item number", () => {
    const match = matchEstimateRowForLot(
      failedLot({
        numero_lote: 7,
        titulo: "TUBO DE CONCRETO ARMADO",
        itens: [
          {
            item_numero: "1",
            descricao: "TUBO DE CONCRETO ARMADO",
            quantidade: 12,
            unidade: "UN",
          },
        ],
      }),
      [processRow({ itemId: 101 })],
    );

    expect(match).toBeNull();
  });

  it("accepts an explicit one-to-one lot relationship", () => {
    const row = processRow({
      itemId: 207,
      numeroItem: 1,
      loteNumero: 7,
      descricao: "DESCRICAO INTERNA RESUMIDA",
    });

    const match = matchEstimateRowForLot(failedLot({ numero_lote: 7 }), [row]);

    expect(match?.row.itemId).toBe(207);
    expect(match?.reason).toBe("lote");
  });

  it("rejects a fuzzy tie instead of guessing", () => {
    const rows = [
      processRow({
        itemId: 301,
        numeroItem: 3,
        descricao: "AREIA LAVADA GROSSA TIPO A",
        quantidade: "20",
        unidade: "M3",
      }),
      processRow({
        itemId: 302,
        numeroItem: 4,
        descricao: "AREIA LAVADA GROSSA TIPO B",
        quantidade: "20",
        unidade: "M3",
      }),
    ];

    expect(matchEstimateRowForLot(failedLot({}), rows)).toBeNull();
  });
});

describe("ata sessao parser error classification", () => {
  it("classifies an SD without text layer as an input error", () => {
    expect(
      isAtaSessaoReportInputError(
        new Error("PDF sem camada de texto detectável. Gere OCR."),
      ),
    ).toBe(true);
  });

  it("classifies an SD without an identifiable number as an input error", () => {
    expect(
      isAtaSessaoReportInputError(
        new Error("Número da SD não identificado no documento."),
      ),
    ).toBe(true);
  });

  it("does not classify an infrastructure failure as an input error", () => {
    expect(isAtaSessaoReportInputError(new Error("ECONNREFUSED"))).toBe(false);
  });
});
