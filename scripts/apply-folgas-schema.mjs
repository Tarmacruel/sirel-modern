import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL ?? "";

if (!connectionString) {
  console.error("DATABASE_URL não configurada. Abortando sem alterar o banco.");
  process.exit(2);
}

const pool = new Pool({ connectionString, max: 2, idleTimeoutMillis: 10_000 });

const migrationUrl = new URL(
  "../drizzle/migrations/0062_sirel_folgas.sql",
  import.meta.url,
);
const statements = (await import("node:fs/promises")).readFile(
  migrationUrl,
  "utf8",
);

const client = await pool.connect();
try {
  await client.query("BEGIN");
  for (const statement of (await statements).split(
    "--> statement-breakpoint",
  )) {
    await client.query(statement);
  }
  await client.query("COMMIT");
  console.log("SIREL Folgas: schema aplicado/validado com sucesso.");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("SIREL Folgas: falha ao aplicar schema.", error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
