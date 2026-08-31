import "../bootstrap/load-env.js";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { sql } from "drizzle-orm";

import { closeDb, requireDb } from "../db/client.js";
import { projectRoot } from "../lib/project-root.js";

type CheckRow = {
  object_name: string;
  present: boolean;
};

async function main() {
  const db = requireDb();
  const result = await db.execute(sql`
    select 'table:cargos' as object_name,
      to_regclass('public.cargos') is not null as present
    union all
    select 'table:funcoes',
      to_regclass('public.funcoes') is not null
    union all
    select 'column:pessoas.cargo_id',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'pessoas' and column_name = 'cargo_id'
      )
    union all
    select 'column:pessoas.funcao_id',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'pessoas' and column_name = 'funcao_id'
      )
    union all
    select 'column:pessoas.cargo_length_255',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'pessoas'
          and column_name = 'cargo'
          and (character_maximum_length is null or character_maximum_length >= 255)
      )
    union all
    select 'column:pessoas.matricula',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'pessoas' and column_name = 'matricula'
      )
    union all
    select 'column:pessoas.data_nascimento',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'pessoas' and column_name = 'data_nascimento'
      )
    union all
    select 'column:users.pessoa_id',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'users' and column_name = 'pessoa_id'
      )
    union all
    select 'column:users.identity_profile_completed_at',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'users' and column_name = 'identity_profile_completed_at'
      )
    union all
    select 'constraint:pessoas.cargo_id',
      exists (
        select 1
        from pg_constraint
        where conrelid = 'public.pessoas'::regclass
          and contype = 'f'
          and conname = 'pessoas_cargo_id_cargos_id_fk'
      )
    union all
    select 'constraint:pessoas.funcao_id',
      exists (
        select 1
        from pg_constraint
        where conrelid = 'public.pessoas'::regclass
          and contype = 'f'
          and conname = 'pessoas_funcao_id_funcoes_id_fk'
      )
    union all
    select 'index:cargos.nome_normalizado',
      to_regclass('public.cargos_nome_normalizado_uq') is not null
    union all
    select 'index:funcoes.nome_normalizado',
      to_regclass('public.funcoes_nome_normalizado_uq') is not null;
  `);

  const checks = result.rows as unknown as CheckRow[];
  for (const check of checks) {
    console.log(`${check.present ? "OK" : "FALTA"} ${check.object_name}`);
  }

  const missing = checks.filter((check) => !check.present);
  if (missing.length) {
    console.error(`Migration R2.1 incompleta: ${missing.length} objeto(s) ausente(s).`);
    process.exitCode = 1;
    return;
  }

  const migrationPath = join(
    projectRoot,
    "drizzle",
    "migrations",
    "0056_cadastros_cargos_funcoes.sql",
  );
  const migrationHash = createHash("sha256")
    .update(await readFile(migrationPath))
    .digest("hex");
  const historyTable = await db.execute(sql`
    select to_regclass('drizzle.__drizzle_migrations') is not null as present;
  `);
  const hasHistoryTable = Boolean(
    (historyTable.rows[0] as { present?: boolean } | undefined)?.present,
  );
  let migrationRecorded = false;
  if (hasHistoryTable) {
    const history = await db.execute(sql`
      select exists (
        select 1
        from drizzle.__drizzle_migrations
        where hash = ${migrationHash}
      ) as present;
    `);
    migrationRecorded = Boolean(
      (history.rows[0] as { present?: boolean } | undefined)?.present,
    );
  }
  console.log(
    `${migrationRecorded ? "OK" : "FALTA"} historico:0056_cadastros_cargos_funcoes`,
  );
  if (!migrationRecorded) {
    console.error(
      "O esquema existe, mas o hash atual da migration 0056 nao consta no historico Drizzle.",
    );
    process.exitCode = 1;
  }

  const quality = await db.execute(sql`
    select
      count(*) filter (
        where nullif(trim(coalesce(p.cargo, '')), '') is not null
          and p.cargo_id is null
      )::int as legacy_cargo_without_catalog,
      count(*) filter (
        where p.secretaria_id is not null and p.cargo_id is null
      )::int as servers_without_cargo
    from pessoas p;
  `);
  const row = quality.rows[0] as {
    legacy_cargo_without_catalog?: number;
    servers_without_cargo?: number;
  } | undefined;

  console.log(`Cargos legados sem catalogo: ${Number(row?.legacy_cargo_without_catalog ?? 0)}`);
  console.log(`Servidores sem cargo estruturado: ${Number(row?.servers_without_cargo ?? 0)}`);
  const legacyWithoutCatalog = Number(row?.legacy_cargo_without_catalog ?? 0);
  const serversWithoutCargo = Number(row?.servers_without_cargo ?? 0);
  if (legacyWithoutCatalog > 0 || serversWithoutCargo > 0) {
    console.error(
      "A qualidade dos dados R2.1 nao atende ao gate: normalize os cargos pendentes antes da homologacao.",
    );
    process.exitCode = 1;
  }
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Falha ao verificar a migration R2.1.");
    process.exitCode = 1;
  } finally {
    try {
      await closeDb();
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Falha ao encerrar a conexao com o banco.");
      process.exitCode = 1;
    }
  }
}

void run();
