import { describe, expect, it } from "vitest";

import {
  isTransparencyPortalHost,
  isTransparencyPortalPathAllowed,
  isTransparencyPortalProcedurePath,
  isTransparencyPortalRequest,
  isTransparencyPortalSameOrigin,
} from "./transparency-portal-host.js";

describe("isTransparencyPortalHost", () => {
  it.each([
    "transparencia.sirel.com.br",
    "TRANSPARENCIA.SIREL.COM.BR",
    "transparencia.sirel.com.br:443",
    "transparencia.sirel.com.br.",
    "https://transparencia.sirel.com.br/",
    "transparencia.sirel.com.br, www.sirel.com.br",
  ])("reconhece o host publico autorizado: %s", (host) => {
    expect(isTransparencyPortalHost(host)).toBe(true);
  });

  it.each([
    "",
    "www.sirel.com.br",
    "documentos.sirel.com.br",
    "transparencia.sirel.com.br.evil.example",
    "evil-transparencia.sirel.com.br",
  ])("rejeita host que nao e o portal: %s", (host) => {
    expect(isTransparencyPortalHost(host)).toBe(false);
  });

  it("usa o hostname ja resolvido pelo Express para requests", () => {
    expect(
      isTransparencyPortalRequest({
        hostname: "transparencia.sirel.com.br",
      }),
    ).toBe(true);
    expect(isTransparencyPortalRequest({ hostname: "www.sirel.com.br" })).toBe(
      false,
    );
  });

  it("restringe a fronteira publica aos procedimentos e downloads allowlisted", () => {
    expect(
      isTransparencyPortalProcedurePath(
        "/api/trpc/portalPublico.processos,portalPublico.documentos,portalPublico.classificacoes",
      ),
    ).toBe(true);
    expect(
      isTransparencyPortalProcedurePath(
        "/api/trpc/portalPublico.processos,auth.me",
      ),
    ).toBe(false);

    expect(
      isTransparencyPortalPathAllowed(
        "/api/trpc/portalPublico.processos",
        "GET",
      ),
    ).toBe(true);
    expect(
      isTransparencyPortalPathAllowed(
        "/api/publico/documentos/capacidade-opaca/download",
        "GET",
      ),
    ).toBe(true);
    expect(
      isTransparencyPortalPathAllowed(
        "/api/planejamento/documentos/1/download",
        "GET",
      ),
    ).toBe(false);
    expect(
      isTransparencyPortalPathAllowed(
        "/api/trpc/portalPublico.processos",
        "POST",
      ),
    ).toBe(false);
  });

  it("aceita apenas a origem publica na fronteira de transparencia", () => {
    expect(isTransparencyPortalSameOrigin(undefined)).toBe(true);
    expect(
      isTransparencyPortalSameOrigin("https://transparencia.sirel.com.br"),
    ).toBe(true);
    expect(isTransparencyPortalSameOrigin("https://www.sirel.com.br")).toBe(
      false,
    );
  });
});
