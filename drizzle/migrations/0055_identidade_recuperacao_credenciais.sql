ALTER TABLE "pessoas" ADD COLUMN IF NOT EXISTS "data_nascimento" date;
ALTER TABLE "pessoas" ADD COLUMN IF NOT EXISTS "matricula" varchar(40);

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pessoa_id" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "identity_profile_completed_at" timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_pessoa_id_pessoas_id_fk'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_pessoa_id_pessoas_id_fk"
      FOREIGN KEY ("pessoa_id")
      REFERENCES "pessoas"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "users_pessoa_idx" ON "users" ("pessoa_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_pessoa_id_uq" ON "users" ("pessoa_id") WHERE "pessoa_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "pessoas_matricula_idx" ON "pessoas" ("matricula");
CREATE INDEX IF NOT EXISTS "pessoas_data_nascimento_idx" ON "pessoas" ("data_nascimento");

CREATE TABLE IF NOT EXISTS "auth_recovery_challenges" (
  "id" serial PRIMARY KEY,
  "user_id" integer REFERENCES "users"("id") ON DELETE CASCADE,
  "purpose" varchar(40) NOT NULL,
  "challenge_hash" varchar(128) NOT NULL,
  "username_fingerprint" varchar(128),
  "identity_fingerprint" varchar(128),
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "attempts" integer NOT NULL DEFAULT 0,
  "ip_fingerprint" varchar(128),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "auth_recovery_challenges_user_idx" ON "auth_recovery_challenges" ("user_id");
CREATE INDEX IF NOT EXISTS "auth_recovery_challenges_purpose_idx" ON "auth_recovery_challenges" ("purpose");
CREATE INDEX IF NOT EXISTS "auth_recovery_challenges_hash_idx" ON "auth_recovery_challenges" ("challenge_hash");
CREATE INDEX IF NOT EXISTS "auth_recovery_challenges_ip_idx" ON "auth_recovery_challenges" ("ip_fingerprint");
CREATE INDEX IF NOT EXISTS "auth_recovery_challenges_username_idx" ON "auth_recovery_challenges" ("username_fingerprint");
CREATE INDEX IF NOT EXISTS "auth_recovery_challenges_identity_idx" ON "auth_recovery_challenges" ("identity_fingerprint");
CREATE INDEX IF NOT EXISTS "auth_recovery_challenges_created_at_idx" ON "auth_recovery_challenges" ("created_at");

CREATE OR REPLACE VIEW "auth_identity_quality_report" AS
WITH pessoas_normalizadas AS (
  SELECT
    p.id,
    p.nome,
    p.ativo,
    p.secretaria_id,
    regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g') AS cpf_digits,
    lower(trim(coalesce(p.matricula, ''))) AS matricula_norm,
    p.data_nascimento
  FROM "pessoas" p
),
cpfs_duplicados AS (
  SELECT cpf_digits
  FROM pessoas_normalizadas
  WHERE cpf_digits <> ''
  GROUP BY cpf_digits
  HAVING count(*) > 1
),
matriculas_duplicadas AS (
  SELECT matricula_norm
  FROM pessoas_normalizadas
  WHERE matricula_norm <> ''
  GROUP BY matricula_norm
  HAVING count(*) > 1
)
SELECT
  'USER_WITHOUT_PERSON'::text AS issue_type,
  u.id AS reference_id,
  u.name AS label,
  'Usuario sem vinculo com pessoa/servidor.'::text AS detail,
  'ALTA'::text AS severity
FROM "users" u
WHERE u.ativo = true AND u.pessoa_id IS NULL
UNION ALL
SELECT
  'PERSON_WITHOUT_CPF'::text,
  p.id,
  p.nome,
  'Pessoa ativa sem CPF cadastrado.'::text,
  'MEDIA'::text
FROM pessoas_normalizadas p
WHERE p.ativo = true AND p.cpf_digits = ''
UNION ALL
SELECT
  'SERVER_WITHOUT_MATRICULA'::text,
  p.id,
  p.nome,
  'Servidor ativo sem matricula.'::text,
  'MEDIA'::text
FROM pessoas_normalizadas p
WHERE p.ativo = true AND p.secretaria_id IS NOT NULL AND p.matricula_norm = ''
UNION ALL
SELECT
  'PERSON_WITHOUT_BIRTH_DATE'::text,
  p.id,
  p.nome,
  'Pessoa ativa sem data de nascimento.'::text,
  'MEDIA'::text
FROM pessoas_normalizadas p
WHERE p.ativo = true AND p.data_nascimento IS NULL
UNION ALL
SELECT
  'DUPLICATED_CPF'::text,
  p.id,
  p.nome,
  concat('CPF duplicado: ***.', substr(p.cpf_digits, 4, 3), '.***-', substr(p.cpf_digits, 10, 2))::text,
  'ALTA'::text
FROM pessoas_normalizadas p
JOIN cpfs_duplicados d ON d.cpf_digits = p.cpf_digits
UNION ALL
SELECT
  'DUPLICATED_MATRICULA'::text,
  p.id,
  p.nome,
  concat('Matricula duplicada: ', left(p.matricula_norm, 2), '***')::text,
  'ALTA'::text
FROM pessoas_normalizadas p
JOIN matriculas_duplicadas d ON d.matricula_norm = p.matricula_norm;
