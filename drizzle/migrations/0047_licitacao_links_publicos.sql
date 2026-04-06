ALTER TABLE "licitacoes"
  ADD COLUMN IF NOT EXISTS "link_bll_publico" varchar(500),
  ADD COLUMN IF NOT EXISTS "link_pncp_publico" varchar(500);
