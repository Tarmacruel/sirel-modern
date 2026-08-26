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
  const cookieToken = readCookieValue(req, SESSION_COOKIE_NAME);
  const sessionPayload = verifySessionToken(cookieToken);

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

  return null;
}
