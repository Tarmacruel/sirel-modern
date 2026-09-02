import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

describe("SIREL Arquivos - tickets", () => {
  beforeAll(() => {
    process.env.ARQUIVOS_ENABLED = "true";
    process.env.ARQUIVOS_ROOT = process.cwd();
    process.env.ARQUIVOS_TICKET_SECRET = "segredo-de-teste-com-mais-de-16-caracteres";
  });


  afterEach(() => {
    vi.useRealTimers();
  });

  it("cria e valida ticket", async () => {
    const { createArquivosTicket, verifyArquivosTicket } = await import("../modules/arquivos/tickets.js");
    const token = createArquivosTicket({ userId: 10, relativePath: "docs/edital.pdf", mode: "preview" });
    const payload = verifyArquivosTicket(token, "preview");
    expect(payload.uid).toBe(10);
    expect(payload.path).toBe("docs/edital.pdf");
  });

  it("rejeita ticket adulterado", async () => {
    const { createArquivosTicket, verifyArquivosTicket } = await import("../modules/arquivos/tickets.js");
    const token = createArquivosTicket({ userId: 10, relativePath: "docs/edital.pdf", mode: "preview" });
    const bad = `${token.slice(0, -1)}x`;
    expect(() => verifyArquivosTicket(bad, "preview")).toThrow();
  });

  it("rejeita modo diferente", async () => {
    const { createArquivosTicket, verifyArquivosTicket } = await import("../modules/arquivos/tickets.js");
    const token = createArquivosTicket({ userId: 10, relativePath: "docs/edital.pdf", mode: "preview" });
    expect(() => verifyArquivosTicket(token, "download")).toThrow();
  });

  it("rejeita ticket expirado", async () => {
    const { createArquivosTicket, verifyArquivosTicket } = await import("../modules/arquivos/tickets.js");
    vi.useFakeTimers();
    const start = new Date("2026-09-02T12:00:00-03:00");
    vi.setSystemTime(start);
    const token = createArquivosTicket({ userId: 10, relativePath: "docs/edital.pdf", mode: "preview" });
    vi.setSystemTime(new Date(start.getTime() + 31 * 60 * 1000));
    expect(() => verifyArquivosTicket(token, "preview")).toThrow();
  });

});
