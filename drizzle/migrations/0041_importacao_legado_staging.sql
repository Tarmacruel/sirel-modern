DO $$
BEGIN
  CREATE TYPE "importacao_legado_lote_status" AS ENUM (
    'EM_REVISAO',
    'PRONTO_PARA_IMPORTACAO',
    'ARQUIVADO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "importacao_legado_row_review_status" AS ENUM (
    'PENDENTE',
    'APROVAR_IMPORTACAO',
    'IGNORAR',
    'VINCULAR_INTERNO',
    'DUPLICADO_BASE',
    'REVISAR'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "importacao_legado_lotes" (
  "id" serial PRIMARY KEY NOT NULL,
  "filename" varchar(255) NOT NULL,
  "sheet_name" varchar(160) NOT NULL,
  "status" "importacao_legado_lote_status" DEFAULT 'EM_REVISAO' NOT NULL,
  "total_registros" integer DEFAULT 0 NOT NULL,
  "total_limpos" integer DEFAULT 0 NOT NULL,
  "total_pendencias" integer DEFAULT 0 NOT NULL,
  "total_criticos" integer DEFAULT 0 NOT NULL,
  "total_match_interno" integer DEFAULT 0 NOT NULL,
  "total_match_base" integer DEFAULT 0 NOT NULL,
  "total_pendentes_revisao" integer DEFAULT 0 NOT NULL,
  "total_aprovados_importacao" integer DEFAULT 0 NOT NULL,
  "total_ignorados" integer DEFAULT 0 NOT NULL,
  "total_vinculados_interno" integer DEFAULT 0 NOT NULL,
  "total_duplicados_base" integer DEFAULT 0 NOT NULL,
  "issue_buckets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "duplicate_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "criado_por" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "importacao_legado_lotes"
    ADD CONSTRAINT "importacao_legado_lotes_criado_por_users_id_fk"
    FOREIGN KEY ("criado_por")
    REFERENCES "public"."users"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "importacao_legado_registros" (
  "id" serial PRIMARY KEY NOT NULL,
  "lote_id" integer NOT NULL,
  "linha" integer NOT NULL,
  "legacy_id" varchar(128),
  "modalidade" varchar(160),
  "processo_administrativo" varchar(160),
  "protocolo" varchar(160),
  "numero_edital" varchar(160),
  "status_legado" varchar(160),
  "secretaria" varchar(255),
  "mapped_secretaria" varchar(255),
  "objeto_resumo" text,
  "valor_estimado" numeric(18,2),
  "valor_contratado" numeric(18,2),
  "analysis_severity" varchar(24) NOT NULL,
  "issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "duplicate_file_count" integer DEFAULT 0 NOT NULL,
  "duplicate_group_key" varchar(255),
  "internal_matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "imported_matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "review_status" "importacao_legado_row_review_status" DEFAULT 'PENDENTE' NOT NULL,
  "review_notes" text,
  "selected_internal_process_id" integer,
  "selected_imported_process_id" integer,
  "reviewed_by" integer,
  "reviewed_at" timestamp with time zone,
  "raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "importacao_legado_registros"
    ADD CONSTRAINT "importacao_legado_registros_lote_id_importacao_legado_lotes_id_fk"
    FOREIGN KEY ("lote_id")
    REFERENCES "public"."importacao_legado_lotes"("id")
    ON DELETE cascade
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "importacao_legado_registros"
    ADD CONSTRAINT "importacao_legado_registros_selected_internal_process_id_processos_id_fk"
    FOREIGN KEY ("selected_internal_process_id")
    REFERENCES "public"."processos"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "importacao_legado_registros"
    ADD CONSTRAINT "importacao_legado_registros_selected_imported_process_id_importacao_bll_processos_id_fk"
    FOREIGN KEY ("selected_imported_process_id")
    REFERENCES "public"."importacao_bll_processos"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "importacao_legado_registros"
    ADD CONSTRAINT "importacao_legado_registros_reviewed_by_users_id_fk"
    FOREIGN KEY ("reviewed_by")
    REFERENCES "public"."users"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "importacao_legado_lotes_status_idx"
  ON "importacao_legado_lotes" USING btree ("status");
CREATE INDEX IF NOT EXISTS "importacao_legado_lotes_criado_em_idx"
  ON "importacao_legado_lotes" USING btree ("criado_em");
CREATE UNIQUE INDEX IF NOT EXISTS "importacao_legado_registros_lote_linha_uq"
  ON "importacao_legado_registros" USING btree ("lote_id","linha");
CREATE INDEX IF NOT EXISTS "importacao_legado_registros_review_idx"
  ON "importacao_legado_registros" USING btree ("review_status");
CREATE INDEX IF NOT EXISTS "importacao_legado_registros_severity_idx"
  ON "importacao_legado_registros" USING btree ("analysis_severity");
CREATE INDEX IF NOT EXISTS "importacao_legado_registros_edital_idx"
  ON "importacao_legado_registros" USING btree ("numero_edital");
CREATE INDEX IF NOT EXISTS "importacao_legado_registros_adm_idx"
  ON "importacao_legado_registros" USING btree ("processo_administrativo");
