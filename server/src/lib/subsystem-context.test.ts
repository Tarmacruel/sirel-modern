import type { Request } from "express";
import { describe, expect, it } from "vitest";

import {
  requireSubsystemAccess,
  resolveRequestMeta,
  resolveSubsystemFromRequest,
} from "./subsystem-context.js";

function requestWithHeaders(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

describe("resolveSubsystemFromRequest", () => {
  it("prioriza x-sirel-subsystem valido", () => {
    const subsystem = resolveSubsystemFromRequest(
      requestWithHeaders({
        "x-sirel-subsystem": "licitacao",
        "x-forwarded-host": "planejamento.sirel.com.br",
        host: "app.sirel.com.br",
      }),
    );

    expect(subsystem.key).toBe("licitacao");
  });

  it("usa x-forwarded-host antes de host", () => {
    const subsystem = resolveSubsystemFromRequest(
      requestWithHeaders({
        "x-forwarded-host": "compras.sirel.com.br",
        host: "admin.sirel.com.br",
      }),
    );

    expect(subsystem.key).toBe("compras");
  });

  it("usa host quando nao ha forwarded host", () => {
    const subsystem = resolveSubsystemFromRequest(
      requestWithHeaders({ host: "admin.sirel.com.br" }),
    );

    expect(subsystem.key).toBe("admin");
  });

  it("ignora x-sirel-subsystem invalido e resolve pelo host", () => {
    const subsystem = resolveSubsystemFromRequest(
      requestWithHeaders({
        "x-sirel-subsystem": "invalido",
        host: "planejamento.sirel.com.br",
      }),
    );

    expect(subsystem.key).toBe("planejamento");
  });
});

describe("resolveRequestMeta", () => {
  it("extrai metadados principais da request", () => {
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

describe("requireSubsystemAccess", () => {
  it("permite admin independente do subsistema atual", () => {
    expect(() =>
      requireSubsystemAccess(
        {
          user: { role: "admin" },
          subsystem: { key: "admin" },
        } as any,
        ["licitacao"],
      ),
    ).not.toThrow();
  });

  it("bloqueia usuario fora do subsistema permitido", () => {
    expect(() =>
      requireSubsystemAccess(
        {
          user: { role: "gestor" },
          subsystem: { key: "compras" },
        } as any,
        ["licitacao"],
      ),
    ).toThrow("Recurso indisponível neste subsistema");
  });
});
