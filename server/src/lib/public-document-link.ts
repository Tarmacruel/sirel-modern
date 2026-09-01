import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { getSessionSecret } from "./auth-session.js";

const LINK_TTL_SECONDS = 60 * 60 * 24 * 7;
const TOKEN_VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getEncryptionKey() {
  return createHash("sha256")
    .update(getSessionSecret())
    .update("sirel-public-document-link-v1")
    .digest();
}

function encodePayload(value: object) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function createPublicDocumentLink(documentoId: number) {
  const token = encodePayload({
    documentoId,
    exp: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS,
  });
  return `/api/publico/documentos/${token}/download`;
}

export function verifyPublicDocumentLink(token: string) {
  const [version, ivValue, tagValue, ciphertextValue, ...extra] = token.split(".");
  if (
    version !== TOKEN_VERSION ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra.length > 0
  ) {
    return null;
  }

  try {
    const iv = Buffer.from(ivValue, "base64url");
    const tag = Buffer.from(tagValue, "base64url");
    const ciphertext = Buffer.from(ciphertextValue, "base64url");
    if (
      iv.length !== IV_BYTES ||
      tag.length !== TAG_BYTES ||
      ciphertext.length === 0
    ) {
      return null;
    }

    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const value = JSON.parse(plaintext) as {
      documentoId?: unknown;
      exp?: unknown;
    };
    const documentoId = Number(value.documentoId);
    const expiresAt = Number(value.exp);
    if (
      !Number.isSafeInteger(documentoId) ||
      documentoId < 1 ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return documentoId;
  } catch {
    return null;
  }
}
