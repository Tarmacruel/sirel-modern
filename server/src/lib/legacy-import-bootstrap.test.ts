import { describe, expect, it } from "vitest";

import { resolveLegacyImportBootstrap } from "./legacy-import-bootstrap.js";

describe("resolveLegacyImportBootstrap", () => {
  const validEnvironment = {
    SIREL_DEFAULT_PASSWORD: "senha-inicial-segura",
    SIREL_ADMIN_USERNAME: "Admin Principal",
    SIREL_ADMIN_NAME: "Administrador Principal",
    SIREL_ADMIN_EMAIL: "ADMIN@EXEMPLO.LOCAL ",
  };

  it("exige senha inicial explicita, sem fallback previsivel", () => {
    expect(() =>
      resolveLegacyImportBootstrap({
        SIREL_ADMIN_USERNAME: validEnvironment.SIREL_ADMIN_USERNAME,
        SIREL_ADMIN_NAME: validEnvironment.SIREL_ADMIN_NAME,
      }),
    ).toThrow("SIREL_DEFAULT_PASSWORD");
  });

  it("recusa senha inicial curta", () => {
    expect(() =>
      resolveLegacyImportBootstrap({
        ...validEnvironment,
        SIREL_DEFAULT_PASSWORD: "curta",
      }),
    ).toThrow("pelo menos 12 caracteres");
  });

  it("normaliza somente os dados explicitamente configurados", () => {
    expect(resolveLegacyImportBootstrap(validEnvironment)).toEqual({
      defaultPassword: "senha-inicial-segura",
      adminUsername: "admin.principal",
      adminName: "Administrador Principal",
      adminEmail: "admin@exemplo.local",
    });
  });
});
