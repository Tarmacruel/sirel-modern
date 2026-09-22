ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS situacao_procedimento jsonb;
ALTER TABLE itens_processo_valores ADD COLUMN IF NOT EXISTS resultado_licitacao varchar(32);
ALTER TABLE itens_processo_valores ADD COLUMN IF NOT EXISTS resultado_decisao jsonb;
CREATE TABLE IF NOT EXISTS licitacao_decisoes (
 id serial PRIMARY KEY, processo_id integer NOT NULL REFERENCES processos(id),
 acao varchar(32) NOT NULL, item_ids jsonb NOT NULL DEFAULT '[]',
 decisao jsonb NOT NULL, anterior jsonb, usuario_id integer REFERENCES users(id),
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS licitacao_decisoes_processo_idx ON licitacao_decisoes(processo_id, id);
