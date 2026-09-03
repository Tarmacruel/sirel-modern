import {
  lstat,
  realpath,
  stat,
} from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { TRPCError } from "@trpc/server";

import { arquivosConfig, assertArquivosConfigured } from "./config.js";
import { extensionOf } from "./mime.js";

function normalizeForCompare(value: string) {
  const normalized = resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isInside(root: string, target: string) {
  const r = normalizeForCompare(root);
  const t = normalizeForCompare(target);
  return t === r || t.startsWith(`${r}${sep}`);
}

export function normalizeRelativePath(input: string | null | undefined) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  if (raw.includes("\0")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Caminho inválido." });
  }

  if (isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw) || /^\\\\/.test(raw)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Caminho absoluto não permitido." });
  }

  const slash = raw.replace(/\\/g, "/");
  const parts = slash.split("/").filter((part) => part && part !== ".");

  if (parts.some((part) => part === "..")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Caminho inválido." });
  }

  // Em NTFS, ":" pode selecionar Alternate Data Streams. Também evitamos nomes
  // de dispositivos DOS para impedir ambiguidades de resolução no Windows.
  const reservedWindowsName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  if (
    parts.some((part) => {
      const canonical = part.replace(/[. ]+$/g, "");
      return part.includes(":") || reservedWindowsName.test(canonical);
    })
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Nome de caminho não permitido." });
  }

  return parts.join("/");
}

export function normalizeNewFolderName(input: string | null | undefined) {
  const name = String(input ?? "").normalize("NFC").trim();
  const canonical = name.replace(/[. ]+$/g, "");
  const reservedWindowsName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.length > 180 ||
    /[\u0000-\u001f\u007f<>:"/\\|?*]/.test(name) ||
    canonical !== name ||
    reservedWindowsName.test(canonical)
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nome de pasta inválido." });
  }

  return name;
}

export function isBlockedExtension(name: string) {
  return arquivosConfig.blockedExtensions.has(extensionOf(name));
}

export async function safeResolve(
  relativePathInput: string | null | undefined,
  options: { mustExist?: boolean; allowDirectory?: boolean } = {},
) {
  assertArquivosConfigured();
  const relativePath = normalizeRelativePath(relativePathInput);
  const rootLexical = resolve(arquivosConfig.rootResolved);
  const targetLexical = resolve(rootLexical, relativePath);

  if (!isInside(rootLexical, targetLexical)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Caminho fora da raiz autorizada." });
  }

  let rootReal: string;
  try {
    rootReal = await realpath(rootLexical);
  } catch {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Raiz de arquivos indisponível." });
  }

  try {
    const targetReal = await realpath(targetLexical);
    if (!isInside(rootReal, targetReal)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Destino real fora da raiz autorizada." });
    }

    const info = await stat(targetReal);
    if (info.isDirectory() && options.allowDirectory === false) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Era esperado um arquivo." });
    }
    if (!info.isDirectory() && relativePath && isBlockedExtension(relativePath)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tipo de arquivo bloqueado por segurança." });
    }

    return { relativePath, absolutePath: targetReal, stat: info, rootReal };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (options.mustExist === false) {
      const rel = relative(rootReal, targetLexical);
      if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Caminho fora da raiz autorizada." });
      }
      return { relativePath, absolutePath: targetLexical, stat: null, rootReal };
    }
    throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo ou pasta não encontrado." });
  }
}

export async function rejectSymbolicEntry(absolutePath: string) {
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink()) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Links simbólicos/junctions não são navegáveis." });
  }
  return info;
}
