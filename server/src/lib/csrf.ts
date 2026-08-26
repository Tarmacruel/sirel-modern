import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const CSRF_COOKIE_NAME = "sirel_csrf";
export const CSRF_HEADER_NAME = "x-sirel-csrf";

function readCookie(req: Request, name: string) {
  const header = String(req.headers.cookie ?? "");
  for (const part of header.split(";")) {
    const [cookieName, ...value] = part.trim().split("=");
    if (cookieName === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

function sameValue(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function setCsrfCookie(res: Response, token = randomBytes(32).toString("base64url")) {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return token;
}

export function clearCsrfCookie(res: Response) {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function hasValidCsrfToken(req: Request) {
  const cookie = readCookie(req, CSRF_COOKIE_NAME);
  const header = String(req.headers[CSRF_HEADER_NAME] ?? "");
  if (!sameValue(cookie, header)) return false;

  const fetchSite = String(req.headers["sec-fetch-site"] ?? "").toLowerCase();
  return !fetchSite || ["same-origin", "same-site", "none"].includes(fetchSite);
}
