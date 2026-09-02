import { extname } from "node:path";
import type { ArquivoKind } from "./types.js";

const mimeByExt: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
};

const imageExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const textExts = new Set([".txt", ".csv", ".log", ".json", ".xml", ".md"]);
const officeExts = new Set([".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp"]);
const archiveExts = new Set([".zip", ".rar", ".7z"]);

export function extensionOf(name: string) {
  return extname(name).toLowerCase();
}

export function mimeFor(name: string) {
  return mimeByExt[extensionOf(name)] ?? "application/octet-stream";
}

export function kindFor(name: string, isDirectory = false): ArquivoKind {
  if (isDirectory) return "folder";
  const ext = extensionOf(name);
  if (ext === ".pdf") return "pdf";
  if (imageExts.has(ext)) return "image";
  if (textExts.has(ext)) return "text";
  if (officeExts.has(ext)) return "office";
  if (archiveExts.has(ext)) return "archive";
  return "other";
}

export function previewableFor(name: string) {
  return ["pdf", "image", "text", "office"].includes(kindFor(name));
}
