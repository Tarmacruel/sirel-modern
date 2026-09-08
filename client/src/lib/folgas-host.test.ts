import { afterEach, describe, expect, it, vi } from "vitest";
import { isFolgasHost } from "./folgas-host";
afterEach(() => vi.unstubAllEnvs());
describe("Folgas: roteamento por hostname", () => {
  it("reconhece plural e alias, sem afetar domínio principal ou outros módulos", () => {
    expect(isFolgasHost("FOLGAS.SIREL.COM.BR")).toBe(true);
    expect(isFolgasHost("folga.sirel.com.br")).toBe(true);
    for (const host of [
      "www.sirel.com.br",
      "sirel.com.br",
      "arquivos.sirel.com.br",
      "transparencia.sirel.com.br",
      "folgas.sirel.com.br.example.com",
    ])
      expect(isFolgasHost(host)).toBe(false);
  });
  it("respeita a lista opcional do ambiente", () => {
    vi.stubEnv("VITE_FOLGAS_HOSTNAMES", "teste.localhost, FOLGAS.SIREL.COM.BR");
    expect(isFolgasHost("teste.localhost")).toBe(true);
    expect(isFolgasHost("folga.sirel.com.br")).toBe(false);
  });
});
