import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import multer from "multer";
import { afterEach, describe, expect, it } from "vitest";

import {
  ataSessaoMulterClientErrorMessage,
  collectMulterFilePaths,
  hasPdfFileSignature,
  removeAutomaticReportDirectory,
  removeTransientUploadFiles,
} from "./ata-sessao-upload.js";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "sirel-ata-upload-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("hasPdfFileSignature", () => {
  it("reconhece a assinatura no cabecalho sem varrer o arquivo inteiro", () => {
    const directory = createTemporaryDirectory();
    const validPdf = join(directory, "valid.pdf");
    const lateSignature = join(directory, "late.pdf");
    writeFileSync(validPdf, Buffer.from("prefixo\n%PDF-1.7\nconteudo"));
    writeFileSync(
      lateSignature,
      Buffer.concat([Buffer.alloc(1025, 0x20), Buffer.from("%PDF-1.7")]),
    );

    expect(hasPdfFileSignature(validPdf)).toBe(true);
    expect(hasPdfFileSignature(lateSignature)).toBe(false);
  });
});

describe("limpeza segura dos arquivos da Ata e SD", () => {
  it("remove somente uploads estritamente contidos no diretorio permitido", () => {
    const directory = createTemporaryDirectory();
    const uploadsDirectory = join(directory, "uploads");
    const internalFile = join(uploadsDirectory, "ata.pdf");
    const externalFile = join(directory, "fora.pdf");
    mkdirSync(uploadsDirectory, { recursive: true });
    writeFileSync(internalFile, "%PDF-1.7");
    writeFileSync(externalFile, "%PDF-1.7");

    const removed = removeTransientUploadFiles(
      [internalFile, externalFile, uploadsDirectory],
      uploadsDirectory,
    );

    expect(removed).toEqual([internalFile]);
    expect(existsSync(internalFile)).toBe(false);
    expect(existsSync(externalFile)).toBe(true);
    expect(existsSync(uploadsDirectory)).toBe(true);
  });

  it("remove somente um output automatico filho da raiz de relatorios", () => {
    const directory = createTemporaryDirectory();
    const reportsDirectory = join(directory, "reports");
    const automaticOutput = join(reportsDirectory, "123-ata");
    const externalOutput = join(directory, "explicit-output");
    mkdirSync(automaticOutput, { recursive: true });
    mkdirSync(externalOutput, { recursive: true });
    writeFileSync(join(automaticOutput, "parcial.json"), "{}");

    expect(
      removeAutomaticReportDirectory(automaticOutput, reportsDirectory),
    ).toBe(true);
    expect(existsSync(automaticOutput)).toBe(false);
    expect(
      removeAutomaticReportDirectory(externalOutput, reportsDirectory),
    ).toBe(false);
    expect(existsSync(externalOutput)).toBe(true);
    expect(existsSync(reportsDirectory)).toBe(true);
  });
});

describe("contrato de erros do Multer", () => {
  it("mapeia erros de limite e campos para mensagens de cliente", () => {
    expect(
      ataSessaoMulterClientErrorMessage(
        new multer.MulterError("LIMIT_FILE_SIZE", "arquivo"),
      ),
    ).toContain("25 MB");
    expect(
      ataSessaoMulterClientErrorMessage(
        new multer.MulterError("LIMIT_UNEXPECTED_FILE", "outro"),
      ),
    ).toContain("sdArquivo");
    expect(ataSessaoMulterClientErrorMessage(new Error("interno"))).toBeNull();
  });

  it("coleta caminhos tanto do formato fields quanto do formato array", () => {
    expect(
      collectMulterFilePaths({
        arquivo: [{ path: "ata.pdf" }],
        sdArquivo: [{ path: "sd.pdf" }],
      }),
    ).toEqual(["ata.pdf", "sd.pdf"]);
    expect(collectMulterFilePaths([{ path: "ata.pdf" }])).toEqual(["ata.pdf"]);
  });
});
