import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

import type { Express, Request, Response } from "express";

import { arquivosConfig } from "./config.js";
import { logArquivoAudit, resolveClientIp } from "./audit.js";
import { mimeFor, kindFor } from "./mime.js";
import { officePreviewPath } from "./preview.js";
import { safeResolve } from "./security.js";
import { claimTicketAudit, verifyArquivosTicket } from "./tickets.js";

function safeFilename(name: string) {
  return name.replace(/[\r\n"]/g, "_").slice(0, 240) || "arquivo";
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
  app.get("/api/arquivos/download", (req, res) => void handleTicket(req, res, "download"));
  app.get("/api/arquivos/preview", (req, res) => void handleTicket(req, res, "preview"));
}
