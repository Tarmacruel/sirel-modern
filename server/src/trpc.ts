import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";

import type { AppContext } from "./_core/context.js";
import { requireAdmin, requireAuditor, requireGestor, requireOperador } from "./auth.js";
import { requireDb } from "./db/client.js";
import { users } from "./db/schema.js";
import { requireSubsystemAccess } from "./lib/subsystem-access.js";

const t = initTRPC.context<AppContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

async function loadSessionGuardUser(userId: number) {
  const db = requireDb();
  try {
    const [currentUser] = await db
      .select({
        id: users.id,
        ativo: users.ativo,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return currentUser ?? null;
  } catch (error) {
    if ((error as { code?: string }).code !== "42703") {
      throw error;
    }

    const [currentUser] = await db
      .select({
        id: users.id,
        ativo: users.ativo,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return currentUser ? { ...currentUser, sessionVersion: 1 } : null;
  }
}

export const protectedProcedure = t.procedure.use(async ({ ctx, next, path }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Login obrigatorio" });
  }
  const currentUser = await loadSessionGuardUser(ctx.user.id);

  if (
    !currentUser?.ativo ||
    currentUser.sessionVersion !== (ctx.user.sessionVersion ?? 1)
  ) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Sessao expirada. Entre novamente.",
    });
  }

  if (path !== "auth.me") {
    await requireSubsystemAccess(ctx);
  }
  return next({ ctx });
});

export const operadorProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireOperador(ctx);
  return next({ ctx });
});

export const gestorProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireGestor(ctx);
  return next({ ctx });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireAdmin(ctx);
  return next({ ctx });
});

export const auditorProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireAuditor(ctx);
  return next({ ctx });
});
