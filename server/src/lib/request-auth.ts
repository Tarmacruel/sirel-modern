import type { Request } from "express";

import { SESSION_COOKIE_NAME, verifySessionToken } from "./auth-session.js";

export type RequestUser = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  secretariaId: number | null;
  sessionVersion: number;
};

function readHeaderValue(req: Request, headerName: string) {
  const value = req.headers[headerName.toLowerCase()];

  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function readCookieValue(req: Request, cookieName: string) {
  const header = readHeaderValue(req, "cookie");
  if (!header) return "";

  const cookies = header.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) continue;

    const name = cookie.slice(0, separatorIndex).trim();
    if (name !== cookieName) continue;

    return decodeURIComponent(cookie.slice(separatorIndex + 1));
  }

  return "";
}

export function resolveRequestUser(req: Request): RequestUser | null {
  const authHeader = readHeaderValue(req, "authorization").trim();
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const cookieToken = readCookieValue(req, SESSION_COOKIE_NAME);
  const sessionPayload = verifySessionToken(cookieToken || bearerToken);
  const roleHeader = readHeaderValue(req, "x-sirel-role").trim();
  const userId = Number(readHeaderValue(req, "x-sirel-user-id") || 0) || 1;
  const secretariaId =
    Number(readHeaderValue(req, "x-sirel-secretaria-id") || 0) || null;

  if (sessionPayload) {
    return {
      id: sessionPayload.sub,
      username: sessionPayload.username,
      name: sessionPayload.name,
      email: sessionPayload.email ?? "",
      role: sessionPayload.role,
      secretariaId: sessionPayload.secretariaId,
      sessionVersion: sessionPayload.sessionVersion,
    };
  }

  const allowHeaderFallback =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEV_AUTH_HEADERS === "true";

  if (!roleHeader || !allowHeaderFallback) {
    return null;
  }

  return {
    id: userId,
    username: readHeaderValue(req, "x-sirel-username") || "demo",
    name: readHeaderValue(req, "x-sirel-user-name") || "Usuario demo",
    email: readHeaderValue(req, "x-sirel-user-email") || "demo@sirel.local",
    role: roleHeader,
    secretariaId,
    sessionVersion: 1,
  };
}
