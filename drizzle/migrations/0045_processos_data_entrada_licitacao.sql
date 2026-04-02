ALTER TABLE "processos"
ADD COLUMN IF NOT EXISTS "data_entrada_licitacao" date;

UPDATE "processos" AS p
SET "data_entrada_licitacao" = COALESCE(
  CASE
    WHEN trim(COALESCE(r."raw_payload"->>'dataEntrada', '')) = '' THEN NULL
    WHEN trim(r."raw_payload"->>'dataEntrada') ~ '^\d{4}-\d{2}-\d{2}' THEN left(trim(r."raw_payload"->>'dataEntrada'), 10)::date
    WHEN trim(r."raw_payload"->>'dataEntrada') ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(trim(r."raw_payload"->>'dataEntrada'), 'DD/MM/YYYY')
    WHEN trim(r."raw_payload"->>'dataEntrada') ~ '^\d{2}/\d{2}/\d{2}$' THEN to_date(trim(r."raw_payload"->>'dataEntrada'), 'DD/MM/YY')
    ELSE NULL
  END,
  CASE
    WHEN trim(COALESCE(r."raw_payload"->>'dataInicio', '')) = '' THEN NULL
    WHEN trim(r."raw_payload"->>'dataInicio') ~ '^\d{4}-\d{2}-\d{2}' THEN left(trim(r."raw_payload"->>'dataInicio'), 10)::date
    WHEN trim(r."raw_payload"->>'dataInicio') ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(trim(r."raw_payload"->>'dataInicio'), 'DD/MM/YYYY')
    WHEN trim(r."raw_payload"->>'dataInicio') ~ '^\d{2}/\d{2}/\d{2}$' THEN to_date(trim(r."raw_payload"->>'dataInicio'), 'DD/MM/YY')
    ELSE NULL
  END
)
FROM "importacao_legado_registros" AS r
WHERE p."id" = r."selected_internal_process_id"
  AND p."origem_cadastro" = 'LEGADO'
  AND p."data_entrada_licitacao" IS NULL;

UPDATE "processos"
SET "data_entrada_licitacao" = "criado_em"::date
WHERE "origem_cadastro" = 'LEGADO'
  AND "data_entrada_licitacao" IS NULL
  AND "criado_por" IS NULL;
