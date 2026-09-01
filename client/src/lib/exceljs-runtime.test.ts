import { Workbook } from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { exportCadastrosToXlsx } from "./export-cadastros";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("integração do ExcelJS", () => {
  it("serializa e reabre uma regra data bar sem gradiente", async () => {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Dados");

    worksheet.addRows([
      ["Nome", "Pontuação"],
      ["Fornecedor A", 75],
      ["Fornecedor B", 92],
    ]);
    worksheet.addConditionalFormatting({
      ref: "B2:B3",
      rules: [
        {
          type: "dataBar",
          priority: 1,
          gradient: false,
          cfvo: [{ type: "min" }, { type: "max" }],
        },
      ],
    });

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);

    const restored = new Workbook();
    await restored.xlsx.load(buffer);

    expect(restored.getWorksheet("Dados")?.getCell("A2").value).toBe(
      "Fornecedor A",
    );
    expect(restored.getWorksheet("Dados")?.getCell("B3").value).toBe(92);
  });

  it("mantém a exportação de cadastros compatível com o novo pacote", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:planilha-cadastros");
    const revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    await exportCadastrosToXlsx("pessoas.xlsx", "Pessoas", [
      { nome: "Ana", cpf: "000.000.000-00" },
    ]);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:planilha-cadastros");
  });
});
