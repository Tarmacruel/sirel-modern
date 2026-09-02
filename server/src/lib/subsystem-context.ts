import type { Request } from "express";

import {
  getDefaultSubsystem,
  resolveSubsystemByHost,
  type SubsystemDefinition,
} from "@sirel/shared/subsystems";

export type RequestMeta = {
  readonly host: string;
  readonly forwardedHost: string;
  readonly origin: string;
  readonly userAgent: string;
};

function readHeaderValue(req: Request, headerName: string) {
  const value = req.headers[headerName.toLowerCase()];

  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

export function resolveRequestMeta(req: Request): RequestMeta {
  return {
    host: readHeaderValue(req, "host").trim(),
    forwardedHost: readHeaderValue(req, "x-forwarded-host").trim(),
    origin: readHeaderValue(req, "origin").trim(),
    userAgent: readHeaderValue(req, "user-agent").trim(),
  };
}

export function resolveSubsystemFromRequest(req: Request): SubsystemDefinition {
  // Express only resolves a forwarded host into `req.hostname` after an
  // explicit trust-proxy configuration. Do not trust client headers here.
  const host =
    String(req.hostname ?? "").trim() || readHeaderValue(req, "host").trim();

  return host ? resolveSubsystemByHost(host) : getDefaultSubsystem();
}
