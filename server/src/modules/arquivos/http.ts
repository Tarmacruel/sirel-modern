import { randomUUID } from "node:crypto";
import { constants, createReadStream, mkdirSync } from "node:fs";
import { copyFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

import multer from "multer";
import type { Express, NextFunction, Request, Response } from "express";

import { arquivosConfig } from "./config.js";
import { logArquivoAudit, resolveClientIp } from "./audit.js";
import { kindFor, mimeFor } from "./mime.js";
import { officePreviewPath } from "./preview.js";
import { isBlockedExtension, safeResolve } from "./security.js";
import { claimTicketAudit, verifyArquivosTicket } from "./tickets.js";
import { hasValidCsrfToken } from "../../lib/csrf.js";
import { resolveRequestUser } from "../../lib/request-auth.js";

function safeFilename(name: string) {
  return name.replace(/[\r\n"]/g, "_").slice(0, 240) || "arquivo";
}

class ArquivoUploadError extends Error {
  readonly statusCode = 400;
}

const arquivoUploadTempDir = join(tmpdir(), "sirel-arquivos-upload");

const arquivoUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      try {
        mkdirSync(arquivoUploadTempDir, { recursive: true });
        callback(null, arquivoUploadTempDir);
      } catch (error) {
        callback(error as Error, arquivoUploadTempDir);
      }
    },
    filename(_req, _file, callback) {
      callback(null, `${randomUUID()}.upload`);
    },
  }),
  limits: {
    fileSize: arquivosConfig.uploadMaxBytes,
    files: 1,
    fields: 1,
    parts: 3,
  },
  fileFilter(_req, file, callback) {
    callback(null, !isBlockedExtension(file.originalname));
  },
});

function requestedUploadPath(req: Request) {
  return String(req.body?.path ?? "").trim() || null;
}

function normalizeUploadName(originalName: string) {
  const rawName = String(originalName ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .replace(/[<>:"/\\|?*]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!rawName || rawName === "." || rawName === "..") {
    throw new ArquivoUploadError("Informe um nome de arquivo válido.");
  }

  const extension = extname(rawName);
  const baseName = rawName.slice(0, extension ? -extension.length : undefined);
  const maxBaseLength = Math.max(1, 180 - extension.length);
  return `${baseName.slice(0, maxBaseLength)}${extension}`;
}

async function copyUploadToFolder(
  sourcePath: string,
  targetFolder: string,
  fileName: string,
) {
  const extension = extname(fileName);
  const baseName = fileName.slice(0, extension ? -extension.length : undefined);

  for (let index = 0; index < 1000; index++) {
    const candidateName =
      index === 0 ? fileName : `${baseName} (${index})${extension}`;
    const candidatePath = join(targetFolder, candidateName);

    try {
      await copyFile(sourcePath, candidatePath, constants.COPYFILE_EXCL);
      return { absolutePath: candidatePath, name: candidateName };
    } catch (error: any) {
      if (error?.code === "EEXIST") continue;
      await rm(candidatePath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  throw new ArquivoUploadError(
    "Não foi possível encontrar um nome disponível para o arquivo.",
  );
}

async function denyArquivoUpload(
  req: Request,
  res: Response,
  userId: number | null,
  status: number,
  message: string,
  detail: string,
) {
  await logArquivoAudit({
    userId,
    action: "DENIED",
    relativePath: requestedUploadPath(req),
    ipAddress: resolveClientIp(req),
    userAgent: String(req.headers["user-agent"] ?? "") || null,
    success: false,
    detail,
  });
  commonHeaders(res);
  res.status(status).json({ message });
}

async function requireArquivoUploadAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = resolveRequestUser(req);
  if (!user) {
    await denyArquivoUpload(
      req,
      res,
      null,
      401,
      "Login obrigatório.",
      "Upload sem sessão autenticada.",
    );
    return;
  }

  if (!["admin", "gestor", "operador"].includes(user.role)) {
    await denyArquivoUpload(
      req,
      res,
      user.id,
      403,
      "Acesso restrito a operadores, gestores e administradores.",
      `Perfil ${user.role} sem permissão para upload.`,
    );
    return;
  }

  if (!hasValidCsrfToken(req)) {
    await denyArquivoUpload(
      req,
      res,
      user.id,
      403,
      "Validação CSRF obrigatória.",
      "Token CSRF ausente ou inválido no upload.",
    );
    return;
  }

  next();
}

function parseArquivoUpload(req: Request, res: Response, next: NextFunction) {
  arquivoUpload.single("arquivo")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    const file = req.file;
    if (file?.path) void rm(file.path, { force: true });
    void logArquivoAudit({
      userId: resolveRequestUser(req)?.id ?? null,
      action: "UPLOAD",
      relativePath: requestedUploadPath(req),
      fileName: file?.originalname ?? null,
      fileSize: file?.size ?? null,
      ipAddress: resolveClientIp(req),
      userAgent: String(req.headers["user-agent"] ?? "") || null,
      success: false,
      detail: error instanceof Error ? error.message : "Falha ao interpretar o upload.",
    });
    commonHeaders(res);
    res.status(400).json({
      message:
        error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
          ? "O arquivo excede o limite permitido para upload."
          : "Upload inválido. Envie um único arquivo não bloqueado pela política do acervo.",
    });
  });
}

async function handleArquivoUpload(req: Request, res: Response) {
  const file = req.file;
  const user = resolveRequestUser(req);
  let targetPath: string | null = null;
  let targetRelativePath: string | null = null;
  let targetName: string | null = null;

  try {
    if (!user) throw new ArquivoUploadError("Login obrigatório.");
    if (!file) {
      throw new ArquivoUploadError(
        "Selecione um arquivo não bloqueado pela política do acervo.",
      );
    }

    const targetFolder = await safeResolve(requestedUploadPath(req), {
      allowDirectory: true,
    });
    if (!targetFolder.stat?.isDirectory()) {
      throw new ArquivoUploadError("O destino informado não é uma pasta.");
    }

    const requestedName = normalizeUploadName(file.originalname);
    if (isBlockedExtension(requestedName)) {
      throw new ArquivoUploadError(
        "Este tipo de arquivo é bloqueado pela política de segurança.",
      );
    }
    if (arquivosConfig.ignoredNames.has(requestedName.toLowerCase())) {
      throw new ArquivoUploadError("Este nome de arquivo não pode ser usado.");
    }

    const copied = await copyUploadToFolder(
      file.path,
      targetFolder.absolutePath,
      requestedName,
    );
    targetPath = copied.absolutePath;
    targetName = copied.name;
    targetRelativePath = [targetFolder.relativePath, copied.name]
      .filter(Boolean)
      .join("/");

    await logArquivoAudit({
      userId: user.id,
      action: "UPLOAD",
      relativePath: targetRelativePath,
      fileName: copied.name,
      fileSize: file.size,
      ipAddress: resolveClientIp(req),
      userAgent: String(req.headers["user-agent"] ?? "") || null,
      success: true,
      detail:
        copied.name === requestedName
          ? "Upload concluído."
          : `Upload concluído com nome alternativo; nome solicitado: ${requestedName}.`,
    });

    commonHeaders(res);
    res.status(201).json({
      success: true,
      name: copied.name,
      relativePath: targetRelativePath,
      size: file.size,
      modifiedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    if (targetPath) await rm(targetPath, { force: true }).catch(() => undefined);

    await logArquivoAudit({
      userId: user?.id ?? null,
      action: "UPLOAD",
      relativePath: targetRelativePath ?? requestedUploadPath(req),
      fileName: targetName ?? file?.originalname ?? null,
      fileSize: file?.size ?? null,
      ipAddress: resolveClientIp(req),
      userAgent: String(req.headers["user-agent"] ?? "") || null,
      success: false,
      detail: error instanceof Error ? error.message : "Falha ao salvar o upload.",
    });

    const code = String(error?.code ?? "");
    const status =
      error instanceof ArquivoUploadError
        ? error.statusCode
        : code === "FORBIDDEN"
          ? 403
          : code === "NOT_FOUND"
            ? 404
            : 500;
    const message =
      status === 500
        ? "Não foi possível salvar o arquivo enviado."
        : error instanceof Error
          ? error.message
          : "Não foi possível salvar o arquivo enviado.";

    commonHeaders(res);
    res.status(status).json({ message });
  } finally {
    if (file?.path) await rm(file.path, { force: true }).catch(() => undefined);
  }
}

function commonHeaders(res: Response) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
}

function pipeFile(
  res: Response,
  absolutePath: string,
  range?: { start: number; end: number },
) {
  return new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(absolutePath, range);
    let settled = false;

    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      res.off("finish", onFinish);
      res.off("close", onClose);
      stream.removeListener("error", onError);
      if (error) reject(error);
      else resolvePromise();
    };

    const onError = (error: Error) => settle(error);
    const onFinish = () => settle();
    const onClose = () => {
      stream.destroy();
      settle();
    };

    stream.once("error", onError);
    res.once("finish", onFinish);
    res.once("close", onClose);
    stream.pipe(res);
  });
}

async function streamFile(
  req: Request,
  res: Response,
  absolutePath: string,
  downloadName: string,
  asDownload: boolean,
  contentTypeOverride?: string,
) {
  const info = await stat(absolutePath);
  const range = String(req.headers.range ?? "").trim();
  const contentType = contentTypeOverride ?? mimeFor(downloadName);

  commonHeaders(res);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);
  res.setHeader(
    "Content-Disposition",
    `${asDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(safeFilename(downloadName))}`,
  );

  if (!range) {
    res.status(200);
    res.setHeader("Content-Length", String(info.size));
    await pipeFile(res, absolutePath);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.status(416).setHeader("Content-Range", `bytes */${info.size}`).end();
    return;
  }

  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : info.size - 1;

  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    start = Math.max(0, info.size - suffix);
    end = info.size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= info.size) {
    res.status(416).setHeader("Content-Range", `bytes */${info.size}`).end();
    return;
  }

  end = Math.min(end, info.size - 1);
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${info.size}`);
  res.setHeader("Content-Length", String(end - start + 1));
  await pipeFile(res, absolutePath, { start, end });
}

async function handleTicket(req: Request, res: Response, mode: "download" | "preview") {
  try {
    const payload = verifyArquivosTicket(String(req.query.ticket ?? ""), mode);
    const resolved = await safeResolve(payload.path, { allowDirectory: false });
    const name = basename(resolved.absolutePath);
    const kind = kindFor(name);

    if (mode === "preview" && (resolved.stat?.size ?? 0) > arquivosConfig.previewMaxBytes) {
      throw new Error("Arquivo excede o limite configurado para preview.");
    }

    let targetPath = resolved.absolutePath;
    let targetName = name;

    if (mode === "preview" && kind === "office") {
      targetPath = await officePreviewPath(resolved.absolutePath, resolved.relativePath);
      targetName = `${name}.preview.pdf`;
    } else if (mode === "preview" && kind === "text") {
      const info = await stat(resolved.absolutePath);
      if (info.size > arquivosConfig.textPreviewMaxBytes) {
        throw new Error("Arquivo de texto excede o limite de preview.");
      }
    } else if (mode === "preview" && !["pdf", "image", "text", "office"].includes(kind)) {
      res.status(415).json({ message: "Preview não disponível para este tipo de arquivo." });
      return;
    }

    if (claimTicketAudit(payload)) {
      await logArquivoAudit({
        userId: payload.uid,
        action: mode === "download" ? "DOWNLOAD" : "VIEW",
        relativePath: resolved.relativePath,
        fileName: name,
        fileSize: resolved.stat?.size ?? null,
        ipAddress: resolveClientIp(req as any),
        userAgent: String(req.headers["user-agent"] ?? "") || null,
        success: true,
        detail: req.headers.range ? "Acesso com HTTP Range" : null,
      });
    }

    await streamFile(
      req,
      res,
      targetPath,
      targetName,
      mode === "download",
      mode === "preview" && kind === "text"
        ? "text/plain; charset=utf-8"
        : undefined,
    );
  } catch (error: any) {
    commonHeaders(res);
    const status = error?.code === "UNAUTHORIZED" ? 401 : error?.code === "FORBIDDEN" ? 403 : error?.code === "NOT_FOUND" ? 404 : 400;
    await logArquivoAudit({
      userId: null,
      action: "DENIED",
      ipAddress: resolveClientIp(req as any),
      userAgent: String(req.headers["user-agent"] ?? "") || null,
      success: false,
      detail: `HTTP ${status} em ${mode}`,
    });
    if (res.headersSent) {
      if (!res.writableEnded) res.destroy();
      return;
    }
    const message =
      status === 401
        ? "Ticket ausente ou inválido."
        : status === 403
          ? "Acesso negado."
          : status === 404
            ? "Arquivo ou pasta não encontrado."
            : "Não foi possível acessar o arquivo.";
    res.status(status).json({ message });
  }
}

export function registerArquivosHttp(app: Express) {
  app.post(
    "/api/arquivos/upload",
    requireArquivoUploadAccess,
    parseArquivoUpload,
    (req, res) => void handleArquivoUpload(req, res),
  );
  app.get("/api/arquivos/download", (req, res) => void handleTicket(req, res, "download"));
  app.get("/api/arquivos/preview", (req, res) => void handleTicket(req, res, "preview"));
}
