import { closeSync, openSync, readSync, rmSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import multer from "multer";

const PDF_HEADER_SCAN_BYTES = 1024;

export function hasPdfFileSignature(filePath: string) {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(filePath, "r");
    const header = Buffer.alloc(PDF_HEADER_SCAN_BYTES);
    const bytesRead = readSync(descriptor, header, 0, PDF_HEADER_SCAN_BYTES, 0);
    return header.subarray(0, bytesRead).toString("latin1").includes("%PDF-");
  } catch {
    return false;
  } finally {
    if (descriptor !== null) {
      closeSync(descriptor);
    }
  }
}

export function collectMulterFilePaths(files: unknown) {
  const candidates = Array.isArray(files)
    ? files
    : files && typeof files === "object"
      ? Object.values(files as Record<string, unknown>).flatMap((value) =>
          Array.isArray(value) ? value : [],
        )
      : [];

  return candidates
    .map((file) =>
      file && typeof file === "object" && "path" in file
        ? String((file as { path?: unknown }).path ?? "").trim()
        : "",
    )
    .filter(Boolean);
}

export function isStrictlyInsideDirectory(
  candidatePath: string,
  parentDirectory: string,
) {
  const relativePath = relative(
    resolve(parentDirectory),
    resolve(candidatePath),
  );
  return (
    Boolean(relativePath) &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..\\`) &&
    !relativePath.startsWith("../") &&
    !isAbsolute(relativePath)
  );
}

export function removeTransientUploadFiles(
  filePaths: Iterable<string>,
  uploadsDirectory: string,
) {
  const removed: string[] = [];
  for (const filePath of new Set(filePaths)) {
    if (!isStrictlyInsideDirectory(filePath, uploadsDirectory)) continue;
    try {
      rmSync(resolve(filePath), { force: true });
      removed.push(resolve(filePath));
    } catch {
      // A limpeza não deve substituir a resposta principal da requisição.
    }
  }
  return removed;
}

export function removeAutomaticReportDirectory(
  outputDirectory: string,
  reportsDirectory: string,
) {
  if (!isStrictlyInsideDirectory(outputDirectory, reportsDirectory)) {
    return false;
  }
  try {
    rmSync(resolve(outputDirectory), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export function ataSessaoMulterClientErrorMessage(error: unknown) {
  if (!(error instanceof multer.MulterError)) return null;

  switch (error.code) {
    case "LIMIT_FILE_SIZE":
      return "Cada arquivo PDF deve ter no máximo 25 MB.";
    case "LIMIT_FILE_COUNT":
    case "LIMIT_UNEXPECTED_FILE":
      return "Envie somente um PDF no campo arquivo e um PDF no campo sdArquivo.";
    case "LIMIT_FIELD_COUNT":
    case "LIMIT_FIELD_KEY":
    case "LIMIT_FIELD_VALUE":
    case "LIMIT_PART_COUNT":
      return "O formulário de upload da Ata BLL e da Solicitação de Despesa é inválido.";
    default:
      return "Não foi possível receber os PDFs enviados.";
  }
}
