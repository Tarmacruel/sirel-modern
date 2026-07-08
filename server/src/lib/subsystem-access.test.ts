import { describe, expect, it } from "vitest";

import {
  canAccessSubsystemFromMatrix,
  getAuthorizedSubsystemsFromMatrix,
  resolveDefaultSubsystemAccessForRole,
} from "./subsystem-access.js";

describe("resolveDefaultSubsystemAccessForRole", () => {
  it("libera admin em todos os subsistemas", () => {
    const matrix = resolveDefaultSubsystemAccessForRole("admin");

    expect(matrix).toHaveLength(9);
    expect(matrix.every((access) => access.accessLevel === "ADMIN")).toBe(true);
    expect(canAccessSubsystemFromMatrix(matrix, "admin", "ADMIN")).toBe(true);
  });

  it("mantem usuario comum apenas no hub por padrao", () => {
    const matrix = resolveDefaultSubsystemAccessForRole("user");

    expect(matrix).toEqual([
      {
        subsystemKey: "hub",
        accessLevel: "VIEWER",
        isDefault: true,
        ativo: true,
        observacao: null,
      },
    ]);
  });

  it("gera lista de subsistemas autorizados sem itens inativos", () => {
    const matrix = [
      {
        subsystemKey: "hub",
        accessLevel: "VIEWER",
        isDefault: true,
        ativo: true,
        observacao: null,
      },
      {
        subsystemKey: "licitacao",
        accessLevel: "OPERATOR",
        isDefault: false,
        ativo: true,
        observacao: null,
      },
      {
        subsystemKey: "admin",
        accessLevel: "ADMIN",
        isDefault: false,
        ativo: false,
        observacao: null,
      },
    ] as const;

    const subsystems = getAuthorizedSubsystemsFromMatrix(matrix);

    expect(subsystems.map((subsystem) => subsystem.key)).toEqual([
      "hub",
      "licitacao",
    ]);
  });
});
