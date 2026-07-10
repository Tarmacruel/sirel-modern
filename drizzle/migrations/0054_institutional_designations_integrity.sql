ALTER TABLE "ordenadores_despesa" ADD COLUMN IF NOT EXISTS "versao" integer DEFAULT 1 NOT NULL;

ALTER TABLE "licitacoes" DROP CONSTRAINT IF EXISTS "licitacoes_comissao_id_grupos_institucionais_id_fk";
ALTER TABLE "licitacoes" DROP CONSTRAINT IF EXISTS "licitacoes_equipe_apoio_id_grupos_institucionais_id_fk";
ALTER TABLE "licitacoes" DROP CONSTRAINT IF EXISTS "licitacoes_ordenador_despesa_id_ordenadores_despesa_id_fk";

ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_comissao_id_grupos_institucionais_id_fk" FOREIGN KEY ("comissao_id") REFERENCES "public"."grupos_institucionais"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_equipe_apoio_id_grupos_institucionais_id_fk" FOREIGN KEY ("equipe_apoio_id") REFERENCES "public"."grupos_institucionais"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_ordenador_despesa_id_ordenadores_despesa_id_fk" FOREIGN KEY ("ordenador_despesa_id") REFERENCES "public"."ordenadores_despesa"("id") ON DELETE restrict ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "grupos_institucionais_membros_grupo_pessoa_uq" ON "grupos_institucionais_membros" USING btree ("grupo_id","pessoa_id");
