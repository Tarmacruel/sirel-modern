import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Testes nunca devem herdar silenciosamente o banco operacional carregado do
// .env. Suites de integração só são habilitadas com uma URL isolada explícita.
const integrationTestsEnabled =
  process.env.RUN_DB_INTEGRATION_TESTS?.trim().toLowerCase() === "true";
const testConnectionString = process.env.TEST_DATABASE_URL?.trim() ?? "";
const operationalConnectionString = process.env.DATABASE_URL?.trim() ?? "";

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

const connectionString =
  integrationTestsEnabled
    ? testConnectionString
    : process.env.NODE_ENV === "test"
      ? ""
      : operationalConnectionString;

export const databaseEnabled = Boolean(connectionString);

const pool = databaseEnabled
  ? new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 })
  : null;

export const db = pool ? drizzle(pool) : null;

export function requireDb() {
  if (!db) {
    throw new Error(
      integrationTestsEnabled || process.env.NODE_ENV === "test"
        ? "Testes de integracao exigem RUN_DB_INTEGRATION_TESTS=true e TEST_DATABASE_URL isolada"
        : "DATABASE_URL nao configurada para a SIREL",
    );
  }
  return db;
}

export async function closeDb() {
  await pool?.end();
}
