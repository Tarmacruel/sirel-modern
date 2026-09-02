import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { arquivosConfig } from "../modules/arquivos/config.js";
import { isBlockedExtension, normalizeRelativePath, safeResolve } from "../modules/arquivos/security.js";

let testRoot = "";
let originalRoot = "";
let originalEnabled = true;
let originalTicketSecret = "";

beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "sirel-arquivos-"));
  await writeFile(join(testRoot, "edital.pdf"), "teste");
  originalRoot = arquivosConfig.rootResolved;
  originalEnabled = arquivosConfig.enabled;
  originalTicketSecret = arquivosConfig.ticketSecret;
  arquivosConfig.rootResolved = testRoot;
  arquivosConfig.enabled = true;
  arquivosConfig.ticketSecret = "segredo-de-teste-com-mais-de-16-caracteres";
});

afterAll(async () => {
  arquivosConfig.rootResolved = originalRoot;
  arquivosConfig.enabled = originalEnabled;
  arquivosConfig.ticketSecret = originalTicketSecret;
  await rm(testRoot, { recursive: true, force: true });
});

describe("SIREL Arquivos - segurança de caminho", () => {
  it("normaliza caminho relativo", () => {
    expect(normalizeRelativePath("2026\\PE-059\\EDITAL.pdf")).toBe("2026/PE-059/EDITAL.pdf");
  });

  it("bloqueia traversal", () => {
    expect(() => normalizeRelativePath("../Windows/System32")).toThrow();
    expect(() => normalizeRelativePath("2026/../../Windows")).toThrow();
  });

  it("bloqueia caminho absoluto Windows", () => {
    expect(() => normalizeRelativePath("C:\\Windows\\System32")).toThrow();
  });

  it("bloqueia UNC", () => {
    expect(() => normalizeRelativePath("\\\\server\\share\\arquivo.pdf")).toThrow();
  });

  it("bloqueia Alternate Data Streams e nomes de dispositivos do Windows", () => {
    expect(() => normalizeRelativePath("2026/edital.pdf:segredo")).toThrow();
    expect(() => normalizeRelativePath("2026/CON.txt")).toThrow();
    expect(() => normalizeRelativePath("2026/NUL")).toThrow();
  });

  it("rejeita NUL, extensão bloqueada e resolve apenas dentro da raiz", async () => {
    expect(() => normalizeRelativePath("edital.pdf\0.exe")).toThrow();
    expect(isBlockedExtension("script.exe")).toBe(true);
    await expect(safeResolve("edital.pdf", { allowDirectory: false })).resolves.toMatchObject({
      relativePath: "edital.pdf",
      stat: expect.objectContaining({ isFile: expect.any(Function) }),
    });
    await expect(safeResolve("../fora.txt", { allowDirectory: false })).rejects.toThrow();
  });

});
