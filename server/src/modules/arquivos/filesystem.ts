import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { arquivosConfig } from "./config.js";
import { kindFor, extensionOf, previewableFor } from "./mime.js";
import { rejectSymbolicEntry, safeResolve } from "./security.js";
import type { ArquivoEntry } from "./types.js";

export async function listDirectory(relativePathInput = ""): Promise<ArquivoEntry[]> {
  const resolved = await safeResolve(relativePathInput, { allowDirectory: true });
  if (!resolved.stat?.isDirectory()) {
    throw new Error("O caminho informado não é uma pasta.");
  }

  const entries = await readdir(resolved.absolutePath, { withFileTypes: true });
  const result: ArquivoEntry[] = [];

  for (const entry of entries) {
    if (arquivosConfig.ignoredNames.has(entry.name.toLowerCase())) continue;

    const absolute = join(resolved.absolutePath, entry.name);
    try {
      const lst = await rejectSymbolicEntry(absolute);
      const childRelative = [resolved.relativePath, entry.name].filter(Boolean).join("/");

      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          relativePath: childRelative,
          kind: "folder",
          extension: "",
          size: null,
          modifiedAt: lst.mtime?.toISOString() ?? null,
          previewable: false,
          downloadable: false,
        });
        continue;
      }

      const safe = await safeResolve(childRelative, { allowDirectory: false });
      result.push({
        name: entry.name,
        relativePath: childRelative,
        kind: kindFor(entry.name),
        extension: extensionOf(entry.name),
        size: safe.stat?.size ?? null,
        modifiedAt: safe.stat?.mtime?.toISOString() ?? null,
        previewable: previewableFor(entry.name),
        downloadable: true,
      });
    } catch {
      // Entrada insegura ou removida durante a listagem: omitir.
    }
  }

  return result.sort((a, b) => {
    if (a.kind === "folder" && b.kind !== "folder") return -1;
    if (a.kind !== "folder" && b.kind === "folder") return 1;
    return a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" });
  });
}

export function displayName(relativePath: string) {
  return relativePath ? basename(relativePath) : "LICITACAO.1";
}
