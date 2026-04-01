CREATE TYPE "public"."processo_origem_cadastro" AS ENUM('MANUAL', 'LEGADO');
ALTER TABLE "processos" ADD COLUMN "origem_cadastro" "processo_origem_cadastro" DEFAULT 'MANUAL' NOT NULL;
