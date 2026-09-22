ALTER TYPE "public"."grupo_institucional_tipo" ADD VALUE IF NOT EXISTS 'AGENTE_CONTRATACAO';
--> statement-breakpoint
ALTER TABLE "licitacoes" ADD COLUMN IF NOT EXISTS "agente_contratacao_id" integer REFERENCES "public"."grupos_institucionais"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "licitacoes_agente_contratacao_idx" ON "licitacoes" ("agente_contratacao_id");
