CREATE TYPE "ato_designacao_tipo" AS ENUM ('DECRETO', 'PORTARIA', 'RESOLUCAO', 'OUTRO');
CREATE TYPE "grupo_institucional_tipo" AS ENUM ('COMISSAO_CONTRATACAO', 'EQUIPE_APOIO');
CREATE TYPE "grupo_institucional_membro_funcao" AS ENUM ('PRESIDENTE', 'AGENTE_CONTRATACAO', 'PREGOEIRO', 'MEMBRO', 'MEMBRO_SUPLENTE', 'COORDENADOR_APOIO', 'APOIO', 'OUTRO');
CREATE TYPE "ordenador_tipo_vinculo" AS ENUM ('TITULAR', 'SUBSTITUTO', 'DELEGADO');

CREATE TABLE "atos_designacao" (
  "id" serial PRIMARY KEY NOT NULL,
  "numero" varchar(80) NOT NULL,
  "ano" integer NOT NULL,
  "tipo" "ato_designacao_tipo" NOT NULL,
  "ementa" text NOT NULL,
  "data_emissao" date,
  "data_publicacao" date,
  "vigencia_inicio" date,
  "vigencia_fim" date,
  "arquivo_url" varchar(500),
  "arquivo_chave" varchar(500),
  "mime_type" varchar(120),
  "tamanho_bytes" integer,
  "hash_arquivo" varchar(128),
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_por" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "grupos_institucionais" (
  "id" serial PRIMARY KEY NOT NULL,
  "nome" varchar(255) NOT NULL,
  "tipo" "grupo_institucional_tipo" NOT NULL,
  "sigla" varchar(32),
  "secretaria_id" integer,
  "ato_designacao_id" integer NOT NULL,
  "vigencia_inicio" date,
  "vigencia_fim" date,
  "versao" integer DEFAULT 1 NOT NULL,
  "substitui_grupo_id" integer,
  "observacao" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_por" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "grupos_institucionais_membros" (
  "id" serial PRIMARY KEY NOT NULL,
  "grupo_id" integer NOT NULL,
  "pessoa_id" integer NOT NULL,
  "funcao" "grupo_institucional_membro_funcao" NOT NULL,
  "ordem" integer DEFAULT 0 NOT NULL,
  "titular" boolean DEFAULT true NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ordenadores_despesa" (
  "id" serial PRIMARY KEY NOT NULL,
  "pessoa_id" integer NOT NULL,
  "ato_designacao_id" integer NOT NULL,
  "tipo_vinculo" "ordenador_tipo_vinculo" NOT NULL,
  "vigencia_inicio" date,
  "vigencia_fim" date,
  "observacao" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_por" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ordenadores_despesa_secretarias" (
  "id" serial PRIMARY KEY NOT NULL,
  "ordenador_despesa_id" integer NOT NULL,
  "secretaria_id" integer NOT NULL
);

ALTER TABLE "atos_designacao" ADD CONSTRAINT "atos_designacao_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "grupos_institucionais" ADD CONSTRAINT "grupos_institucionais_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "grupos_institucionais" ADD CONSTRAINT "grupos_institucionais_ato_designacao_id_atos_designacao_id_fk" FOREIGN KEY ("ato_designacao_id") REFERENCES "public"."atos_designacao"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "grupos_institucionais" ADD CONSTRAINT "grupos_institucionais_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "grupos_institucionais_membros" ADD CONSTRAINT "grupos_institucionais_membros_grupo_id_grupos_institucionais_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_institucionais"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "grupos_institucionais_membros" ADD CONSTRAINT "grupos_institucionais_membros_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "ordenadores_despesa" ADD CONSTRAINT "ordenadores_despesa_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "ordenadores_despesa" ADD CONSTRAINT "ordenadores_despesa_ato_designacao_id_atos_designacao_id_fk" FOREIGN KEY ("ato_designacao_id") REFERENCES "public"."atos_designacao"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "ordenadores_despesa" ADD CONSTRAINT "ordenadores_despesa_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "ordenadores_despesa_secretarias" ADD CONSTRAINT "ordenadores_despesa_secretarias_ordenador_despesa_id_ordenadores_despesa_id_fk" FOREIGN KEY ("ordenador_despesa_id") REFERENCES "public"."ordenadores_despesa"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ordenadores_despesa_secretarias" ADD CONSTRAINT "ordenadores_despesa_secretarias_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE restrict ON UPDATE no action;

ALTER TABLE "licitacoes" ADD COLUMN "comissao_id" integer;
ALTER TABLE "licitacoes" ADD COLUMN "equipe_apoio_id" integer;
ALTER TABLE "licitacoes" ADD COLUMN "ordenador_despesa_id" integer;
ALTER TABLE "licitacoes" ADD COLUMN "designacoes_snapshot" jsonb;
ALTER TABLE "licitacoes" ADD COLUMN "designacoes_selecionadas_por" integer;
ALTER TABLE "licitacoes" ADD COLUMN "designacoes_selecionadas_em" timestamp with time zone;
ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_comissao_id_grupos_institucionais_id_fk" FOREIGN KEY ("comissao_id") REFERENCES "public"."grupos_institucionais"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_equipe_apoio_id_grupos_institucionais_id_fk" FOREIGN KEY ("equipe_apoio_id") REFERENCES "public"."grupos_institucionais"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_ordenador_despesa_id_ordenadores_despesa_id_fk" FOREIGN KEY ("ordenador_despesa_id") REFERENCES "public"."ordenadores_despesa"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_designacoes_selecionadas_por_users_id_fk" FOREIGN KEY ("designacoes_selecionadas_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

CREATE UNIQUE INDEX "atos_designacao_numero_ano_tipo_uq" ON "atos_designacao" USING btree ("numero","ano","tipo");
CREATE INDEX "atos_designacao_tipo_idx" ON "atos_designacao" USING btree ("tipo");
CREATE INDEX "atos_designacao_ativo_idx" ON "atos_designacao" USING btree ("ativo");
CREATE INDEX "atos_designacao_vigencia_idx" ON "atos_designacao" USING btree ("vigencia_inicio","vigencia_fim");
CREATE INDEX "grupos_institucionais_tipo_idx" ON "grupos_institucionais" USING btree ("tipo");
CREATE INDEX "grupos_institucionais_secretaria_idx" ON "grupos_institucionais" USING btree ("secretaria_id");
CREATE INDEX "grupos_institucionais_ato_idx" ON "grupos_institucionais" USING btree ("ato_designacao_id");
CREATE INDEX "grupos_institucionais_ativo_idx" ON "grupos_institucionais" USING btree ("ativo");
CREATE INDEX "grupos_institucionais_membros_grupo_idx" ON "grupos_institucionais_membros" USING btree ("grupo_id");
CREATE INDEX "grupos_institucionais_membros_pessoa_idx" ON "grupos_institucionais_membros" USING btree ("pessoa_id");
CREATE INDEX "ordenadores_despesa_pessoa_idx" ON "ordenadores_despesa" USING btree ("pessoa_id");
CREATE INDEX "ordenadores_despesa_ato_idx" ON "ordenadores_despesa" USING btree ("ato_designacao_id");
CREATE INDEX "ordenadores_despesa_ativo_idx" ON "ordenadores_despesa" USING btree ("ativo");
CREATE INDEX "ordenadores_despesa_secretarias_ordenador_idx" ON "ordenadores_despesa_secretarias" USING btree ("ordenador_despesa_id");
CREATE INDEX "ordenadores_despesa_secretarias_secretaria_idx" ON "ordenadores_despesa_secretarias" USING btree ("secretaria_id");
CREATE UNIQUE INDEX "ordenadores_despesa_secretaria_uq" ON "ordenadores_despesa_secretarias" USING btree ("ordenador_despesa_id","secretaria_id");
CREATE INDEX "licitacoes_comissao_idx" ON "licitacoes" USING btree ("comissao_id");
CREATE INDEX "licitacoes_equipe_apoio_idx" ON "licitacoes" USING btree ("equipe_apoio_id");
CREATE INDEX "licitacoes_ordenador_despesa_idx" ON "licitacoes" USING btree ("ordenador_despesa_id");
