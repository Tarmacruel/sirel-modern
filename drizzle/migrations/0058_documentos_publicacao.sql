DO $$
BEGIN
  CREATE TYPE "public"."documento_publicacao_status" AS ENUM (
    'RASCUNHO',
    'EM_REVISAO',
    'APROVADO',
    'REJEITADO',
    'RETIRADO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "documentos"
  ADD COLUMN IF NOT EXISTS "status_publicacao" "documento_publicacao_status";

-- O acervo existente exige revisao humana: nao ha aprovacao retroativa.
UPDATE "documentos"
SET "status_publicacao" = 'EM_REVISAO'
WHERE "status_publicacao" IS NULL;

ALTER TABLE "documentos"
  ALTER COLUMN "status_publicacao" SET DEFAULT 'RASCUNHO',
  ALTER COLUMN "status_publicacao" SET NOT NULL;

ALTER TABLE "documentos"
  ADD COLUMN IF NOT EXISTS "aprovado_por" integer,
  ADD COLUMN IF NOT EXISTS "aprovado_em" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "justificativa" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'documentos_aprovado_por_users_id_fk'
      AND conrelid = 'documentos'::regclass
  ) THEN
    ALTER TABLE "documentos"
      ADD CONSTRAINT "documentos_aprovado_por_users_id_fk"
      FOREIGN KEY ("aprovado_por")
      REFERENCES "users"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "documentos_status_publicacao_idx"
  ON "documentos" ("status_publicacao");

CREATE INDEX IF NOT EXISTS "documentos_portal_publico_idx"
  ON "documentos" ("processo_id", "tipo", "versao")
  WHERE "publico" = true AND "status_publicacao" = 'APROVADO';
