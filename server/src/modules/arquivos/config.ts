import { resolve } from "node:path";

function envBoolean(name: string, fallback: boolean) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "sim", "yes", "on"].includes(raw);
}

function envNumber(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeExt(value: string) {
  const ext = value.trim().toLowerCase();
  if (!ext) return "";
  return ext.startsWith(".") ? ext : `.${ext}`;
}

const defaultBlocked = [
  ".exe", ".com", ".bat", ".cmd", ".ps1", ".psm1", ".vbs", ".vbe",
  ".js", ".jse", ".wsf", ".wsh", ".scr", ".msi", ".msp", ".dll",
  ".lnk", ".url",
];

const configuredBlocked = String(process.env.ARQUIVOS_BLOCKED_EXTENSIONS ?? "")
  .split(",")
  .map(normalizeExt)
  .filter(Boolean);

const explicitTicketSecret = String(process.env.ARQUIVOS_TICKET_SECRET ?? "").trim();

export const arquivosConfig = {
  enabled: envBoolean("ARQUIVOS_ENABLED", true),
  hostname: String(process.env.ARQUIVOS_HOSTNAME ?? "arquivos.sirel.com.br").trim().toLowerCase(),
  root: String(process.env.ARQUIVOS_ROOT ?? "").trim(),
  rootResolved: String(process.env.ARQUIVOS_ROOT ?? "").trim()
    ? resolve(String(process.env.ARQUIVOS_ROOT).trim())
    : "",
  ticketSecret: explicitTicketSecret || String(process.env.JWT_SECRET ?? "").trim(),
  ticketTtlSeconds: envNumber("ARQUIVOS_TICKET_TTL_SECONDS", 120, 30, 600),
  previewTicketTtlSeconds: envNumber(
    "ARQUIVOS_PREVIEW_TICKET_TTL_SECONDS",
    1800,
    300,
    7200,
  ),
  previewMaxBytes: envNumber("ARQUIVOS_PREVIEW_MAX_MB", 250, 1, 2048) * 1024 * 1024,
  uploadMaxBytes: envNumber("ARQUIVOS_UPLOAD_MAX_MB", 250, 1, 2048) * 1024 * 1024,
  textPreviewMaxBytes: envNumber("ARQUIVOS_TEXT_PREVIEW_MAX_MB", 5, 1, 50) * 1024 * 1024,
  contentIndexMaxBytes: envNumber("ARQUIVOS_CONTENT_INDEX_MAX_MB", 50, 1, 500) * 1024 * 1024,
  contentIndexMaxChars: envNumber("ARQUIVOS_CONTENT_INDEX_MAX_CHARS", 1_000_000, 10_000, 5_000_000),
  contentIndexTimeoutMs: envNumber("ARQUIVOS_CONTENT_INDEX_TIMEOUT_SECONDS", 90, 10, 600) * 1000,
  contentIndexConcurrency: envNumber("ARQUIVOS_CONTENT_INDEX_CONCURRENCY", 2, 1, 8),
  pdftotextPath: String(process.env.PDFTOTEXT_PATH ?? "pdftotext").trim(),
  autoIndex: envBoolean("ARQUIVOS_AUTO_INDEX", true),
  watch: envBoolean("ARQUIVOS_WATCH", true),
  previewCacheDir: resolve(
    process.cwd(),
    String(process.env.ARQUIVOS_PREVIEW_CACHE_DIR ?? "storage/arquivos-preview-cache").trim(),
  ),
  previewCacheMaxAgeDays: envNumber("ARQUIVOS_PREVIEW_CACHE_MAX_AGE_DAYS", 30, 1, 365),
  libreOfficePath: String(process.env.LIBREOFFICE_PATH ?? "").trim(),
  blockedExtensions: new Set(configuredBlocked.length ? configuredBlocked : defaultBlocked),
  ignoredNames: new Set([
    "$RECYCLE.BIN",
    "System Volume Information",
    ".git",
    "node_modules",
    "Thumbs.db",
    "desktop.ini",
  ].map((item) => item.toLowerCase())),
};

export function assertArquivosConfigured() {
  if (!arquivosConfig.enabled) {
    throw new Error("SIREL Arquivos está desabilitado.");
  }
  if (!arquivosConfig.rootResolved) {
    throw new Error("ARQUIVOS_ROOT não configurada.");
  }
  if (!arquivosConfig.ticketSecret || arquivosConfig.ticketSecret.length < 16) {
    throw new Error("ARQUIVOS_TICKET_SECRET/JWT_SECRET ausente ou muito curto.");
  }
}
