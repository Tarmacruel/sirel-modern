DO $$
BEGIN
  CREATE TYPE "subsystem_access_level" AS ENUM (
    'VIEWER',
    'OPERATOR',
    'MANAGER',
    'ADMIN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "user_subsystem_access" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "subsystem_key" varchar(64) NOT NULL,
  "access_level" "subsystem_access_level" NOT NULL DEFAULT 'VIEWER',
  "is_default" boolean NOT NULL DEFAULT false,
  "ativo" boolean NOT NULL DEFAULT true,
  "observacao" text,
  "criado_por" integer REFERENCES "users"("id") ON DELETE set null,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_subsystem_access_user_subsystem_uq"
  ON "user_subsystem_access" ("user_id", "subsystem_key");

CREATE INDEX IF NOT EXISTS "user_subsystem_access_user_idx"
  ON "user_subsystem_access" ("user_id");

CREATE INDEX IF NOT EXISTS "user_subsystem_access_subsystem_idx"
  ON "user_subsystem_access" ("subsystem_key");

CREATE INDEX IF NOT EXISTS "user_subsystem_access_ativo_idx"
  ON "user_subsystem_access" ("ativo");

WITH defaults(role_name, subsystem_key, access_level, is_default) AS (
  VALUES
    ('admin', 'hub', 'ADMIN', true),
    ('admin', 'planejamento', 'ADMIN', false),
    ('admin', 'compras', 'ADMIN', false),
    ('admin', 'licitacao', 'ADMIN', false),
    ('admin', 'contratos', 'ADMIN', false),
    ('admin', 'documentos', 'ADMIN', false),
    ('admin', 'workflow', 'ADMIN', false),
    ('admin', 'consultas', 'ADMIN', false),
    ('admin', 'admin', 'ADMIN', false),
    ('gestor', 'hub', 'MANAGER', true),
    ('gestor', 'planejamento', 'MANAGER', false),
    ('gestor', 'compras', 'MANAGER', false),
    ('gestor', 'licitacao', 'MANAGER', false),
    ('gestor', 'contratos', 'MANAGER', false),
    ('gestor', 'documentos', 'MANAGER', false),
    ('gestor', 'workflow', 'MANAGER', false),
    ('gestor', 'consultas', 'MANAGER', false),
    ('operador', 'hub', 'OPERATOR', true),
    ('operador', 'planejamento', 'OPERATOR', false),
    ('operador', 'compras', 'OPERATOR', false),
    ('operador', 'licitacao', 'OPERATOR', false),
    ('operador', 'documentos', 'OPERATOR', false),
    ('operador', 'workflow', 'OPERATOR', false),
    ('operador', 'consultas', 'OPERATOR', false),
    ('auditor', 'hub', 'VIEWER', true),
    ('auditor', 'planejamento', 'VIEWER', false),
    ('auditor', 'compras', 'VIEWER', false),
    ('auditor', 'licitacao', 'VIEWER', false),
    ('auditor', 'contratos', 'VIEWER', false),
    ('auditor', 'documentos', 'VIEWER', false),
    ('auditor', 'workflow', 'VIEWER', false),
    ('auditor', 'consultas', 'VIEWER', false),
    ('user', 'hub', 'VIEWER', true)
)
INSERT INTO "user_subsystem_access" (
  "user_id",
  "subsystem_key",
  "access_level",
  "is_default",
  "ativo",
  "observacao"
)
SELECT
  u."id",
  d.subsystem_key,
  d.access_level::"subsystem_access_level",
  d.is_default,
  true,
  'Backfill automatico da refatoracao por subsistemas'
FROM "users" u
JOIN defaults d ON d.role_name = u."role"::text
ON CONFLICT ("user_id", "subsystem_key") DO NOTHING;
