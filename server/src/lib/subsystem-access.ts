import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";

import {
  getDefaultSubsystem,
  getSubsystemByKey,
  subsystemAccessLevelRank,
  subsystemDefinitions,
  type SubsystemAccessLevel,
  type SubsystemDefinition,
  type SubsystemKey,
} from "@sirel/shared/subsystems";
import type { UserRole } from "@sirel/shared/types";
import type { UsuarioSubsystemAccessInput } from "@sirel/shared/schemas/usuarios";
import { requireDb } from "../db/client.js";
import { userSubsystemAccess } from "../db/schema.js";
import type { AppContext } from "../_core/context.js";

type AccessUser = {
  readonly id: number;
  readonly role: string;
};

export type UserSubsystemAccessMatrixItem = {
  readonly subsystemKey: SubsystemKey;
  readonly accessLevel: SubsystemAccessLevel;
  readonly isDefault: boolean;
  readonly ativo: boolean;
  readonly observacao: string | null;
};

export type AvailableSubsystem = Pick<
  SubsystemDefinition,
  "key" | "title" | "shortTitle" | "description" | "icon" | "accent" | "hostnames"
> & {
  readonly accessLevel: SubsystemAccessLevel;
  readonly isDefault: boolean;
};

const knownRoles = [
  "user",
  "admin",
  "gestor",
  "operador",
  "auditor",
] as const satisfies readonly UserRole[];

function normalizeRole(role: string): UserRole {
  return knownRoles.includes(role as UserRole) ? (role as UserRole) : "user";
}

function item(
  subsystemKey: SubsystemKey,
  accessLevel: SubsystemAccessLevel,
  isDefault = false,
): UserSubsystemAccessMatrixItem {
  return { subsystemKey, accessLevel, isDefault, ativo: true, observacao: null };
}

function allSubsystems(accessLevel: SubsystemAccessLevel) {
  return subsystemDefinitions.map((subsystem, index) =>
    item(subsystem.key, accessLevel, index === 0),
  );
}

function operationalSubsystems(accessLevel: SubsystemAccessLevel) {
  const keys = new Set<SubsystemKey>([
    "hub",
    "planejamento",
    "compras",
    "licitacao",
    "contratos",
    "documentos",
    "workflow",
    "consultas",
  ]);

  return subsystemDefinitions
    .filter((subsystem) => keys.has(subsystem.key))
    .map((subsystem, index) => item(subsystem.key, accessLevel, index === 0));
}

function operatorSubsystems() {
  const keys = new Set<SubsystemKey>([
    "hub",
    "planejamento",
    "compras",
    "licitacao",
    "documentos",
    "workflow",
    "consultas",
  ]);

  return subsystemDefinitions
    .filter((subsystem) => keys.has(subsystem.key))
    .map((subsystem, index) =>
      item(subsystem.key, "OPERATOR", index === 0),
    );
}

export function resolveDefaultSubsystemAccessForRole(
  role: string,
): UserSubsystemAccessMatrixItem[] {
  switch (normalizeRole(role)) {
    case "admin":
      return allSubsystems("ADMIN");
    case "gestor":
      return operationalSubsystems("MANAGER");
    case "operador":
      return operatorSubsystems();
    case "auditor":
      return operationalSubsystems("VIEWER");
    case "user":
    default:
      return [item(getDefaultSubsystem().key, "VIEWER", true)];
  }
}

function normalizeSubsystemKey(value: string): SubsystemKey | null {
  return getSubsystemByKey(value as SubsystemKey)?.key ?? null;
}

function normalizeAccessRows(
  user: AccessUser,
  rows: readonly {
    subsystemKey: string;
    accessLevel: SubsystemAccessLevel;
    isDefault: boolean;
    ativo: boolean;
    observacao: string | null;
  }[],
): UserSubsystemAccessMatrixItem[] {
  if (normalizeRole(user.role) === "admin") {
    return resolveDefaultSubsystemAccessForRole("admin");
  }

  const explicit: UserSubsystemAccessMatrixItem[] = [];
  for (const row of rows) {
    const subsystemKey = normalizeSubsystemKey(row.subsystemKey);
    if (!subsystemKey) continue;

    explicit.push({
      subsystemKey,
      accessLevel: row.accessLevel,
      isDefault: row.isDefault,
      ativo: row.ativo,
      observacao: row.observacao,
    });
  }

  return explicit.length
    ? ensureHubAccess(explicit)
    : resolveDefaultSubsystemAccessForRole(user.role);
}

function ensureHubAccess(
  rows: readonly UserSubsystemAccessMatrixItem[],
): UserSubsystemAccessMatrixItem[] {
  if (rows.some((row) => row.subsystemKey === "hub")) {
    return [...rows];
  }

  return [item("hub", "VIEWER", rows.every((row) => !row.isDefault)), ...rows];
}

export async function getUserSubsystemAccess(
  user: AccessUser,
): Promise<UserSubsystemAccessMatrixItem[]> {
  const db = requireDb();
  let rows: {
    subsystemKey: string;
    accessLevel: SubsystemAccessLevel;
    isDefault: boolean;
    ativo: boolean;
    observacao: string | null;
  }[];

  try {
    rows = await db
      .select({
        subsystemKey: userSubsystemAccess.subsystemKey,
        accessLevel: userSubsystemAccess.accessLevel,
        isDefault: userSubsystemAccess.isDefault,
        ativo: userSubsystemAccess.ativo,
        observacao: userSubsystemAccess.observacao,
      })
      .from(userSubsystemAccess)
      .where(eq(userSubsystemAccess.userId, user.id));
  } catch {
    return resolveDefaultSubsystemAccessForRole(user.role);
  }

  return normalizeAccessRows(user, rows);
}

export async function getUsersSubsystemAccessMap(
  users: readonly AccessUser[],
) {
  if (!users.length) {
    return new Map<number, UserSubsystemAccessMatrixItem[]>();
  }

  const db = requireDb();
  let rows: {
    userId: number;
    subsystemKey: string;
    accessLevel: SubsystemAccessLevel;
    isDefault: boolean;
    ativo: boolean;
    observacao: string | null;
  }[];

  try {
    rows = await db
      .select({
        userId: userSubsystemAccess.userId,
        subsystemKey: userSubsystemAccess.subsystemKey,
        accessLevel: userSubsystemAccess.accessLevel,
        isDefault: userSubsystemAccess.isDefault,
        ativo: userSubsystemAccess.ativo,
        observacao: userSubsystemAccess.observacao,
      })
      .from(userSubsystemAccess)
      .where(
        inArray(
          userSubsystemAccess.userId,
          users.map((user) => user.id),
        ),
      );
  } catch {
    return new Map(
      users.map((user) => [
        user.id,
        resolveDefaultSubsystemAccessForRole(user.role),
      ]),
    );
  }

  const rowsByUser = new Map<number, typeof rows>();
  for (const row of rows) {
    rowsByUser.set(row.userId, [...(rowsByUser.get(row.userId) ?? []), row]);
  }

  return new Map(
    users.map((user) => [
      user.id,
      normalizeAccessRows(user, rowsByUser.get(user.id) ?? []),
    ]),
  );
}

export function getAuthorizedSubsystemsFromMatrix(
  matrix: readonly UserSubsystemAccessMatrixItem[],
): AvailableSubsystem[] {
  const activeAccess = new Map(
    matrix
      .filter((access) => access.ativo)
      .map((access) => [access.subsystemKey, access]),
  );

  const authorized: AvailableSubsystem[] = [];

  for (const subsystem of subsystemDefinitions) {
    const access = activeAccess.get(subsystem.key);
    if (!access) continue;

    authorized.push({
      key: subsystem.key,
      title: subsystem.title,
      shortTitle: subsystem.shortTitle,
      description: subsystem.description,
      icon: subsystem.icon,
      accent: subsystem.accent,
      hostnames: subsystem.hostnames,
      accessLevel: access.accessLevel,
      isDefault: access.isDefault,
    });
  }

  return authorized;
}

export function canAccessSubsystemFromMatrix(
  matrix: readonly UserSubsystemAccessMatrixItem[],
  subsystemKey: SubsystemKey,
  minimumLevel: SubsystemAccessLevel = "VIEWER",
) {
  const access = matrix.find(
    (item) => item.subsystemKey === subsystemKey && item.ativo,
  );

  return Boolean(
    access &&
      subsystemAccessLevelRank[access.accessLevel] >=
        subsystemAccessLevelRank[minimumLevel],
  );
}

export async function canAccessSubsystem(
  user: AccessUser,
  subsystemKey: SubsystemKey,
  minimumLevel: SubsystemAccessLevel = "VIEWER",
) {
  const matrix = await getUserSubsystemAccess(user);
  return canAccessSubsystemFromMatrix(matrix, subsystemKey, minimumLevel);
}

export async function requireSubsystemAccess(
  ctx: AppContext,
  subsystemKey: SubsystemKey = (ctx.subsystem ?? getDefaultSubsystem()).key,
  minimumLevel: SubsystemAccessLevel = "VIEWER",
) {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login obrigatorio" });
  }

  const allowed = await canAccessSubsystem(ctx.user, subsystemKey, minimumLevel);
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Usuario sem permissao para este subsistema.",
    });
  }
}

export function assertSelfAdminAccessPreserved(input: {
  actorId: number | undefined;
  targetUserId: number;
  targetRole: string;
  subsystemAccess: readonly UsuarioSubsystemAccessInput[] | undefined;
}) {
  if (!input.actorId || input.actorId !== input.targetUserId) {
    return;
  }

  if (normalizeRole(input.targetRole) !== "admin") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Um administrador nao pode remover o proprio perfil admin.",
    });
  }

  const adminAccess = input.subsystemAccess?.find(
    (item) => item.subsystemKey === "admin",
  );

  if (
    adminAccess &&
    (!adminAccess.ativo || adminAccess.accessLevel !== "ADMIN")
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Um administrador nao pode remover o proprio acesso administrativo.",
    });
  }
}

export async function saveUserSubsystemAccess(
  params: {
    userId: number;
    role: string;
    access:
      | readonly UsuarioSubsystemAccessInput[]
      | readonly UserSubsystemAccessMatrixItem[]
      | undefined;
    actorId?: number;
  },
) {
  const db = requireDb();
  const fallback = resolveDefaultSubsystemAccessForRole(params.role);
  const normalizedAccess: UserSubsystemAccessMatrixItem[] = [];
  for (const access of params.access?.length ? params.access : fallback) {
    const subsystemKey = normalizeSubsystemKey(access.subsystemKey);
    if (!subsystemKey) continue;

    normalizedAccess.push({
      subsystemKey,
      accessLevel: access.accessLevel,
      isDefault: Boolean(access.isDefault),
      ativo: access.ativo ?? true,
      observacao: access.observacao ?? null,
    });
  }
  const normalized = ensureHubAccess(normalizedAccess);
  const defaultKey =
    normalized.find((access) => access.ativo && access.isDefault)
      ?.subsystemKey ?? normalized.find((access) => access.ativo)?.subsystemKey;
  const now = new Date();

  await db
    .delete(userSubsystemAccess)
    .where(eq(userSubsystemAccess.userId, params.userId));

  if (!normalized.length) {
    return [];
  }

  const values = normalized.map((access) => ({
    userId: params.userId,
    subsystemKey: access.subsystemKey,
    accessLevel: access.accessLevel,
    isDefault: access.subsystemKey === defaultKey,
    ativo: access.ativo,
    observacao: access.observacao ?? null,
    criadoPor: params.actorId ?? null,
    criadoEm: now,
    atualizadoEm: now,
  }));

  await db.insert(userSubsystemAccess).values(values);

  return normalized.map((access) => ({
    ...access,
    isDefault: access.subsystemKey === defaultKey,
  }));
}
