import "dotenv/config";

import type { Config } from "drizzle-kit";

const integrationTestsEnabled =
  process.env.RUN_DB_INTEGRATION_TESTS?.trim().toLowerCase() === "true";
const testConnectionString = process.env.TEST_DATABASE_URL?.trim() ?? "";
const operationalConnectionString = process.env.DATABASE_URL?.trim() ?? "";

if (process.env.SIREL_HOMOLOGACAO === "true") {
  const url = operationalConnectionString ? new URL(operationalConnectionString) : null;
  if (integrationTestsEnabled || !url || url.pathname !== "/sirel_teste" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("As migrações de homologação devem usar o banco local sirel_teste.");
  }
}

function databaseIdentity(connectionUrl: string) {
  const url = new URL(connectionUrl);
  const port =
    url.port ||
    (url.protocol === "postgresql:" || url.protocol === "postgres:"
      ? "5432"
      : "");
  return `${url.hostname.toLowerCase()}:${port}/${decodeURIComponent(
    url.pathname.replace(/^\//, ""),
  )}`;
}

if (integrationTestsEnabled) {
  if (!testConnectionString) {
    throw new Error(
      "RUN_DB_INTEGRATION_TESTS=true exige TEST_DATABASE_URL explicita",
    );
  }
  if (
    operationalConnectionString &&
    databaseIdentity(testConnectionString) ===
      databaseIdentity(operationalConnectionString)
  ) {
    throw new Error(
      "TEST_DATABASE_URL deve apontar para um banco diferente de DATABASE_URL",
    );
  }
}

export default {
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: integrationTestsEnabled
      ? testConnectionString
      : operationalConnectionString,
  },
  verbose: true,
  strict: true,
} satisfies Config;
