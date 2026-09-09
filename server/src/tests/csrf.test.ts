import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { ensureCsrfCookie, hasValidCsrfToken } from "../lib/csrf.js";

function request(headers: Record<string, string | undefined> = {}) {
  return { headers } as Request;
}

describe("recuperação do cookie CSRF na sessão", () => {
  it("recupera o cookie ausente e permite a próxima requisição com o token", () => {
    const cookie = vi.fn();
    const req = request({ cookie: "sirel_session=sessao-existente" });
    expect(hasValidCsrfToken(req)).toBe(false);

    ensureCsrfCookie(req, { cookie } as unknown as Response);

    expect(cookie).toHaveBeenCalledOnce();
    const [name, token, options] = cookie.mock.calls[0]!;
    expect(name).toBe("sirel_csrf");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(options).toMatchObject({ httpOnly: false, sameSite: "lax", path: "/" });
    expect(hasValidCsrfToken(request({
      cookie: `${name}=${token}`,
      "x-sirel-csrf": token,
      "sec-fetch-site": "same-origin",
    }))).toBe(true);
  });

  it("preserva o token existente para as outras abas", () => {
    const cookie = vi.fn();
    ensureCsrfCookie(request({ cookie: "sirel_csrf=token-existente" }), { cookie } as unknown as Response);
    expect(cookie).not.toHaveBeenCalled();
  });

  it("continua rejeitando cabeçalho ausente, divergente e requisição cross-site", () => {
    for (const headers of [
      { cookie: "sirel_csrf=token" },
      { cookie: "sirel_csrf=token", "x-sirel-csrf": "outro" },
      { cookie: "sirel_csrf=token", "x-sirel-csrf": "token", "sec-fetch-site": "cross-site" },
    ]) {
      expect(hasValidCsrfToken(request(headers))).toBe(false);
    }
  });
});
