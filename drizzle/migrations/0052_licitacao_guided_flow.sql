DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'licitacao_status'::regtype
      AND enumlabel = 'CONTROLE_INTERNO'
  ) THEN
    ALTER TYPE licitacao_status ADD VALUE 'CONTROLE_INTERNO' AFTER 'RECURSOS';
  END IF;
END $$;

ALTER TABLE licitacoes
  ADD COLUMN IF NOT EXISTS fundamento_legal_inciso varchar(80);
