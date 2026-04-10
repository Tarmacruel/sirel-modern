CREATE INDEX IF NOT EXISTS cotacoes_processo_idx ON cotacoes (processo_id);

CREATE INDEX IF NOT EXISTS cotacoes_item_idx ON cotacoes (item_id);

CREATE INDEX IF NOT EXISTS cotacoes_fornecedor_idx ON cotacoes (fornecedor_id);

CREATE INDEX IF NOT EXISTS contratos_fornecedor_idx ON contratos (fornecedor_id);

CREATE INDEX IF NOT EXISTS contratos_pncp_fornecedor_idx ON contratos_pncp (fornecedor_id);

CREATE INDEX IF NOT EXISTS auditoria_tabela_registro_criado_idx
  ON auditoria_log (tabela, registro_id, criado_em);
