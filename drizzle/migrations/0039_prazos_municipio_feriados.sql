INSERT INTO "parametros_sistema" (
  "categoria",
  "chave",
  "valor",
  "valor_json",
  "tipo_dado",
  "descricao",
  "valor_padrao",
  "requer_reinicio",
  "versao",
  "ativo",
  "criado_em",
  "atualizado_em"
)
VALUES
  (
    'REGRAS',
    'PRAZOS.MUNICIPIO.ACRESCIMO_DIAS_UTEIS',
    '1',
    '1'::jsonb,
    'number',
    'Dias uteis adicionais adotados pelo municipio acima do minimo legal para publicacao e recebimento de propostas.',
    '1'::jsonb,
    false,
    1,
    true,
    now(),
    now()
  ),
  (
    'REGRAS',
    'PRAZOS.MUNICIPIO.FERIADOS_LOCAIS',
    '[]',
    '[]'::jsonb,
    'array',
    'Lista de feriados locais no formato AAAA-MM-DD considerada no calculo legal da Licitacao.',
    '[]'::jsonb,
    false,
    1,
    true,
    now(),
    now()
  )
ON CONFLICT ("chave") DO UPDATE
SET
  "categoria" = EXCLUDED."categoria",
  "tipo_dado" = EXCLUDED."tipo_dado",
  "descricao" = EXCLUDED."descricao",
  "valor_padrao" = EXCLUDED."valor_padrao",
  "ativo" = true,
  "atualizado_em" = now();
