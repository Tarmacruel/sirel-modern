import { describe, expect, it } from "vitest";

import { getAllowedRoutes } from "@/app/routes";
import {
  getSubsystemByKey,
  type SubsystemKey,
} from "@sirel/shared/subsystems";

function allowedPathsFor(subsystemKey: SubsystemKey, role = "gestor") {
  const subsystem = getSubsystemByKey(subsystemKey);

  if (!subsystem) {
    throw new Error(`Subsystem ${subsystemKey} not found`);
  }

  return getAllowedRoutes({ subsystem, user: { role } }).map(
    (route) => route.path,
  );
}

describe("getAllowedRoutes", () => {
  it("preserva URLs diretas de Licitacao", () => {
    const paths = allowedPathsFor("licitacao");

    expect(paths).toContain("/");
    expect(paths).toContain("/licitacao");
    expect(paths).toContain("/licitacao/:processoId");
    expect(paths).toContain("/documentos");
    expect(paths).not.toContain("/usuarios");
  });

  it("preserva URLs diretas de Planejamento", () => {
    const paths = allowedPathsFor("planejamento");

    expect(paths).toContain("/");
    expect(paths).toContain("/planejamento");
    expect(paths).toContain("/planejamento/dfd/:processoId");
    expect(paths).toContain("/planejamento/pca");
    expect(paths).not.toContain("/licitacao");
  });

  it("preserva URLs diretas administrativas apenas para admin", () => {
    const adminPaths = allowedPathsFor("admin", "admin");
    const gestorPaths = allowedPathsFor("admin", "gestor");

    expect(adminPaths).toContain("/");
    expect(adminPaths).toContain("/usuarios");
    expect(adminPaths).toContain("/parametros");
    expect(adminPaths).toContain("/auditoria");
    expect(gestorPaths).not.toContain("/usuarios");
  });
});
