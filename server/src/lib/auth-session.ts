import { createHmac, timingSafeEqual } from "node:crypto";
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
  sessionVersion: number;
  iat: number;
  exp: number;
  ver: number;
}

type StoredSessionPayload = Omit<SessionPayload, "sessionVersion" | "iat"> &
  Partial<Pick<SessionPayload, "sessionVersion" | "iat">>;

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf-8");
}

export function getSessionSecret() {
  const secret = process.env.JWT_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error(
      "JWT_SECRET deve estar configurado com pelo menos 32 caracteres aleatorios.",
    );
  }
  return secret;
}

export function assertSessionSecretConfigured() {
  getSessionSecret();
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

function signPayload(payload: object) {
  return createHmac("sha256", getSessionSecret())
    .update(JSON.stringify(payload))
    .digest("base64url");
}

export function createSessionToken(user: {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  secretariaId: number | null;
  sessionVersion: number;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    secretariaId: user.secretariaId,
    sessionVersion: user.sessionVersion,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
    ver: TOKEN_VERSION,
  };
  return `${base64UrlEncode(JSON.stringify(payload))}.${signPayload(payload)}`;
}

export function verifySessionToken(token: string | null | undefined) {
  if (!token) return null;
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadPart)) as StoredSessionPayload;
    if (payload.ver !== TOKEN_VERSION) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    const expectedSignature = signPayload(payload);
    const expected = Buffer.from(expectedSignature);
    const received = Buffer.from(signaturePart);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      return null;
    }
    return {
      ...payload,
      sessionVersion: Number(payload.sessionVersion ?? 1),
      iat: Number(payload.iat ?? payload.exp - SESSION_TTL_SECONDS),
    } satisfies SessionPayload;
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
