import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";

import { arquivosConfig } from "./config.js";
import { resolveLibreOffice, withOfficeConversion } from "./office.js";

const execFileAsync = promisify(execFile);
const contentKinds = new Set(["text", "pdf", "office"]);

function trimContent(value: string) {
  const normalized = value.replace(/\u0000/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, arquivosConfig.contentIndexMaxChars);
}

async function readTextFile(filePath: string) {
  const info = await stat(filePath);
  if (info.size > arquivosConfig.contentIndexMaxBytes) return null;
  return trimContent(await readFile(filePath, "utf8"));
}

async function extractPdfText(filePath: string) {
  const info = await stat(filePath);
  if (info.size > arquivosConfig.contentIndexMaxBytes) return null;

  const result = await execFileAsync(
    arquivosConfig.pdftotextPath,
    ["-enc", "UTF-8", "-nopgbrk", filePath, "-"],
    {
      windowsHide: true,
      timeout: arquivosConfig.contentIndexTimeoutMs,
      maxBuffer: arquivosConfig.contentIndexMaxChars * 4 + 1024,
    },
  );
  return trimContent(String(result.stdout ?? ""));
}

async function extractOfficeText(filePath: string) {
  const info = await stat(filePath);
  if (info.size > arquivosConfig.contentIndexMaxBytes) return null;

  const executable = resolveLibreOffice();
  if (!executable) return null;

  return withOfficeConversion(
    {
      inputPath: filePath,
      format: "txt:Text",
      timeoutMs: arquivosConfig.contentIndexTimeoutMs,
    },
    async (outputDir) => {
      const outputEntries = await readdir(outputDir, { withFileTypes: true });
      const output = outputEntries.find(
        (entry) =>
          entry.isFile() && extname(entry.name).toLowerCase() === ".txt",
      );
      if (!output) return null;
      return await readTextFile(join(outputDir, output.name));
    },
  );
}

export function canIndexContent(kind: string) {
  return contentKinds.has(kind);
}

export async function extractIndexedContent(filePath: string, kind: string) {
  if (!canIndexContent(kind)) return null;

  try {
    if (kind === "text") return readTextFile(filePath);
    if (kind === "pdf") return await extractPdfText(filePath);
    return await extractOfficeText(filePath);
  } catch {
    return null;
  }
}
