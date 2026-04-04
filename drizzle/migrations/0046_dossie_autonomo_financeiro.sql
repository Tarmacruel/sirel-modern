ALTER TYPE "importacao_bll_modo" ADD VALUE IF NOT EXISTS 'PLAYWRIGHT_LOCAL';

CREATE TABLE IF NOT EXISTS "itens_processo_valores" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_processo_id" integer NOT NULL,
  "valor_estimado_unitario" numeric(14, 2),
  "valor_estimado_total" numeric(14, 2),
  "valor_lance_vencedor_unitario" numeric(14, 2),
  "valor_lance_vencedor_total" numeric(14, 2),
  "percentual_desconto" numeric(8, 4),
  "economia_obtida" numeric(14, 2),
  "fornecedor_vencedor_id" integer,
  "fornecedor_vencedor_nome" varchar(255),
  "fornecedor_vencedor_cnpj" varchar(20),
  "item_homologado" boolean DEFAULT false NOT NULL,
  "item_deserto" boolean DEFAULT false NOT NULL,
  "item_fracassado" boolean DEFAULT false NOT NULL,
  "motivo_fracasso" text,
  "data_homologacao" date,
  "numero_lote" varchar(64),
  "origem_alteracao" varchar(64),
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "itens_processo_valores_item_processo_fk"
    FOREIGN KEY ("item_processo_id")
    REFERENCES "public"."itens_processo"("id")
    ON DELETE cascade
    ON UPDATE no action,
  CONSTRAINT "itens_processo_valores_fornecedor_fk"
    FOREIGN KEY ("fornecedor_vencedor_id")
    REFERENCES "public"."fornecedores"("id")
    ON DELETE set null
    ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "itens_processo_valores_item_uq"
  ON "itens_processo_valores" USING btree ("item_processo_id");
CREATE INDEX IF NOT EXISTS "itens_processo_valores_fornecedor_idx"
  ON "itens_processo_valores" USING btree ("fornecedor_vencedor_id");
CREATE INDEX IF NOT EXISTS "itens_processo_valores_status_idx"
  ON "itens_processo_valores" USING btree ("item_homologado", "item_deserto", "item_fracassado");
CREATE INDEX IF NOT EXISTS "itens_processo_valores_lote_idx"
  ON "itens_processo_valores" USING btree ("numero_lote");

CREATE TABLE IF NOT EXISTS "auditoria_valores_licitacao" (
  "id" serial PRIMARY KEY NOT NULL,
  "item_processo_id" integer NOT NULL,
  "valor_estimado_anterior" numeric(14, 2),
  "valor_estimado_novo" numeric(14, 2),
  "valor_lance_anterior" numeric(14, 2),
  "valor_lance_novo" numeric(14, 2),
  "origem_alteracao" varchar(64) NOT NULL,
  "usuario_responsavel" integer,
  "justificativa" text,
  "data_alteracao" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "auditoria_valores_licitacao_item_fk"
    FOREIGN KEY ("item_processo_id")
    REFERENCES "public"."itens_processo"("id")
    ON DELETE cascade
    ON UPDATE no action,
  CONSTRAINT "auditoria_valores_licitacao_usuario_fk"
    FOREIGN KEY ("usuario_responsavel")
    REFERENCES "public"."users"("id")
    ON DELETE set null
    ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "auditoria_valores_licitacao_item_idx"
  ON "auditoria_valores_licitacao" USING btree ("item_processo_id");
CREATE INDEX IF NOT EXISTS "auditoria_valores_licitacao_data_idx"
  ON "auditoria_valores_licitacao" USING btree ("data_alteracao");
CREATE INDEX IF NOT EXISTS "auditoria_valores_licitacao_origem_idx"
  ON "auditoria_valores_licitacao" USING btree ("origem_alteracao");

CREATE TABLE IF NOT EXISTS "contratos_pncp" (
  "id" serial PRIMARY KEY NOT NULL,
  "processo_id" integer NOT NULL,
  "pncp_contract_id" varchar(120) NOT NULL,
  "pncp_process_id" varchar(120),
  "pncp_url" varchar(500),
  "pncp_api_url" varchar(500),
  "numero_contrato" varchar(120),
  "ano_contrato" integer,
  "objeto_contrato" text,
  "valor_total_contrato" numeric(14, 2),
  "valor_empenhado" numeric(14, 2),
  "valor_liquidado" numeric(14, 2),
  "valor_pago" numeric(14, 2),
  "data_assinatura" date,
  "data_inicio_vigencia" date,
  "data_fim_vigencia" date,
  "dias_vigencia" integer,
  "fornecedor_id" integer,
  "fornecedor_nome" varchar(255),
  "fornecedor_cnpj" varchar(20),
  "status_contrato" varchar(120),
  "itens_vinculados" jsonb,
  "url_documento_contrato" varchar(500),
  "url_documento_empenho" varchar(500),
  "ultima_sincronizacao_pncp" timestamp with time zone DEFAULT now() NOT NULL,
  "dados_completos_pncp" jsonb,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "contratos_pncp_processo_fk"
    FOREIGN KEY ("processo_id")
    REFERENCES "public"."processos"("id")
    ON DELETE cascade
    ON UPDATE no action,
  CONSTRAINT "contratos_pncp_fornecedor_fk"
    FOREIGN KEY ("fornecedor_id")
    REFERENCES "public"."fornecedores"("id")
    ON DELETE set null
    ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "contratos_pncp_contract_uq"
  ON "contratos_pncp" USING btree ("pncp_contract_id");
CREATE INDEX IF NOT EXISTS "contratos_pncp_processo_idx"
  ON "contratos_pncp" USING btree ("processo_id");
CREATE INDEX IF NOT EXISTS "contratos_pncp_fornecedor_cnpj_idx"
  ON "contratos_pncp" USING btree ("fornecedor_cnpj");
CREATE INDEX IF NOT EXISTS "contratos_pncp_status_idx"
  ON "contratos_pncp" USING btree ("status_contrato");
