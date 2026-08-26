import { describe, expect, it } from "vitest";

import { hasValidCsrfToken } from "./csrf.js";

describe("csrf", () => {
  it("exige cookie e cabecalho coincidentes em contexto same-origin", () => {
    const request = {
      headers: {
        cookie: "sirel_csrf=token-seguro",
        "x-sirel-csrf": "token-seguro",
        "sec-fetch-site": "same-origin",
      },
    };
    expect(hasValidCsrfToken(request as never)).toBe(true);
  });

  it("rejeita token ausente, divergente ou cross-site", () => {
    expect(hasValidCsrfToken({ headers: { cookie: "sirel_csrf=a", "x-sirel-csrf": "b" } } as never)).toBe(false);
    expect(hasValidCsrfToken({ headers: { cookie: "sirel_csrf=a", "x-sirel-csrf": "a", "sec-fetch-site": "cross-site" } } as never)).toBe(false);
  });
});
