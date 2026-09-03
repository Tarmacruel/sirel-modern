import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { canIndexContent, extractIndexedContent } from "../modules/arquivos/content.js";

let testRoot = "";

beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "sirel-arquivos-content-"));
});

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("SIREL Arquivos - indice textual", () => {
  it("extrai texto de arquivos legiveis", async () => {
    const filePath = join(testRoot, "conteudo.txt");
    await writeFile(filePath, "Processo PE-059-2026 com documentos complementares.", "utf8");

    expect(canIndexContent("text")).toBe(true);
    await expect(extractIndexedContent(filePath, "text")).resolves.toContain("PE-059-2026");
  });

  it("ignora tipos sem extrator textual", async () => {
    const filePath = join(testRoot, "imagem.png");
    await writeFile(filePath, "dados", "utf8");

    expect(canIndexContent("image")).toBe(false);
    await expect(extractIndexedContent(filePath, "image")).resolves.toBeNull();
  });
});
