import type {
  SubsystemAccessLevel,
  SubsystemKey,
} from "@sirel/shared/subsystems";

export interface AuthSubsystemAccess {
  subsystemKey: SubsystemKey;
  accessLevel: SubsystemAccessLevel;
  isDefault: boolean;
  ativo: boolean;
  observacao?: string | null;
}

export interface AuthAvailableSubsystem {
  key: SubsystemKey;
  title: string;
  shortTitle: string;
  description: string;
  icon: string;
  accent?: string;
  hostnames: readonly string[];
  accessLevel: SubsystemAccessLevel;
  isDefault: boolean;
}

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: string;
  secretariaId: number | null;
  subsystemAccess: AuthSubsystemAccess[];
  availableSubsystems: AuthAvailableSubsystem[];
  defaultSubsystemKey: SubsystemKey | null;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

const STORAGE_KEY = "sirel.session";

function normalizeAuthUser(user: Partial<AuthUser> & Pick<AuthUser, "id" | "name" | "role">): AuthUser {
  return {
    id: user.id,
    username: user.username ?? `user-${user.id}`,
    name: user.name,
    email: user.email ?? null,
    role: user.role,
    secretariaId: user.secretariaId ?? null,
    subsystemAccess: Array.isArray(user.subsystemAccess)
      ? user.subsystemAccess
      : [],
    availableSubsystems: Array.isArray(user.availableSubsystems)
      ? user.availableSubsystems
      : [],
    defaultSubsystemKey: user.defaultSubsystemKey ?? null,
  };
}

export function normalizeAuthSession(session: AuthSession): AuthSession {
  return {
    token: session.token ?? "",
    user: normalizeAuthUser(session.user),
  };
}

export function loadStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return null;
    return normalizeAuthSession(JSON.parse(rawValue) as AuthSession);
  } catch {
    return null;
  }
}

export function saveStoredSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAuthSession(session)));
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getStoredAuthToken() {
  return loadStoredSession()?.token ?? "";
}
