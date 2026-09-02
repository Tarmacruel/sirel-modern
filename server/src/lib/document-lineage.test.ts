import { describe, expect, it } from "vitest";

import {
  isDocumentoVersaoPosterior,
  nextDocumentoVersao,
  resolveDocumentoRaizId,
} from "./document-lineage.js";

describe("linhagem de documentos", () => {
  it("mantem a raiz explicita e trata documentos legados como sua propria raiz", () => {
    expect(resolveDocumentoRaizId({ id: 22, documentoRaizId: 4 })).toBe(4);
    expect(resolveDocumentoRaizId({ id: 22, documentoRaizId: null })).toBe(22);
    expect(resolveDocumentoRaizId({ id: 22 })).toBe(22);
  });

  it("calcula a proxima versao dentro da linhagem, mesmo sem ordenacao", () => {
    expect(nextDocumentoVersao([])).toBe(1);
    expect(
      nextDocumentoVersao([{ versao: 3 }, { versao: 1 }, { versao: 2 }]),
    ).toBe(4);
  });

  it("ignora versoes invalidas ao encontrar a proxima versao", () => {
    expect(
      nextDocumentoVersao([
        { versao: 2 },
        { versao: 0 },
        { versao: -1 },
        { versao: Number.NaN },
      ]),
    ).toBe(3);
  });

  it("distingue somente versoes estritamente posteriores", () => {
    expect(isDocumentoVersaoPosterior({ versao: 2 }, { versao: 1 })).toBe(true);
    expect(isDocumentoVersaoPosterior({ versao: 2 }, { versao: 2 })).toBe(
      false,
    );
    expect(isDocumentoVersaoPosterior({ versao: 1 }, { versao: 2 })).toBe(
      false,
    );
  });
});
