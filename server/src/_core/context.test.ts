import type { Response } from "express";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { describe, expect, it } from "vitest";

import { createContext } from "./context.js";

describe("createContext", () => {
  it("inclui subsystem e requestMeta no contexto tRPC", async () => {
    const ctx = await createContext({
      req: {
        headers: {
          "x-sirel-subsystem": "licitacao",
          host: "localhost:3030",
          origin: "http://localhost:5173",
          "user-agent": "vitest",
        },
      },
      res: {} as Response,
    } as unknown as CreateExpressContextOptions);

    expect(ctx.subsystem.key).toBe("licitacao");
    expect(ctx.requestMeta).toMatchObject({
      host: "localhost:3030",
      origin: "http://localhost:5173",
      userAgent: "vitest",
    });
  });
});
