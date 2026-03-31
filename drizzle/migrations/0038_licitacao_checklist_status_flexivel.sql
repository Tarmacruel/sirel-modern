ALTER TABLE "licitacao_checklist_excecoes"
  ADD COLUMN "status_flexivel" varchar(40) NOT NULL DEFAULT 'PADRAO',
  ADD COLUMN "departamento_responsavel" varchar(160),
  ADD COLUMN "previsao_recebimento" date,
  ADD COLUMN "processo_fisico_numero" varchar(120),
  ADD COLUMN "local_arquivamento" varchar(255),
  ADD COLUMN "digitalizar_depois" boolean NOT NULL DEFAULT false;

UPDATE "licitacao_checklist_excecoes"
SET "status_flexivel" = CASE
  WHEN "nao_aplicavel" = true THEN 'NAO_APLICAVEL'
  ELSE 'PADRAO'
END;
