import { describe, expect, it } from "vitest";

import { sanitizeTrpcErrorMessage } from "./trpc.js";

describe("sanitizeTrpcErrorMessage", () => {
  it("oculta detalhes tecnicos de falhas internas", () => {
    expect(
      sanitizeTrpcErrorMessage(
        "INTERNAL_SERVER_ERROR",
        'Failed query: select * from "pessoas"',
      ),
    ).toBe("Falha interna ao processar a solicitacao.");
  });

  it("preserva mensagens seguras de erros esperados", () => {
    expect(
      sanitizeTrpcErrorMessage("UNAUTHORIZED", "Login obrigatorio."),
    ).toBe("Login obrigatorio.");
  });
});
