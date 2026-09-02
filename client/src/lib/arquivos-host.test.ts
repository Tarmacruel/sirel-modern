import { describe, expect, it } from "vitest";

import { matchesArquivosHostname, shouldRedirectArquivosRoot } from "./arquivos-host";

describe("SIREL Arquivos - hostname", () => {
  it("reconhece o subdomínio configurado sem diferenciar caixa", () => {
    expect(matchesArquivosHostname("ARQUIVOS.SIREL.COM.BR", "arquivos.sirel.com.br")).toBe(true);
  });

  it("não altera o comportamento do domínio principal", () => {
    expect(matchesArquivosHostname("sirel.com.br", "arquivos.sirel.com.br")).toBe(false);
  });

  it("redireciona apenas a raiz do host de arquivos", () => {
    expect(shouldRedirectArquivosRoot("arquivos.sirel.com.br", "/")).toBe(true);
    expect(shouldRedirectArquivosRoot("arquivos.sirel.com.br", "/arquivos")).toBe(false);
    expect(shouldRedirectArquivosRoot("sirel.com.br", "/")).toBe(false);
  });
});
