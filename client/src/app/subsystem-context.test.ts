import { describe, expect, it } from "vitest";

import { resolveSubsystemFromLocation } from "@/app/subsystem-context";

describe("resolveSubsystemFromLocation", () => {
  it("prioriza ?subsystem em desenvolvimento", () => {
    const subsystem = resolveSubsystemFromLocation(
      { hostname: "localhost", search: "?subsystem=licitacao" },
      { isDev: true },
    );

    expect(subsystem.key).toBe("licitacao");
  });

  it("ignora ?subsystem fora de desenvolvimento", () => {
    const subsystem = resolveSubsystemFromLocation(
      { hostname: "admin.sirel.com.br", search: "?subsystem=licitacao" },
      { isDev: false },
    );

    expect(subsystem.key).toBe("admin");
  });

  it("resolve pelo hostname quando nao ha override local", () => {
    const subsystem = resolveSubsystemFromLocation(
      { hostname: "planejamento.sirel.com.br", search: "" },
      { isDev: true },
    );

    expect(subsystem.key).toBe("planejamento");
  });

  it("mantem hub como fallback para hosts desconhecidos", () => {
    const subsystem = resolveSubsystemFromLocation(
      { hostname: "desconhecido.sirel.com.br", search: "" },
      { isDev: true },
    );

    expect(subsystem.key).toBe("hub");
  });
});
