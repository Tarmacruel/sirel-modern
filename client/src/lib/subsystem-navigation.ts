import {
  getDefaultSubsystem,
  getSubsystemByKey,
  subsystemAccessLevelLabels,
  subsystemDefinitions,
  type SubsystemAccessLevel,
  type SubsystemDefinition,
  type SubsystemKey,
} from "@sirel/shared/subsystems";
import type { AuthSubsystemAccess, AuthUser } from "@/lib/auth-session";

export function getSubsystemAccessLabel(level: SubsystemAccessLevel) {
  return subsystemAccessLevelLabels[level] ?? level;
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".127.0.0.1.nip.io")
  );
}

export function buildSubsystemHref(
  subsystemKey: SubsystemKey,
  path = "/",
) {
  const subsystem = getSubsystemByKey(subsystemKey) ?? getDefaultSubsystem();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (typeof window === "undefined") {
    return normalizedPath;
  }

  if (import.meta.env.DEV || isLocalHostname(window.location.hostname)) {
    const url = new URL(normalizedPath, window.location.origin);
    url.searchParams.set("subsystem", subsystem.key);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  const targetHost = subsystem.hostnames[0] ?? window.location.hostname;
  return `${window.location.protocol}//${targetHost}${normalizedPath}`;
}

export function getUserSubsystemAccessItem(
  user: Pick<AuthUser, "role" | "subsystemAccess">,
  subsystemKey: SubsystemKey,
): AuthSubsystemAccess | null {
  if (subsystemKey === "hub") {
    return (
      user.subsystemAccess.find((access) => access.subsystemKey === "hub") ?? {
        subsystemKey: "hub",
        accessLevel: "VIEWER",
        isDefault: true,
        ativo: true,
      }
    );
  }

  if (user.role === "admin") {
    return {
      subsystemKey,
      accessLevel: "ADMIN",
      isDefault: false,
      ativo: true,
    };
  }

  return (
    user.subsystemAccess.find((access) => access.subsystemKey === subsystemKey) ??
    null
  );
}

export function hasUserSubsystemAccess(
  user: Pick<AuthUser, "role" | "subsystemAccess">,
  subsystemKey: SubsystemKey,
) {
  const access = getUserSubsystemAccessItem(user, subsystemKey);
  return Boolean(access?.ativo);
}

export function getAuthorizedSubsystemsForUser(
  user: Pick<AuthUser, "role" | "subsystemAccess">,
): Array<SubsystemDefinition & { accessLevel: SubsystemAccessLevel }> {
  const authorized: Array<
    SubsystemDefinition & { accessLevel: SubsystemAccessLevel }
  > = [];

  for (const subsystem of subsystemDefinitions) {
    const access = getUserSubsystemAccessItem(user, subsystem.key);
    if (!access?.ativo) continue;

    authorized.push({
      ...subsystem,
      accessLevel: access.accessLevel,
    });
  }

  return authorized;
}

export function resolveDefaultSubsystemForUser(
  user: Pick<AuthUser, "role" | "subsystemAccess" | "defaultSubsystemKey">,
) {
  const defaultKey = user.defaultSubsystemKey;
  if (defaultKey && hasUserSubsystemAccess(user, defaultKey)) {
    return getSubsystemByKey(defaultKey) ?? getDefaultSubsystem();
  }

  const authorized = getAuthorizedSubsystemsForUser(user);
  return authorized[0] ?? getDefaultSubsystem();
}
