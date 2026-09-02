import type { Request } from "express";
import { describe, expect, it } from "vitest";

import {
  resolveRequestMeta,
  resolveSubsystemFromRequest,
} from "./subsystem-context.js";

function requestWithHeaders(
  headers: Record<string, string>,
  hostname?: string,
): Request {
  return { headers, hostname } as unknown as Request;
}

describe("resolveSubsystemFromRequest", () => {
  it("ignora headers de subsistema e forwarded host controlados pelo cliente", () => {
    const subsystem = resolveSubsystemFromRequest(
      requestWithHeaders({
        "x-sirel-subsystem": "licitacao",
        "x-forwarded-host": "planejamento.sirel.com.br",
        host: "app.sirel.com.br",
      }),
    );

    expect(subsystem.key).toBe("hub");
  });

  it("usa req.hostname quando o proxy confiavel ja o resolveu", () => {
    const subsystem = resolveSubsystemFromRequest(
      requestWithHeaders(
        {
          "x-forwarded-host": "compras.sirel.com.br",
          host: "admin.sirel.com.br",
        },
        "licitacao.sirel.com.br",
      ),
    );

    expect(subsystem.key).toBe("licitacao");
  });

  it("usa host quando nao ha hostname resolvido pelo Express", () => {
    const subsystem = resolveSubsystemFromRequest(
      requestWithHeaders({ host: "admin.sirel.com.br" }),
    );

    expect(subsystem.key).toBe("admin");
  });
});

describe("resolveRequestMeta", () => {
  it("extrai metadados principais da request sem usa-los para autorizacao", () => {
    const meta = resolveRequestMeta(
      requestWithHeaders({
        host: "localhost:3030",
        "x-forwarded-host": "licitacao.sirel.com.br",
        origin: "http://localhost:5173",
        "user-agent": "vitest",
      }),
    );

    expect(meta).toEqual({
      host: "localhost:3030",
      forwardedHost: "licitacao.sirel.com.br",
      origin: "http://localhost:5173",
      userAgent: "vitest",
    });
  });
});
