import type {
  SubsystemAccessLevel,
  SubsystemKey,
} from "@sirel/shared/subsystems";
import type {
  IdentityCompletionMode,
  IdentityMissingField,
} from "@sirel/shared/schemas/auth-recovery";

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
  sessionVersion?: number;
  subsystemAccess: AuthSubsystemAccess[];
  availableSubsystems: AuthAvailableSubsystem[];
  defaultSubsystemKey: SubsystemKey | null;
  identityProfile: {
    pessoaId: number | null;
    complete: boolean;
    missingFields: IdentityMissingField[];
    cpfMasked: string | null;
    matriculaMasked: string | null;
    dataNascimentoPresent: boolean;
  };
  requiresIdentityCompletion: boolean;
  identityCompletionMode: IdentityCompletionMode;
}

export interface AuthSession {
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
    sessionVersion: user.sessionVersion,
    subsystemAccess: Array.isArray(user.subsystemAccess)
      ? user.subsystemAccess
      : [],
    availableSubsystems: Array.isArray(user.availableSubsystems)
      ? user.availableSubsystems
      : [],
    defaultSubsystemKey: user.defaultSubsystemKey ?? null,
    identityProfile: {
      pessoaId: user.identityProfile?.pessoaId ?? null,
      complete: Boolean(user.identityProfile?.complete),
      missingFields: Array.isArray(user.identityProfile?.missingFields)
        ? user.identityProfile.missingFields
        : ["PESSOA_LINK", "CPF", "MATRICULA", "DATA_NASCIMENTO"],
      cpfMasked: user.identityProfile?.cpfMasked ?? null,
      matriculaMasked: user.identityProfile?.matriculaMasked ?? null,
      dataNascimentoPresent: Boolean(user.identityProfile?.dataNascimentoPresent),
    },
    requiresIdentityCompletion: Boolean(user.requiresIdentityCompletion),
    identityCompletionMode: user.identityCompletionMode === "REQUIRED" ? "REQUIRED" : "REMINDER",
  };
}

export function normalizeAuthSession(session: AuthSession): AuthSession {
  return {
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

export function getCsrfToken() {
  if (typeof document === "undefined") return "";
  const prefix = "sirel_csrf=";
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}
