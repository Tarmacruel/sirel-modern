-- R2.2: classificação institucional e linhagem lógica de versões.
-- A coluna textual `categoria` e a numeração `versao` existentes permanecem
-- preservadas para compatibilidade com integrações e acervo legado.

CREATE TABLE IF NOT EXISTS "documento_classificacoes" (
  "id" serial PRIMARY KEY,
  "codigo" varchar(120) NOT NULL,
  "nome" varchar(255) NOT NULL,
  "descricao" text,
  "ativo" boolean NOT NULL DEFAULT true,
  "criado_em" timestamp with time zone NOT NULL DEFAULT now(),
  "atualizado_em" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "documento_classificacoes_codigo_uq"
  ON "documento_classificacoes" ("codigo");

CREATE INDEX IF NOT EXISTS "documento_classificacoes_ativo_idx"
  ON "documento_classificacoes" ("ativo");

-- Catálogo inicial. Novas classificações continuam sendo administráveis sem
-- alterar enumerações ou reescrever dados já existentes.
INSERT INTO "documento_classificacoes" ("codigo", "nome", "descricao", "ativo")
VALUES
  ('DFD', 'Documento de Formalização da Demanda', 'Documento de abertura da demanda.', true),
  ('ETP', 'Estudo Técnico Preliminar', 'Estudo técnico preliminar.', true),
  ('TR', 'Termo de Referência', 'Termo de referência.', true),
  ('EDITAL', 'Edital', 'Edital e seus anexos.', true),
  ('COMUNICACAO_INTERNA', 'Comunicação interna', 'Comunicações de uso interno.', true),
  ('RESULTADO', 'Resultado', 'Resultado e atos de julgamento.', true),
  ('CONTRATO', 'Contrato', 'Contrato, instrumento equivalente ou aditivo.', true),
  ('SUPORTE_ETP', 'Documento de suporte ao ETP', 'Evidência ou anexo do estudo técnico preliminar.', true),
  ('ETP_EXTERNO', 'ETP externo', 'Estudo técnico preliminar emitido externamente.', true),
  ('SUPORTE_TR', 'Documento de suporte ao TR', 'Evidência ou anexo do termo de referência.', true),
  ('TR_EXTERNO', 'TR externo', 'Termo de referência emitido externamente.', true),
  ('LICITACAO_TERMO_AUTUACAO', 'Termo de autuação', 'Documento de autuação da licitação.', true),
  ('LICITACAO_PESQUISA_PRECOS', 'Pesquisa de preços', 'Pesquisa e memória de preços.', true),
  ('LICITACAO_RESERVA_ORCAMENTARIA', 'Reserva orçamentária', 'Reserva ou disponibilidade orçamentária.', true),
  ('LICITACAO_COMUNICACAO_RESERVA_ORCAMENTARIA', 'Comunicação de reserva orçamentária', 'Comunicação da reserva orçamentária.', true),
  ('LICITACAO_DECLARACAO_NAO_FRACIONAMENTO', 'Declaração de não fracionamento', 'Declaração de não fracionamento de despesa.', true),
  ('LICITACAO_COMPROVANTE_EXCLUSIVIDADE', 'Comprovante de exclusividade', 'Comprovante de exclusividade.', true),
  ('LICITACAO_FUNDAMENTO_INEXIGIBILIDADE', 'Fundamento de inexigibilidade', 'Fundamentação para inexigibilidade.', true),
  ('LICITACAO_JUSTIFICATIVA_DISPENSA', 'Justificativa de dispensa', 'Justificativa para contratação direta por dispensa.', true),
  ('LICITACAO_JUSTIFICATIVA_INEXIGIBILIDADE', 'Justificativa de inexigibilidade', 'Justificativa para contratação direta por inexigibilidade.', true),
  ('LICITACAO_AVISO_CONTRATACAO_DIRETA', 'Aviso de contratação direta', 'Aviso de contratação direta.', true),
  ('LICITACAO_AVISO_INEXIGIBILIDADE', 'Aviso de inexigibilidade', 'Aviso de inexigibilidade.', true),
  ('LICITACAO_MINUTA_AVISO', 'Minuta de aviso', 'Minuta do aviso de contratação.', true),
  ('LICITACAO_PARECER_JURIDICO', 'Parecer jurídico', 'Parecer jurídico da contratação.', true),
  ('LICITACAO_COMUNICACAO_PARECER_JURIDICO', 'Comunicação de parecer jurídico', 'Comunicação ou encaminhamento do parecer jurídico.', true),
  ('LICITACAO_COMUNICACAO_CONTROLADORIA', 'Comunicação à controladoria', 'Comunicação ou encaminhamento à controladoria.', true),
  ('LICITACAO_ATO_AUTORIZACAO_AUTORIDADE', 'Ato de autorização da autoridade', 'Autorização da autoridade competente.', true),
  ('LICITACAO_DECRETO_AGENTE_CONTRATACAO', 'Decreto do agente de contratação', 'Ato de designação do agente de contratação.', true),
  ('LICITACAO_DECRETO_COMISSAO', 'Decreto da comissão', 'Ato de designação da comissão de contratação.', true),
  ('LICITACAO_DECRETO_EQUIPE_APOIO', 'Decreto da equipe de apoio', 'Ato de designação da equipe de apoio.', true),
  ('LICITACAO_DECRETO_ORDENADOR_DESPESAS', 'Decreto do ordenador de despesas', 'Ato de designação do ordenador de despesas.', true),
  ('LICITACAO_EDITAL', 'Edital da licitação', 'Edital específico do certame.', true),
  ('LICITACAO_DOCUMENTOS_PLATAFORMA_DISPUTA', 'Documentos da plataforma de disputa', 'Registros e evidências da plataforma de disputa.', true),
  ('LICITACAO_PUBLICACAO_DOM', 'Publicação no Diário Oficial do Município', 'Evidência de publicação no DOM.', true),
  ('LICITACAO_PUBLICACAO_DOU', 'Publicação no Diário Oficial da União', 'Evidência de publicação no DOU.', true),
  ('LICITACAO_PUBLICACAO_JORNAL', 'Publicação em jornal', 'Evidência de publicação em jornal.', true),
  ('LICITACAO_PUBLICACAO_TRANSPARENCIA', 'Publicação no portal da transparência', 'Evidência de publicação no portal da transparência.', true),
  ('LICITACAO_PUBLIC_LINK_BLL', 'Link público BLL', 'Referência pública da plataforma BLL.', true),
  ('LICITACAO_PUBLIC_LINK_PNCP', 'Link público PNCP', 'Referência pública do PNCP.', true),
  ('LICITACAO_CONFIRMACAO_PNCP', 'Confirmação de publicação no PNCP', 'Comprovante ou confirmação do PNCP.', true),
  ('LICITACAO_JULGAMENTO_PROPOSTA_TECNICA', 'Julgamento de proposta técnica', 'Análise técnica das propostas.', true),
  ('LICITACAO_MAPA_JULGAMENTO', 'Mapa de julgamento', 'Mapa ou quadro consolidado do julgamento.', true),
  ('LICITACAO_DECISAO_JULGAMENTO', 'Decisão de julgamento', 'Decisão da etapa de julgamento.', true),
  ('LICITACAO_HABILITACAO_EMPRESAS', 'Habilitação de empresas', 'Documentos e decisão de habilitação.', true),
  ('LICITACAO_RECURSOS', 'Recursos administrativos', 'Recursos, contrarrazões e decisões.', true),
  ('LICITACAO_ATA_SESSAO_PROVISORIA', 'Ata de sessão provisória', 'Ata provisória da sessão pública.', true),
  ('LICITACAO_ATA_SESSAO_FINAL', 'Ata de sessão final', 'Ata final da sessão pública.', true),
  ('LICITACAO_ATA_RELATORIO_LANCES', 'Relatório de lances', 'Relatório de lances da sessão.', true),
  ('LICITACAO_ATA_VENCEDORES', 'Ata de vencedores', 'Registro dos vencedores.', true),
  ('LICITACAO_ATA_ADJUDICACAO', 'Ata de adjudicação', 'Registro da adjudicação.', true),
  ('LICITACAO_ATA_HOMOLOGACAO', 'Ata de homologação', 'Registro da homologação.', true),
  ('LICITACAO_TERMO_HOMOLOGACAO', 'Termo de homologação', 'Termo de homologação.', true)
ON CONFLICT ("codigo") DO NOTHING;

ALTER TABLE "documentos"
  ADD COLUMN IF NOT EXISTS "classificacao_id" integer,
  ADD COLUMN IF NOT EXISTS "documento_raiz_id" integer,
  ADD COLUMN IF NOT EXISTS "versao_anterior_id" integer;

-- O acervo com categoria textual passa a apontar para o catálogo sem apagar
-- nem reescrever o valor legado usado pelos fluxos já existentes.
WITH classificacoes_legadas AS (
  SELECT
    left(upper(regexp_replace(btrim("categoria"), '[[:space:]]+', '_', 'g')), 120) AS codigo,
    min(left(btrim("categoria"), 255)) AS nome
  FROM "documentos"
  WHERE nullif(btrim("categoria"), '') IS NOT NULL
  GROUP BY left(upper(regexp_replace(btrim("categoria"), '[[:space:]]+', '_', 'g')), 120)
)
INSERT INTO "documento_classificacoes" ("codigo", "nome", "ativo")
SELECT codigo, nome, true
FROM classificacoes_legadas
WHERE codigo <> ''
ON CONFLICT ("codigo") DO NOTHING;

UPDATE "documentos" AS documento
SET "classificacao_id" = classificacao."id"
FROM "documento_classificacoes" AS classificacao
WHERE documento."classificacao_id" IS NULL
  AND nullif(btrim(documento."categoria"), '') IS NOT NULL
  AND classificacao."codigo" = left(
    upper(regexp_replace(btrim(documento."categoria"), '[[:space:]]+', '_', 'g')),
    120
  );

-- Não há informação suficiente para inferir cadeias históricas com segurança.
-- Cada registro preexistente torna-se, portanto, a raiz da própria linhagem;
-- novas versões deverão apontar para a raiz e para sua antecessora explícita.
UPDATE "documentos"
SET "documento_raiz_id" = "id"
WHERE "documento_raiz_id" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documentos_classificacao_id_documento_classificacoes_id_fk'
      AND conrelid = 'documentos'::regclass
  ) THEN
    ALTER TABLE "documentos"
      ADD CONSTRAINT "documentos_classificacao_id_documento_classificacoes_id_fk"
      FOREIGN KEY ("classificacao_id")
      REFERENCES "documento_classificacoes"("id")
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documentos_documento_raiz_id_documentos_id_fk'
      AND conrelid = 'documentos'::regclass
  ) THEN
    ALTER TABLE "documentos"
      ADD CONSTRAINT "documentos_documento_raiz_id_documentos_id_fk"
      FOREIGN KEY ("documento_raiz_id")
      REFERENCES "documentos"("id")
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'documentos_versao_anterior_id_documentos_id_fk'
      AND conrelid = 'documentos'::regclass
  ) THEN
    ALTER TABLE "documentos"
      ADD CONSTRAINT "documentos_versao_anterior_id_documentos_id_fk"
      FOREIGN KEY ("versao_anterior_id")
      REFERENCES "documentos"("id")
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "documentos_classificacao_idx"
  ON "documentos" ("classificacao_id");

CREATE INDEX IF NOT EXISTS "documentos_raiz_idx"
  ON "documentos" ("documento_raiz_id", "versao");

CREATE INDEX IF NOT EXISTS "documentos_versao_anterior_idx"
  ON "documentos" ("versao_anterior_id");

CREATE UNIQUE INDEX IF NOT EXISTS "documentos_raiz_versao_uq"
  ON "documentos" ("documento_raiz_id", "versao")
  WHERE "documento_raiz_id" IS NOT NULL;
