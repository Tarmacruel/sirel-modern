import type { inferAsyncReturnType } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

import { db, databaseEnabled } from "../db/client.js";
import { resolveRequestUser } from "../lib/request-auth.js";
import {
  resolveRequestMeta,
  resolveSubsystemFromRequest,
} from "../lib/subsystem-context.js";

export async function createContext(opts: CreateExpressContextOptions) {
  return {
    req: opts.req,
    res: opts.res,
    db,
    databaseEnabled,
    user: resolveRequestUser(opts.req),
    subsystem: resolveSubsystemFromRequest(opts.req),
    requestMeta: resolveRequestMeta(opts.req),
  };
}

export type AppContext = inferAsyncReturnType<typeof createContext>;
