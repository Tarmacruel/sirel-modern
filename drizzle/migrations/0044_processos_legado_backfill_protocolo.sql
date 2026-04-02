WITH legado_protocolo AS (
  SELECT DISTINCT ON (selected_internal_process_id)
    selected_internal_process_id AS processo_id,
    COALESCE(
      NULLIF(TRIM(protocolo), ''),
      NULLIF(TRIM(raw_payload ->> 'protocolo'), '')
    ) AS protocolo
  FROM importacao_legado_registros
  WHERE selected_internal_process_id IS NOT NULL
    AND COALESCE(
      NULLIF(TRIM(protocolo), ''),
      NULLIF(TRIM(raw_payload ->> 'protocolo'), '')
    ) IS NOT NULL
  ORDER BY selected_internal_process_id, reviewed_at DESC NULLS LAST, atualizado_em DESC, id DESC
)
UPDATE processos
SET protocolo = legado_protocolo.protocolo,
    atualizado_em = NOW()
FROM legado_protocolo
WHERE processos.id = legado_protocolo.processo_id
  AND processos.origem_cadastro = 'LEGADO'
  AND COALESCE(TRIM(processos.protocolo), '') = '';
