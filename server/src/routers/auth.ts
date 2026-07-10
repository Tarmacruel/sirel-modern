import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

import {
  changePasswordInputSchema,
  completeIdentityProfileInputSchema,
  completePasswordResetInputSchema,
  recoverUsernameInputSchema,
  requestPasswordResetInputSchema,
  type IdentityCompletionMode,
  type IdentityMissingField,
} from "@sirel/shared/schemas/auth-recovery";
import { z } from "zod";

import { authLog, authRecoveryChallenges, pessoas, users } from "../db/schema.js";
import { logAuthEvent } from "../db/auth-log.js";
import { requireDb } from "../db/client.js";
import {
  clearSessionCookie,
  createSessionToken,
  setSessionCookie,
} from "../lib/auth-session.js";
import { hashPassword, verifyPassword } from "../lib/auth-password.js";
import {
  getAuthorizedSubsystemsFromMatrix,
  getUserSubsystemAccess,
} from "../lib/subsystem-access.js";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../trpc.js";

const LOGIN_WINDOW_MINUTES = 15;
const RECOVERY_WINDOW_MINUTES = 15;
const RECOVERY_TOKEN_TTL_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;
const PASSWORD_RESET_PURPOSE = "PASSWORD_RESET";
const USERNAME_RECOVERY_PURPOSE = "USERNAME_RECOVERY";
const RECOVERY_GENERIC_MESSAGE =
  "Se os dados informados conferirem com o cadastro, a acao solicitada sera liberada.";

const loginInputSchema = z.object({
  login: z.string().trim().min(3).max(120),
  password: z.string().min(6).max(120),
});

type PessoaIdentityRow = Pick<
  typeof pessoas.$inferSelect,
  "id" | "nome" | "cpf" | "matricula" | "dataNascimento" | "secretariaId"
>;

function toSessionUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username || row.email || `user-${row.id}`,
    name: row.name,
    email: row.email ?? null,
    role: row.role,
    secretariaId: row.secretariaId ?? null,
    sessionVersion: row.sessionVersion ?? 1,
  };
}

function normalizeCpf(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeMatricula(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeLogin(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toNullableDate(value: string | null | undefined) {
  const normalized = normalizeDate(value);
  return normalized || null;
}

function maskCpf(value: string | null | undefined) {
  const digits = normalizeCpf(value);
  if (digits.length !== 11) return null;
  return `***.${digits.slice(3, 6)}.***-${digits.slice(9)}`;
}

function maskMatricula(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length <= 2) return `${normalized[0] ?? "*"}***`;
  return `${normalized.slice(0, 2)}***${normalized.slice(-1)}`;
}

function maskUsername(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;
  const [name, domain] = normalized.split("@");
  const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return domain ? `${visible}***@${domain}` : `${visible}***`;
}

function getSecret() {
  return process.env.JWT_SECRET || "sirel-secret";
}

function fingerprint(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

function hashChallenge(value: string) {
  return createHash("sha256").update(`${getSecret()}:${value}`).digest("hex");
}

function safeHashEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveClientIp(value: unknown) {
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }

  if (!value) return null;
  return String(value).split(",")[0]?.trim() || null;
}

function resolveRequestIp(ctx: {
  req: {
    headers: Record<string, unknown>;
    socket: { remoteAddress?: string | undefined };
  };
}) {
  return (
    resolveClientIp(ctx.req.headers["x-forwarded-for"]) ??
    resolveClientIp(ctx.req.socket.remoteAddress) ??
    "local"
  );
}

function assertPublicRecoveryTransport(ctx: { req: { headers: Record<string, unknown> } }) {
  if (process.env.NODE_ENV !== "production") return;
  const forwardedProto = resolveClientIp(ctx.req.headers["x-forwarded-proto"]);
  if (forwardedProto === "https") return;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Recuperacao publica disponivel apenas em HTTPS.",
  });
}

function getIdentityCompletionMode(): IdentityCompletionMode {
  const raw =
    process.env["AUTH.IDENTITY_COMPLETION_MODE"] ??
    process.env.AUTH_IDENTITY_COMPLETION_MODE ??
    "REMINDER";
  return raw === "REQUIRED" ? "REQUIRED" : "REMINDER";
}

function buildIdentityProfile(
  user: typeof users.$inferSelect,
  pessoa: PessoaIdentityRow | null,
) {
  const missingFields: IdentityMissingField[] = [];
  if (!user.pessoaId || !pessoa) missingFields.push("PESSOA_LINK");

  const cpfDigits = normalizeCpf(pessoa?.cpf);
  if (cpfDigits.length !== 11) missingFields.push("CPF");

  if (!normalizeMatricula(pessoa?.matricula)) missingFields.push("MATRICULA");
  if (!pessoa?.dataNascimento) missingFields.push("DATA_NASCIMENTO");

  return {
    pessoaId: user.pessoaId ?? null,
    complete: missingFields.length === 0,
    missingFields,
    cpfMasked: maskCpf(pessoa?.cpf),
    matriculaMasked: maskMatricula(pessoa?.matricula),
    dataNascimentoPresent: Boolean(pessoa?.dataNascimento),
  };
}

async function loadPessoaById(pessoaId: number | null | undefined) {
  if (!pessoaId) return null;
  const db = requireDb();
  const [row] = await db
    .select({
      id: pessoas.id,
      nome: pessoas.nome,
      cpf: pessoas.cpf,
      matricula: pessoas.matricula,
      dataNascimento: pessoas.dataNascimento,
      secretariaId: pessoas.secretariaId,
    })
    .from(pessoas)
    .where(eq(pessoas.id, pessoaId))
    .limit(1);

  return row ?? null;
}

async function toAuthResponseUser(row: typeof users.$inferSelect) {
  const sessionUser = toSessionUser(row);
  const subsystemAccess = await getUserSubsystemAccess(sessionUser);
  const availableSubsystems = getAuthorizedSubsystemsFromMatrix(subsystemAccess);
  const defaultSubsystemKey =
    subsystemAccess.find((access) => access.ativo && access.isDefault)
      ?.subsystemKey ??
    availableSubsystems[0]?.key ??
    "hub";
  const pessoa = await loadPessoaById(row.pessoaId);
  const identityProfile = buildIdentityProfile(row, pessoa);

  return {
    ...sessionUser,
    subsystemAccess,
    availableSubsystems,
    defaultSubsystemKey,
    identityProfile,
    requiresIdentityCompletion: !identityProfile.complete,
    identityCompletionMode: getIdentityCompletionMode(),
  };
}

function identityMatchWhere(input: {
  cpf: string;
  matricula?: string | null;
  dataNascimento: string;
}) {
  const cpf = normalizeCpf(input.cpf);
  const matricula = normalizeMatricula(input.matricula);
  const filters: any[] = [
    sql`regexp_replace(coalesce(${pessoas.cpf}, ''), '[^0-9]', '', 'g') = ${cpf}`,
    eq(pessoas.dataNascimento, input.dataNascimento),
  ];

  if (matricula) {
    filters.push(sql`lower(trim(coalesce(${pessoas.matricula}, ''))) = ${matricula}`);
  }

  return and(...filters);
}

async function assertRecoveryRateLimit(input: {
  purpose: string;
  ipFingerprint: string;
  usernameFingerprint: string | null;
  identityFingerprint: string;
}) {
  const db = requireDb();
  const cutoff = new Date(Date.now() - RECOVERY_WINDOW_MINUTES * 60 * 1000);
  const candidates = [
    eq(authRecoveryChallenges.ipFingerprint, input.ipFingerprint),
    input.usernameFingerprint
      ? eq(authRecoveryChallenges.usernameFingerprint, input.usernameFingerprint)
      : undefined,
    eq(authRecoveryChallenges.identityFingerprint, input.identityFingerprint),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const [row] = await db
      .select({ total: count() })
      .from(authRecoveryChallenges)
      .where(
        and(
          eq(authRecoveryChallenges.purpose, input.purpose),
          gte(authRecoveryChallenges.createdAt, cutoff),
          candidate,
        ),
      );

    if (Number(row?.total ?? 0) >= MAX_FAILED_ATTEMPTS) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Muitas tentativas. Aguarde ${RECOVERY_WINDOW_MINUTES} minutos e tente novamente.`,
      });
    }
  }
}

async function auditRecoveryAttempt(input: {
  purpose: string;
  userId?: number | null;
  ipFingerprint: string;
  usernameFingerprint?: string | null;
  identityFingerprint: string;
  tokenHash?: string;
  expiresAt?: Date;
  usedAt?: Date | null;
}) {
  const db = requireDb();
  await db.insert(authRecoveryChallenges).values({
    userId: input.userId ?? null,
    purpose: input.purpose,
    challengeHash: input.tokenHash ?? hashChallenge(randomBytes(16).toString("base64url")),
    usernameFingerprint: input.usernameFingerprint ?? null,
    identityFingerprint: input.identityFingerprint,
    ipFingerprint: input.ipFingerprint,
    expiresAt: input.expiresAt ?? new Date(Date.now() + RECOVERY_WINDOW_MINUTES * 60 * 1000),
    usedAt: input.usedAt ?? null,
    attempts: 0,
    createdAt: new Date(),
  });
}

async function findUserForPasswordReset(input: {
  username: string;
  cpf: string;
  matricula: string;
  dataNascimento: string;
}) {
  const db = requireDb();
  const normalizedLogin = normalizeLogin(input.username);
  const [row] = await db
    .select({ user: users })
    .from(users)
    .leftJoin(pessoas, eq(pessoas.id, users.pessoaId))
    .where(
      and(
        eq(users.ativo, true),
        or(eq(users.username, normalizedLogin), eq(users.email, normalizedLogin)),
        identityMatchWhere(input),
      ),
    )
    .limit(1);

  return row?.user ?? null;
}

async function findPessoaForCompletion(input: {
  cpf: string;
  matricula: string;
  dataNascimento: string;
}) {
  const db = requireDb();
  const exactRows = await db
    .select()
    .from(pessoas)
    .where(identityMatchWhere(input))
    .limit(2);

  if (exactRows.length > 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Mais de uma pessoa confere com os dados informados. Acione o suporte.",
    });
  }

  if (exactRows[0]) return exactRows[0];
  return null;
}

export const authRouter = router({
  login: publicProcedure.input(loginInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const normalizedLogin = normalizeLogin(input.login);
    const ipAddress = resolveRequestIp(ctx);
    const lockoutCutoff = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000);

    const recentFailures = await db
      .select({ id: authLog.id })
      .from(authLog)
      .where(
        and(
          eq(authLog.loginNormalizado, normalizedLogin),
          eq(authLog.evento, "LOGIN_FAILURE"),
          gte(authLog.criadoEm, lockoutCutoff),
        ),
      )
      .limit(MAX_FAILED_ATTEMPTS);

    if (recentFailures.length >= MAX_FAILED_ATTEMPTS) {
      await logAuthEvent({
        loginInformado: input.login,
        loginNormalizado: normalizedLogin,
        ipAddress,
        evento: "LOGIN_BLOCKED",
        detalhe: `Bloqueio temporario apos ${MAX_FAILED_ATTEMPTS} tentativas invalidas em ${LOGIN_WINDOW_MINUTES} minutos.`,
      });

      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Login temporariamente bloqueado por ${LOGIN_WINDOW_MINUTES} minutos. Aguarde e tente novamente.`,
      });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.ativo, true),
          or(eq(users.username, normalizedLogin), eq(users.email, normalizedLogin)),
        ),
      )
      .limit(1);

    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      await logAuthEvent({
        userId: user?.id ?? null,
        loginInformado: input.login,
        loginNormalizado: normalizedLogin,
        ipAddress,
        evento: "LOGIN_FAILURE",
        detalhe: "Credencial invalida no login local.",
      });

      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Usuario ou senha invalidos",
      });
    }

    const responseUser = await toAuthResponseUser(user);
    const token = createSessionToken(responseUser);
    setSessionCookie(ctx.res, ctx.req, token);

    await db
      .update(users)
      .set({
        lastSignedIn: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await logAuthEvent({
      userId: user.id,
      loginInformado: input.login,
      loginNormalizado: normalizedLogin,
      ipAddress,
      evento: "LOGIN_SUCCESS",
      detalhe: "Login realizado com sucesso no ambiente local.",
    });

    return {
      token,
      user: responseUser,
    };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb();
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, ctx.user!.id), eq(users.ativo, true)))
      .limit(1);

    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Sessao invalida ou usuario inativo.",
      });
    }

    return { user: await toAuthResponseUser(user) };
  }),

  recoverUsername: publicProcedure.input(recoverUsernameInputSchema).mutation(async ({ ctx, input }) => {
    assertPublicRecoveryTransport(ctx);
    const db = requireDb();
    const ipFingerprint = fingerprint(`ip:${resolveRequestIp(ctx)}`);
    const identityFingerprint = fingerprint(
      `username:${normalizeCpf(input.cpf)}:${normalizeMatricula(input.matricula)}:${normalizeDate(input.dataNascimento)}`,
    );

    await assertRecoveryRateLimit({
      purpose: USERNAME_RECOVERY_PURPOSE,
      ipFingerprint,
      usernameFingerprint: null,
      identityFingerprint,
    });

    const rows = await db
      .select({ user: users })
      .from(users)
      .leftJoin(pessoas, eq(pessoas.id, users.pessoaId))
      .where(and(eq(users.ativo, true), identityMatchWhere(input)))
      .orderBy(desc(users.updatedAt))
      .limit(3);

    await auditRecoveryAttempt({
      purpose: USERNAME_RECOVERY_PURPOSE,
      userId: rows[0]?.user.id ?? null,
      ipFingerprint,
      identityFingerprint,
      usedAt: new Date(),
    });

    return {
      success: true,
      message: RECOVERY_GENERIC_MESSAGE,
      usernameHints: (rows.length === 1 ? rows : [])
        .map((row) => maskUsername(row.user.username ?? row.user.email))
        .filter((item): item is string => Boolean(item)),
    };
  }),

  requestPasswordReset: publicProcedure.input(requestPasswordResetInputSchema).mutation(async ({ ctx, input }) => {
    assertPublicRecoveryTransport(ctx);
    const db = requireDb();
    const normalizedLogin = normalizeLogin(input.username);
    const ipFingerprint = fingerprint(`ip:${resolveRequestIp(ctx)}`);
    const usernameFingerprint = fingerprint(`username:${normalizedLogin}`);
    const identityFingerprint = fingerprint(
      `reset:${normalizedLogin}:${normalizeCpf(input.cpf)}:${normalizeMatricula(input.matricula)}:${normalizeDate(input.dataNascimento)}`,
    );

    await assertRecoveryRateLimit({
      purpose: PASSWORD_RESET_PURPOSE,
      ipFingerprint,
      usernameFingerprint,
      identityFingerprint,
    });

    const user = await findUserForPasswordReset(input);
    if (!user) {
      await auditRecoveryAttempt({
        purpose: PASSWORD_RESET_PURPOSE,
        ipFingerprint,
        usernameFingerprint,
        identityFingerprint,
        usedAt: new Date(),
      });

      return {
        success: true,
        message: RECOVERY_GENERIC_MESSAGE,
        resetToken: null as string | null,
      };
    }

    const resetToken = randomBytes(32).toString("base64url");
    await auditRecoveryAttempt({
      purpose: PASSWORD_RESET_PURPOSE,
      userId: user.id,
      ipFingerprint,
      usernameFingerprint,
      identityFingerprint,
      tokenHash: hashChallenge(resetToken),
      expiresAt: new Date(Date.now() + RECOVERY_TOKEN_TTL_MINUTES * 60 * 1000),
    });

    return {
      success: true,
      message: RECOVERY_GENERIC_MESSAGE,
      resetToken,
    };
  }),

  completePasswordReset: publicProcedure.input(completePasswordResetInputSchema).mutation(async ({ ctx, input }) => {
    assertPublicRecoveryTransport(ctx);
    const db = requireDb();
    const normalizedLogin = normalizeLogin(input.username);
    const tokenHash = hashChallenge(input.resetToken);
    const challengeRows = await db
      .select({ challenge: authRecoveryChallenges, user: users })
      .from(authRecoveryChallenges)
      .leftJoin(users, eq(users.id, authRecoveryChallenges.userId))
      .where(
        and(
          eq(authRecoveryChallenges.purpose, PASSWORD_RESET_PURPOSE),
          isNull(authRecoveryChallenges.usedAt),
          gte(authRecoveryChallenges.expiresAt, new Date()),
          or(eq(users.username, normalizedLogin), eq(users.email, normalizedLogin)),
        ),
      )
      .orderBy(desc(authRecoveryChallenges.createdAt))
      .limit(10);

    if (challengeRows.some((row) => row.challenge.attempts >= MAX_FAILED_ATTEMPTS)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Muitas tentativas. Aguarde ${RECOVERY_WINDOW_MINUTES} minutos e solicite um novo codigo.`,
      });
    }

    const challenge = challengeRows.find((row) =>
      safeHashEquals(row.challenge.challengeHash, tokenHash),
    );

    if (!challenge?.user) {
      const activeChallengeIds = challengeRows.map((row) => row.challenge.id);
      if (activeChallengeIds.length) {
        await db
          .update(authRecoveryChallenges)
          .set({
            attempts: sql`${authRecoveryChallenges.attempts} + 1`,
          })
          .where(inArray(authRecoveryChallenges.id, activeChallengeIds));
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Codigo expirado ou invalido.",
      });
    }

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(input.newPassword),
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, challenge.user.id));

    await db
      .update(authRecoveryChallenges)
      .set({
        usedAt: new Date(),
        attempts: sql`${authRecoveryChallenges.attempts} + 1`,
      })
      .where(eq(authRecoveryChallenges.id, challenge.challenge.id));

    await logAuthEvent({
      userId: challenge.user.id,
      loginInformado: challenge.user.username ?? challenge.user.email ?? String(challenge.user.id),
      loginNormalizado: challenge.user.username ?? challenge.user.email ?? String(challenge.user.id),
      ipAddress: resolveRequestIp(ctx),
      evento: "PASSWORD_RESET",
      detalhe: "Senha redefinida por recuperacao de identidade.",
    });

    return { success: true };
  }),

  changePassword: protectedProcedure.input(changePasswordInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const userId = ctx.user?.id;
    if (!userId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Login obrigatorio." });
    }

    const [currentUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado." });
    }
    if (!verifyPassword(input.currentPassword, currentUser.passwordHash)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Senha atual invalida." });
    }

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(input.newPassword),
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await logAuthEvent({
      userId,
      loginInformado: currentUser.username ?? currentUser.email ?? String(currentUser.id),
      loginNormalizado: currentUser.username ?? currentUser.email ?? String(currentUser.id),
      ipAddress: resolveRequestIp(ctx),
      evento: "PASSWORD_CHANGE",
      detalhe: "Senha alterada pelo proprio usuario.",
    });

    return { success: true };
  }),

  completeIdentityProfile: protectedProcedure.input(completeIdentityProfileInputSchema).mutation(async ({ ctx, input }) => {
    const db = requireDb();
    const userId = ctx.user?.id;
    if (!userId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Login obrigatorio." });
    }

    const [currentUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado." });
    }

    const normalizedCpf = normalizeCpf(input.cpf);
    const normalizedMatricula = normalizeMatricula(input.matricula);
    const dataNascimento = toNullableDate(input.dataNascimento);
    const linkedPessoa = currentUser.pessoaId
      ? await loadPessoaById(currentUser.pessoaId)
      : await findPessoaForCompletion({
          cpf: input.cpf,
          matricula: input.matricula,
          dataNascimento: input.dataNascimento,
        });

    const now = new Date();
    const pessoaId = linkedPessoa?.id ?? null;

    if (!linkedPessoa || !pessoaId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Nao encontramos pessoa/servidor com os dados informados. Acione o suporte para vincular o cadastro.",
      });
    }

    const existingCpf = normalizeCpf(linkedPessoa.cpf);
    const existingMatricula = normalizeMatricula(linkedPessoa.matricula);
    const existingDataNascimento = normalizeDate(linkedPessoa.dataNascimento);

    if (existingCpf && existingCpf !== normalizedCpf) {
      throw new TRPCError({ code: "CONFLICT", message: "CPF diferente do cadastro vinculado." });
    }
    if (existingMatricula && existingMatricula !== normalizedMatricula) {
      throw new TRPCError({ code: "CONFLICT", message: "Matricula diferente do cadastro vinculado." });
    }
    if (existingDataNascimento && existingDataNascimento !== dataNascimento) {
      throw new TRPCError({ code: "CONFLICT", message: "Data de nascimento diferente do cadastro vinculado." });
    }

    const [existingLink] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.pessoaId, pessoaId), sql`${users.id} <> ${userId}`))
      .limit(1);

    if (existingLink) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Pessoa ja vinculada a outro usuario. Acione o suporte.",
      });
    }

    await db
      .update(pessoas)
      .set({
        cpf: linkedPessoa.cpf || normalizedCpf,
        matricula: linkedPessoa.matricula || input.matricula.trim(),
        dataNascimento: linkedPessoa.dataNascimento || dataNascimento,
        secretariaId: linkedPessoa.secretariaId ?? currentUser.secretariaId ?? null,
        atualizadoEm: now,
      })
      .where(eq(pessoas.id, linkedPessoa.id));

    await db
      .update(users)
      .set({
        pessoaId,
        identityProfileCompletedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    const [updatedUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!updatedUser) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Usuario nao encontrado." });
    }

    return { user: await toAuthResponseUser(updatedUser) };
  }),

  identityQualityReport: adminProcedure.query(async () => {
    const db = requireDb();
    const result = await db.execute(sql`
      select issue_type, reference_id, label, detail, severity
      from auth_identity_quality_report
      order by severity, issue_type, label
      limit 1000;
    `);

    return {
      items: result.rows.map((row) => ({
        issueType: String(row.issue_type ?? ""),
        referenceId: Number(row.reference_id ?? 0),
        label: String(row.label ?? ""),
        detail: String(row.detail ?? ""),
        severity: String(row.severity ?? ""),
      })),
    };
  }),

  logout: publicProcedure.mutation(({ ctx }) => {
    clearSessionCookie(ctx.res, ctx.req);
    return { success: true };
  }),
});
