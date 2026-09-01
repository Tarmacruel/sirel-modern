import { describe, expect, it } from "vitest";

import { documentoEstaPublicamenteDisponivel } from "./document-publication.js";

describe("documentoEstaPublicamenteDisponivel", () => {
  it("exige intenção pública, aprovação e ausência de restrições", () => {
    expect(
      documentoEstaPublicamenteDisponivel({
        publico: true,
        statusPublicacao: "APROVADO",
        restritoA: [],
      }),
    ).toBe(true);

    expect(
      documentoEstaPublicamenteDisponivel({
        publico: true,
        statusPublicacao: "EM_REVISAO",
        restritoA: [],
      }),
    ).toBe(false);

    expect(
      documentoEstaPublicamenteDisponivel({
        publico: true,
        statusPublicacao: "APROVADO",
        restritoA: ["gestor"],
      }),
    ).toBe(false);
  });
});
