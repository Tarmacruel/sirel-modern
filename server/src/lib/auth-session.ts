import { createHmac } from "node:crypto";
import type { Request, Response } from "express";

const TOKEN_VERSION = 1;
export const SESSION_TTL_SECONDS = 60 * 60 * 12;
export const SESSION_COOKIE_NAME = "sirel_session";

interface SessionPayload {
  sub: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  secretariaId: number | null;
  exp: number;
  ver: number;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function getSecret() {
  return process.env.JWT_SECRET || "sirel-secret";
}

function readHeaderValue(req: Request | undefined, headerName: string) {
  const value = req?.headers[headerName.toLowerCase()];
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function resolveRequestHost(req: Request | undefined) {
  const forwardedHost = readHeaderValue(req, "x-forwarded-host");
  const host = forwardedHost || readHeaderValue(req, "host");
  return host.split(",")[0]?.trim().toLowerCase().split(":")[0] ?? "";
}

function shouldUseProductionCookieDomain(req: Request | undefined) {
  const host = resolveRequestHost(req);
  return (
    process.env.NODE_ENV === "production" &&
    (host === "sirel.com.br" || host.endsWith(".sirel.com.br"))
  );
}

function buildCookieOptions(req: Request | undefined) {
  const useProductionDomain = shouldUseProductionCookieDomain(req);

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000,
    ...(useProductionDomain ? { domain: ".sirel.com.br" } : {}),
  };
}

function signPayload(payload: SessionPayload) {
  return createHmac("sha256", getSecret()).update(JSON.stringify(payload)).digest("base64url");
}

export function createSessionToken(user: {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  secretariaId: number | null;
}) {
  const payload: SessionPayload = {
    sub: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    secretariaId: user.secretariaId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    ver: TOKEN_VERSION,
  };
  return `${base64UrlEncode(JSON.stringify(payload))}.${signPayload(payload)}`;
}

export function verifySessionToken(token: string | null | undefined) {
  if (!token) return null;
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadPart)) as SessionPayload;
    if (payload.ver !== TOKEN_VERSION) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const expectedSignature = signPayload(payload);
    if (expectedSignature !== signaturePart) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(
  res: Response | undefined,
  req: Request | undefined,
  token: string,
) {
  res?.cookie(SESSION_COOKIE_NAME, token, buildCookieOptions(req));
}

export function clearSessionCookie(
  res: Response | undefined,
  req: Request | undefined,
) {
  const { maxAge: _maxAge, ...options } = buildCookieOptions(req);
  res?.clearCookie(SESSION_COOKIE_NAME, options);
}
