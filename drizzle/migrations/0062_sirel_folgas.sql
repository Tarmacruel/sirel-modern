CREATE TABLE IF NOT EXISTS folga_campanhas (
    id serial PRIMARY KEY,
    nome varchar(180) NOT NULL,
    ano integer NOT NULL CHECK (ano BETWEEN 2020 AND 2100),
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    selecao_inicio timestamptz,
    selecao_fim timestamptz,
    max_folgas smallint NOT NULL DEFAULT 2 CHECK (max_folgas BETWEEN 1 AND 20),
    max_dias_consecutivos smallint NOT NULL DEFAULT 3 CHECK (max_dias_consecutivos BETWEEN 1 AND 10),
    status varchar(16) NOT NULL DEFAULT 'RASCUNHO'
      CHECK (status IN ('RASCUNHO', 'ABERTA', 'FECHADA', 'ARQUIVADA')),
    criado_por integer REFERENCES users(id) ON DELETE SET NULL,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT folga_campanhas_periodo_ck CHECK (data_inicio <= data_fim),
    CONSTRAINT folga_campanhas_selecao_ck CHECK (
      selecao_inicio IS NULL OR selecao_fim IS NULL OR selecao_inicio <= selecao_fim
    )
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS folga_campanhas_status_idx ON folga_campanhas(status, ano DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS folga_participantes (
    id serial PRIMARY KEY,
    campanha_id integer NOT NULL REFERENCES folga_campanhas(id) ON DELETE CASCADE,
    user_id integer REFERENCES users(id) ON DELETE RESTRICT,
    pessoa_id integer REFERENCES pessoas(id) ON DELETE RESTRICT,
    CONSTRAINT folga_participantes_campanha_pessoa_uq UNIQUE (campanha_id,pessoa_id),
    CONSTRAINT folga_participantes_campanha_id_uq UNIQUE (campanha_id,id),
    CONSTRAINT folga_participantes_identidade_ck CHECK (user_id IS NOT NULL OR pessoa_id IS NOT NULL),
    ativo boolean NOT NULL DEFAULT true,
    limite_folgas smallint CHECK (limite_folgas IS NULL OR limite_folgas BETWEEN 1 AND 20),
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT folga_participantes_campanha_usuario_uq UNIQUE (campanha_id, user_id)
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS folga_participantes_usuario_idx ON folga_participantes(user_id, campanha_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS folga_dias_nao_uteis (
    id serial PRIMARY KEY,
    campanha_id integer NOT NULL REFERENCES folga_campanhas(id) ON DELETE CASCADE,
    data date NOT NULL,
    tipo varchar(24) NOT NULL
      CHECK (tipo IN ('FERIADO', 'PONTO_FACULTATIVO', 'BLOQUEIO_ADMIN')),
    descricao varchar(220) NOT NULL,
    bloqueia_selecao boolean NOT NULL DEFAULT true,
    conta_como_sem_expediente boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT folga_dias_nao_uteis_campanha_data_uq UNIQUE (campanha_id, data)
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS folga_dias_nao_uteis_data_idx ON folga_dias_nao_uteis(campanha_id, data);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS folga_reservas (
    id serial PRIMARY KEY,
    campanha_id integer NOT NULL REFERENCES folga_campanhas(id) ON DELETE CASCADE,
    user_id integer REFERENCES users(id) ON DELETE RESTRICT,
    participante_id integer NOT NULL,
    CONSTRAINT folga_reservas_participante_fk FOREIGN KEY(campanha_id,participante_id) REFERENCES folga_participantes(campanha_id,id) ON DELETE RESTRICT,
    data_folga date NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT folga_reservas_data_exclusiva_uq UNIQUE (campanha_id, data_folga),
    CONSTRAINT folga_reservas_usuario_data_uq UNIQUE (campanha_id, user_id, data_folga)
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS folga_reservas_usuario_idx ON folga_reservas(campanha_id, user_id, data_folga);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS folga_audit_log (
    id bigserial PRIMARY KEY,
    campanha_id integer REFERENCES folga_campanhas(id) ON DELETE SET NULL,
    usuario_ator_id integer REFERENCES users(id) ON DELETE SET NULL,
    usuario_alvo_id integer REFERENCES users(id) ON DELETE SET NULL,
    acao varchar(80) NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip_origem varchar(45),
    criado_em timestamptz NOT NULL DEFAULT now()
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS folga_audit_log_campanha_idx ON folga_audit_log(campanha_id, criado_em DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS folga_audit_log_ator_idx ON folga_audit_log(usuario_ator_id, criado_em DESC);
