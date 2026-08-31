CREATE TABLE IF NOT EXISTS "cargos" (
  "id" serial PRIMARY KEY,
  "codigo" varchar(40),
  "nome" varchar(255) NOT NULL,
  "nome_normalizado" varchar(255) NOT NULL,
  "categoria" varchar(120),
  "descricao" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "funcoes" (
  "id" serial PRIMARY KEY,
  "codigo" varchar(40),
  "nome" varchar(255) NOT NULL,
  "nome_normalizado" varchar(255) NOT NULL,
  "descricao" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "cargos_nome_normalizado_uq" ON "cargos" ("nome_normalizado");
CREATE UNIQUE INDEX IF NOT EXISTS "cargos_codigo_uq" ON "cargos" ("codigo") WHERE "codigo" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "cargos_ativo_idx" ON "cargos" ("ativo");
CREATE UNIQUE INDEX IF NOT EXISTS "funcoes_nome_normalizado_uq" ON "funcoes" ("nome_normalizado");
CREATE UNIQUE INDEX IF NOT EXISTS "funcoes_codigo_uq" ON "funcoes" ("codigo") WHERE "codigo" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "funcoes_ativo_idx" ON "funcoes" ("ativo");

ALTER TABLE "pessoas" ADD COLUMN IF NOT EXISTS "cargo_id" integer;
ALTER TABLE "pessoas" ADD COLUMN IF NOT EXISTS "funcao_id" integer;
ALTER TABLE "pessoas" ALTER COLUMN "cargo" TYPE varchar(255);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pessoas_cargo_id_cargos_id_fk'
  ) THEN
    ALTER TABLE "pessoas"
      ADD CONSTRAINT "pessoas_cargo_id_cargos_id_fk"
      FOREIGN KEY ("cargo_id") REFERENCES "cargos"("id") ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pessoas_funcao_id_funcoes_id_fk'
  ) THEN
    ALTER TABLE "pessoas"
      ADD CONSTRAINT "pessoas_funcao_id_funcoes_id_fk"
      FOREIGN KEY ("funcao_id") REFERENCES "funcoes"("id") ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "pessoas_cargo_idx" ON "pessoas" ("cargo_id");
CREATE INDEX IF NOT EXISTS "pessoas_funcao_idx" ON "pessoas" ("funcao_id");

WITH cargos_legados AS (
  SELECT
    min(trim("cargo")) AS nome,
    lower(
      regexp_replace(
        translate(
          trim("cargo"),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
          'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
        ),
        '\s+',
        ' ',
        'g'
      )
    ) AS nome_normalizado
  FROM "pessoas"
  WHERE nullif(trim("cargo"), '') IS NOT NULL
  GROUP BY lower(
    regexp_replace(
      translate(
        trim("cargo"),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
        'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
)
INSERT INTO "cargos" ("nome", "nome_normalizado", "ativo")
SELECT nome, nome_normalizado, true
FROM cargos_legados
ON CONFLICT ("nome_normalizado") DO NOTHING;

UPDATE "pessoas" AS p
SET "cargo_id" = c."id"
FROM "cargos" AS c
WHERE p."cargo_id" IS NULL
  AND nullif(trim(p."cargo"), '') IS NOT NULL
  AND c."nome_normalizado" = lower(
    regexp_replace(
      translate(
        trim(p."cargo"),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
        'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
