import { afterEach, describe, expect, it } from "vitest";

import { createSessionToken, verifySessionToken } from "./auth-session.js";

const originalSecret = process.env.JWT_SECRET;

afterEach(() => {
  process.env.JWT_SECRET = originalSecret;
});

describe("auth-session", () => {
  it("inclui versao de sessao e data de emissao no token", () => {
    process.env.JWT_SECRET = "test-secret";

    const token = createSessionToken({
      id: 10,
      username: "usuario.teste",
      name: "Usuario Teste",
      email: null,
      role: "operador",
      secretariaId: 2,
      sessionVersion: 4,
    });

    const payload = verifySessionToken(token);

    expect(payload?.sub).toBe(10);
    expect(payload?.sessionVersion).toBe(4);
    expect(payload?.iat).toBeTypeOf("number");
  });
});
