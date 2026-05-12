CREATE TYPE "public"."pca_plano_status" AS ENUM('RASCUNHO', 'EM_CONSOLIDACAO', 'APROVADO', 'PUBLICACAO_PREPARADA', 'PUBLICADO', 'CANCELADO');
CREATE TYPE "public"."pca_publicacao_status" AS ENUM('PREPARADA', 'ENVIADA', 'PUBLICADA', 'ERRO', 'CANCELADA');
CREATE TYPE "public"."pca_historico_acao" AS ENUM('CREATE', 'UPDATE', 'ADD_ITEM', 'REMOVE_ITEM', 'APPROVE', 'CONSOLIDATE', 'PREPARE_PUBLICATION', 'PUBLISH');

CREATE TABLE "pca_planos" (
  "id" serial PRIMARY KEY NOT NULL,
  "ano" integer NOT NULL,
  "orgao_cnpj" varchar(18) NOT NULL,
  "orgao_nome" varchar(255),
  "unidade" varchar(255) NOT NULL,
  "secretaria_id" integer,
  "status" "pca_plano_status" DEFAULT 'RASCUNHO' NOT NULL,
  "versao" integer DEFAULT 1 NOT NULL,
  "data_aprovacao" date,
  "responsavel_id" integer,
  "responsavel_nome" varchar(255),
  "justificativa" text,
  "pncp_id" varchar(120),
  "pncp_url" varchar(500),
  "pncp_payload" jsonb,
  "pncp_publicado_em" timestamp with time zone,
  "metadados" jsonb,
  "criado_por" integer,
  "aprovado_por" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "pca_itens" (
  "id" serial PRIMARY KEY NOT NULL,
  "plano_id" integer NOT NULL,
  "processo_id" integer,
  "dfd_id" integer,
  "item_processo_id" integer,
  "numero_item" integer NOT NULL,
  "descricao" text NOT NULL,
  "quantidade" numeric(14, 3) NOT NULL,
  "unidade" varchar(32) NOT NULL,
  "valor_estimado" numeric(14, 2),
  "data_desejada" date,
  "grau_prioridade" "prioridade_dfd" DEFAULT 'MEDIA' NOT NULL,
  "categoria" varchar(120) DEFAULT 'PRODUTO' NOT NULL,
  "tipo" varchar(120),
  "unidade_requisitante_id" integer,
  "unidade_requisitante" varchar(255),
  "dfd_vinculo" varchar(120),
  "pendencias" jsonb,
  "metadados" jsonb,
  "criado_por" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "pca_publicacoes" (
  "id" serial PRIMARY KEY NOT NULL,
  "plano_id" integer NOT NULL,
  "status" "pca_publicacao_status" DEFAULT 'PREPARADA' NOT NULL,
  "canal" varchar(80) DEFAULT 'PNCP' NOT NULL,
  "protocolo" varchar(120),
  "url_publicacao" varchar(500),
  "payload" jsonb,
  "retorno" jsonb,
  "erro" text,
  "preparado_por" integer,
  "publicado_por" integer,
  "preparado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "publicado_em" timestamp with time zone,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "pca_historico" (
  "id" serial PRIMARY KEY NOT NULL,
  "plano_id" integer NOT NULL,
  "item_id" integer,
  "acao" "pca_historico_acao" NOT NULL,
  "descricao" text NOT NULL,
  "dados_anteriores" jsonb,
  "dados_novos" jsonb,
  "usuario_id" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "pca_planos" ADD CONSTRAINT "pca_planos_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pca_planos" ADD CONSTRAINT "pca_planos_responsavel_id_pessoas_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pca_planos" ADD CONSTRAINT "pca_planos_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pca_planos" ADD CONSTRAINT "pca_planos_aprovado_por_users_id_fk" FOREIGN KEY ("aprovado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pca_itens" ADD CONSTRAINT "pca_itens_plano_id_pca_planos_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."pca_planos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pca_itens" ADD CONSTRAINT "pca_itens_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "pca_itens" ADD CONSTRAINT "pca_itens_dfd_id_dfd_id_fk" FOREIGN KEY ("dfd_id") REFERENCES "public"."dfd"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "pca_itens" ADD CONSTRAINT "pca_itens_item_processo_id_itens_processo_id_fk" FOREIGN KEY ("item_processo_id") REFERENCES "public"."itens_processo"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "pca_itens" ADD CONSTRAINT "pca_itens_unidade_requisitante_id_secretarias_id_fk" FOREIGN KEY ("unidade_requisitante_id") REFERENCES "public"."secretarias"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pca_itens" ADD CONSTRAINT "pca_itens_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pca_publicacoes" ADD CONSTRAINT "pca_publicacoes_plano_id_pca_planos_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."pca_planos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pca_publicacoes" ADD CONSTRAINT "pca_publicacoes_preparado_por_users_id_fk" FOREIGN KEY ("preparado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pca_publicacoes" ADD CONSTRAINT "pca_publicacoes_publicado_por_users_id_fk" FOREIGN KEY ("publicado_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pca_historico" ADD CONSTRAINT "pca_historico_plano_id_pca_planos_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."pca_planos"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pca_historico" ADD CONSTRAINT "pca_historico_item_id_pca_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pca_itens"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "pca_historico" ADD CONSTRAINT "pca_historico_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "pca_planos_ano_unidade_versao_uq" ON "pca_planos" USING btree ("ano", "unidade", "versao");
CREATE INDEX "pca_planos_ano_idx" ON "pca_planos" USING btree ("ano");
CREATE INDEX "pca_planos_secretaria_idx" ON "pca_planos" USING btree ("secretaria_id");
CREATE INDEX "pca_planos_status_idx" ON "pca_planos" USING btree ("status");
CREATE INDEX "pca_itens_plano_idx" ON "pca_itens" USING btree ("plano_id");
CREATE INDEX "pca_itens_processo_idx" ON "pca_itens" USING btree ("processo_id");
CREATE INDEX "pca_itens_dfd_idx" ON "pca_itens" USING btree ("dfd_id");
CREATE INDEX "pca_itens_unidade_req_idx" ON "pca_itens" USING btree ("unidade_requisitante_id");
CREATE INDEX "pca_publicacoes_plano_idx" ON "pca_publicacoes" USING btree ("plano_id");
CREATE INDEX "pca_publicacoes_status_idx" ON "pca_publicacoes" USING btree ("status");
CREATE INDEX "pca_historico_plano_idx" ON "pca_historico" USING btree ("plano_id");
CREATE INDEX "pca_historico_item_idx" ON "pca_historico" USING btree ("item_id");
CREATE INDEX "pca_historico_criado_em_idx" ON "pca_historico" USING btree ("criado_em");
