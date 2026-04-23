ALTER TABLE lotes
  ADD COLUMN IF NOT EXISTS origem_atualizacao varchar(32) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS origem_referencia varchar(64);

ALTER TABLE licitantes
  ADD COLUMN IF NOT EXISTS origem_atualizacao varchar(32) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS origem_referencia varchar(64);

ALTER TABLE propostas_licitacao
  ADD COLUMN IF NOT EXISTS origem_atualizacao varchar(32) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS origem_referencia varchar(64);

ALTER TABLE lances_licitacao
  ADD COLUMN IF NOT EXISTS origem_atualizacao varchar(32) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS origem_referencia varchar(64);

ALTER TABLE recursos_licitacao
  ADD COLUMN IF NOT EXISTS origem_atualizacao varchar(32) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS origem_referencia varchar(64);

CREATE TABLE IF NOT EXISTS licitacao_ata_sync_runs (
  id serial PRIMARY KEY,
  processo_id integer REFERENCES processos(id) ON DELETE SET NULL,
  documento_id integer REFERENCES documentos(id) ON DELETE SET NULL,
  status varchar(32) NOT NULL DEFAULT 'DISCOVERED',
  modo_descoberta varchar(64),
  arquivo_original varchar(320),
  arquivo_fonte_path varchar(500),
  parsed_json_path varchar(500),
  preview_json_path varchar(500),
  output_dir varchar(500),
  edital_extraido varchar(240),
  processo_administrativo_extraido varchar(240),
  summary jsonb,
  criado_por integer REFERENCES users(id) ON DELETE SET NULL,
  aplicado_por integer REFERENCES users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  aplicado_em timestamptz
);

CREATE INDEX IF NOT EXISTS licitacao_ata_sync_runs_processo_idx
  ON licitacao_ata_sync_runs (processo_id);

CREATE INDEX IF NOT EXISTS licitacao_ata_sync_runs_documento_idx
  ON licitacao_ata_sync_runs (documento_id);

CREATE INDEX IF NOT EXISTS licitacao_ata_sync_runs_status_idx
  ON licitacao_ata_sync_runs (status);
