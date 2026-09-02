import type { Request } from "express";

import {
  isTransparencyPortalHost,
  isTransparencyPortalOrigin,
} from "@sirel/shared/portal-publico";

export { isTransparencyPortalHost } from "@sirel/shared/portal-publico";

/**
 * `req.hostname` only consults X-Forwarded-Host when Express has an explicit
 * `trust proxy` configuration. Never read a forwarded header directly here.
 */
export function isTransparencyPortalRequest(req: Pick<Request, "hostname">) {
  return isTransparencyPortalHost(req.hostname);
}

const portalProcedurePaths = new Set([
  "portalPublico.processos",
  "portalPublico.documentos",
  "portalPublico.classificacoes",
]);

export function isTransparencyPortalProcedurePath(path: string) {
  const procedureNames = path
    .replace(/^\/api\/trpc\//, "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  return (
    procedureNames.length > 0 &&
    procedureNames.every((name) => portalProcedurePaths.has(name))
  );
}

export function isTransparencyPortalPathAllowed(path: string, method: string) {
  const safeMethod = method.toUpperCase();
  if (!["GET", "HEAD"].includes(safeMethod)) return false;

  if (path === "/healthz") return true;
  if (!path.startsWith("/api/")) return true;

  if (path.startsWith("/api/trpc/")) {
    return isTransparencyPortalProcedurePath(path);
  }

  return /^\/api\/publico\/documentos\/[^/]+\/download$/.test(path);
}

export function isTransparencyPortalSameOrigin(origin: string | undefined) {
  return !origin || isTransparencyPortalOrigin(origin);
}
