import { subsystemDefinitions } from "@sirel/shared/subsystems";

type CorsOriginOptions = {
  readonly clientUrl?: string;
  readonly nodeEnv?: string;
};

function normalizeOrigin(origin: string) {
  const trimmed = origin.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function resolveAllowedOrigins(clientUrl = ""): readonly string[] {
  return Array.from(
    new Set(
      clientUrl
        .split(",")
        .map((item) => normalizeOrigin(item))
        .filter(Boolean),
    ),
  );
}

export function resolveSubsystemProductionOrigins(): readonly string[] {
  return Array.from(
    new Set(
      subsystemDefinitions
        .flatMap((subsystem) => subsystem.hostnames)
        .map((hostname) => normalizeOrigin(`https://${hostname}`)),
    ),
  );
}

export function resolvePrimaryClientOrigin(
  clientUrl = "",
  fallbackOrigin = "http://localhost:5173",
) {
  return resolveAllowedOrigins(clientUrl)[0] ?? fallbackOrigin;
}

export function isLocalDevelopmentOrigin(origin: string) {
  const normalized = normalizeOrigin(origin);

  try {
    const parsed = new URL(normalized);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function isCloudflareQuickTunnelOrigin(origin: string) {
  const normalized = normalizeOrigin(origin);

  try {
    const parsed = new URL(normalized);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase().endsWith(".trycloudflare.com")
    );
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  options: CorsOriginOptions = {},
) {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = [
    ...resolveAllowedOrigins(options.clientUrl ?? ""),
    ...resolveSubsystemProductionOrigins(),
  ];

  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  if (
    options.nodeEnv !== "production" &&
    (isLocalDevelopmentOrigin(origin) || isCloudflareQuickTunnelOrigin(origin))
  ) {
    return true;
  }

  return false;
}
