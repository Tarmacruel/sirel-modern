import { createHmac, timingSafeEqual } from "node:crypto";

import { getSessionSecret } from "./auth-session.js";

const LINK_TTL_SECONDS = 60 * 60 * 24 * 7;

function encode(value: object) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(`public-document:${value}`).digest("base64url");
}

export function createPublicDocumentLink(documentoId: number) {
  const payload = encode({ documentoId, exp: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS });
  return `/api/publico/documentos/${payload}.${sign(payload)}/download`;
}

export function verifyPublicDocumentLink(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { documentoId?: unknown; exp?: unknown };
    const documentoId = Number(value.documentoId);
    if (!Number.isSafeInteger(documentoId) || documentoId < 1 || Number(value.exp) < Date.now() / 1000) return null;
    return documentoId;
  } catch {
    return null;
  }
}
