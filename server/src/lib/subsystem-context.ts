import type { Request } from "express";

import {
  getDefaultSubsystem,
  getSubsystemByKey,
  resolveSubsystemByHost,
  type SubsystemDefinition,
  type SubsystemKey,
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

function resolveSubsystemByKeySafe(
  key: string,
): SubsystemDefinition | undefined {
  return getSubsystemByKey(key.trim().toLowerCase() as SubsystemKey);
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
  const explicitSubsystem = readHeaderValue(req, "x-sirel-subsystem").trim();
  const explicitDefinition = explicitSubsystem
    ? resolveSubsystemByKeySafe(explicitSubsystem)
    : undefined;

  if (explicitDefinition) {
    return explicitDefinition;
  }

  const requestMeta = resolveRequestMeta(req);
  const host = requestMeta.forwardedHost || requestMeta.host;

  return host ? resolveSubsystemByHost(host) : getDefaultSubsystem();
}
