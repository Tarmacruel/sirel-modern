import { describe, expect, it } from "vitest";

import {
  isAllowedCorsOrigin,
  resolveAllowedOrigins,
  resolvePrimaryClientOrigin,
  resolveSubsystemProductionOrigins,
} from "./cors-origins.js";

describe("resolveAllowedOrigins", () => {
  it("aceita CLIENT_URL com lista separada por virgula", () => {
    expect(
      resolveAllowedOrigins(
        "https://app.sirel.com.br, https://licitacao.sirel.com.br/",
      ),
    ).toEqual(["https://app.sirel.com.br", "https://licitacao.sirel.com.br"]);
  });
});

describe("resolvePrimaryClientOrigin", () => {
  it("usa a primeira origem configurada como base canonica", () => {
    expect(
      resolvePrimaryClientOrigin(
        "https://app.sirel.com.br,https://licitacao.sirel.com.br",
      ),
    ).toBe("https://app.sirel.com.br");
  });
});

describe("resolveSubsystemProductionOrigins", () => {
  it("deriva origens HTTPS dos hostnames oficiais dos subsistemas", () => {
    expect(resolveSubsystemProductionOrigins()).toContain(
      "https://licitacao.sirel.com.br",
    );
  });
});

describe("isAllowedCorsOrigin", () => {
  it("permite requests sem origin", () => {
    expect(isAllowedCorsOrigin(undefined, { nodeEnv: "production" })).toBe(true);
  });

  it("permite origem configurada explicitamente", () => {
    expect(
      isAllowedCorsOrigin("https://admin.sirel.com.br", {
        clientUrl: "https://app.sirel.com.br,https://admin.sirel.com.br",
        nodeEnv: "production",
      }),
    ).toBe(true);
  });

  it("bloqueia origem desconhecida em producao", () => {
    expect(
      isAllowedCorsOrigin("https://evil.example", {
        clientUrl: "https://app.sirel.com.br",
        nodeEnv: "production",
      }),
    ).toBe(false);
  });

  it("permite subdominio oficial cadastrado em producao", () => {
    expect(
      isAllowedCorsOrigin("https://licitacao.sirel.com.br", {
        clientUrl: "",
        nodeEnv: "production",
      }),
    ).toBe(true);
  });

  it("mantem localhost permitido fora de producao", () => {
    expect(
      isAllowedCorsOrigin("http://localhost:5173", {
        clientUrl: "",
        nodeEnv: "development",
      }),
    ).toBe(true);
  });

  it("permite quick tunnel do Cloudflare apenas fora de producao", () => {
    const origin = "https://interact-disposition-pty-venice.trycloudflare.com";

    expect(
      isAllowedCorsOrigin(origin, {
        clientUrl: "",
        nodeEnv: "development",
      }),
    ).toBe(true);

    expect(
      isAllowedCorsOrigin(origin, {
        clientUrl: "",
        nodeEnv: "production",
      }),
    ).toBe(false);
  });
});
