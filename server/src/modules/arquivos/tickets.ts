import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { TRPCError } from "@trpc/server";

import { arquivosConfig, assertArquivosConfigured } from "./config.js";
import { normalizeRelativePath } from "./security.js";
import type { ArquivosTicketMode, ArquivosTicketPayload } from "./types.js";

function b64urlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(body: string) {
  assertArquivosConfigured();
  return createHmac("sha256", arquivosConfig.ticketSecret).update(body).digest("base64url");
}

const auditedTicketNonces = new Map<string, number>();

export function claimTicketAudit(payload: ArquivosTicketPayload) {
  const now = Math.floor(Date.now() / 1000);
  for (const [nonce, expiry] of auditedTicketNonces) {
    if (expiry < now) auditedTicketNonces.delete(nonce);
  }

  if (auditedTicketNonces.has(payload.nonce)) return false;
  auditedTicketNonces.set(payload.nonce, payload.exp);
  return true;
}

export function createArquivosTicket(params: {
  userId: number;
  relativePath: string;
  mode: ArquivosTicketMode;
}) {
  const now = Math.floor(Date.now() / 1000);
  const ttl =
    params.mode === "preview"
      ? arquivosConfig.previewTicketTtlSeconds
      : arquivosConfig.ticketTtlSeconds;
  const payload: ArquivosTicketPayload = {
    v: 1,
    uid: params.userId,
    path: normalizeRelativePath(params.relativePath),
    mode: params.mode,
    iat: now,
    exp: now + ttl,
    nonce: randomBytes(12).toString("base64url"),
  };

  const body = b64urlEncode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyArquivosTicket(
  token: string | null | undefined,
  expectedMode?: ArquivosTicketMode,
) {
  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Ticket ausente." });
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Ticket inválido." });
  }

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Ticket inválido." });
  }

  let payload: ArquivosTicketPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Ticket inválido." });
  }

  if (payload.v !== 1 || !Number.isInteger(payload.uid) || payload.uid <= 0) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Ticket inválido." });
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now || payload.iat > now + 30) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Ticket expirado." });
  }

  if (expectedMode && payload.mode !== expectedMode) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Ticket não autorizado para esta operação." });
  }

  payload.path = normalizeRelativePath(payload.path);
  return payload;
}
