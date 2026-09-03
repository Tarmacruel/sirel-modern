import {
  bigint,
  boolean,
  bigserial,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", [
  "user",
  "admin",
  "gestor",
  "operador",
  "auditor",
]);
export const subsystemAccessLevelEnum = pgEnum("subsystem_access_level", [
  "VIEWER",
  "OPERATOR",
  "MANAGER",
  "ADMIN",
]);
export const atoDesignacaoTipoEnum = pgEnum("ato_designacao_tipo", [
  "DECRETO",
  "PORTARIA",
  "RESOLUCAO",
  "OUTRO",
]);
export const grupoInstitucionalTipoEnum = pgEnum("grupo_institucional_tipo", [
  "COMISSAO_CONTRATACAO",
  "EQUIPE_APOIO",
]);
export const grupoInstitucionalMembroFuncaoEnum = pgEnum(
  "grupo_institucional_membro_funcao",
  [
    "PRESIDENTE",
    "AGENTE_CONTRATACAO",
    "PREGOEIRO",
    "MEMBRO",
    "MEMBRO_SUPLENTE",
    "COORDENADOR_APOIO",
    "APOIO",
    "OUTRO",
  ],
);
export const ordenadorTipoVinculoEnum = pgEnum("ordenador_tipo_vinculo", [
  "TITULAR",
  "SUBSTITUTO",
  "DELEGADO",
]);
export const escopoDisputaEnum = pgEnum("escopo_disputa", [
  "ITEM",
  "LOTE",
  "GLOBAL",
]);
export const tipoObjetoEnum = pgEnum("tipo_objeto", [
  "PRODUTO",
  "SERVICO_COMUM",
  "SERVICO_ESPECIAL",
  "SERVICO",
  "OBRA",
  "SERVICO_ENG",
]);
export const tipoContratacaoEnum = pgEnum("tipo_contratacao", [
  "AQUISICAO",
  "REGISTRO_PRECO",
  "AQUISICAO_PARCELADA",
]);
export const processoOrigemCadastroEnum = pgEnum("processo_origem_cadastro", [
  "MANUAL",
  "LEGADO",
]);
export const documentoTipoEnum = pgEnum("documento_tipo", [
  "DFD",
  "ETP",
  "TR",
  "EDITAL",
  "COMUNICACAO_INTERNA",
  "RESULTADO",
  "CONTRATO",
  "OUTRO",
]);
export const documentoPublicacaoStatusEnum = pgEnum(
  "documento_publicacao_status",
  ["RASCUNHO", "EM_REVISAO", "APROVADO", "REJEITADO", "RETIRADO"],
);
export const workflowModuloEnum = pgEnum("workflow_modulo", [
  "PLANEJAMENTO",
  "COMPRAS",
  "LICITACAO",
  "PROCURADORIA",
  "CONTROLADORIA",
  "CONTRATOS",
  "DOCUMENTOS",
]);
export const workflowSituacaoEnum = pgEnum("workflow_situacao", [
  "RASCUNHO",
  "EM_ANDAMENTO",
  "AGUARDANDO",
  "CONCLUIDO",
  "SUSPENSO",
]);
export const contratoStatusEnum = pgEnum("contrato_status", [
  "ATIVO",
  "ENCERRADO",
  "SUSPENSO",
  "RESCINDIDO",
]);
export const alertaTipoEnum = pgEnum("alerta_tipo", [
  "VENCIMENTO",
  "PRAZO",
  "APROVACAO",
  "DOCUMENTACAO",
]);
export const auditoriaAcaoEnum = pgEnum("auditoria_acao", [
  "CREATE",
  "UPDATE",
  "DELETE",
]);
export const notificacaoTipoEnum = pgEnum("notificacao_tipo", [
  "PRAZO",
  "MOVIMENTACAO",
  "DOCUMENTO",
  "SISTEMA",
]);
export const notificacaoPrioridadeEnum = pgEnum("notificacao_prioridade", [
  "BAIXA",
  "MEDIA",
  "ALTA",
  "URGENTE",
]);
export const notificacaoFrequenciaEnum = pgEnum("notificacao_frequencia", [
  "IMEDIATA",
  "RESUMO_DIARIO",
  "RESUMO_SEMANAL",
]);
export const notificacaoEscopoEnum = pgEnum("notificacao_escopo", [
  "MEUS_ITENS",
  "EQUIPE",
  "CRITICOS",
]);
export const notificacaoCanalEnum = pgEnum("notificacao_canal", [
  "IN_APP",
  "EMAIL",
  "PUSH",
]);
export const notificacaoEnvioStatusEnum = pgEnum("notificacao_envio_status", [
  "ENVIADO",
  "FALHA",
  "IGNORADO",
]);
export const agendaCompartilhamentoPermissaoEnum = pgEnum(
  "agenda_compartilhamento_permissao",
  ["SOMENTE_VISUALIZACAO", "COMENTARIOS"],
);
export const authEventTypeEnum = pgEnum("auth_event_type", [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGIN_BLOCKED",
  "PASSWORD_CHANGE",
  "PASSWORD_RESET",
]);
export const parametroCategoriaEnum = pgEnum("parametro_categoria", [
  "INSTITUCIONAL",
  "REGRAS",
  "INTEGRACAO",
  "COMPORTAMENTO",
  "CATALOGOS",
]);
export const parametroTipoDadoEnum = pgEnum("parametro_tipo_dado", [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "date",
]);
export const prazoProcessualTipoEnum = pgEnum("prazo_processual_tipo", [
  "PUBLICACAO_EDITAL",
  "RECEBIMENTO_PROPOSTAS",
  "SESSAO_PUBLICA",
  "RESPOSTA_IMPUGNACAO",
  "RESPOSTA_ESCLARECIMENTO",
  "HABILITACAO",
  "ANALISE_TECNICA",
  "CORRECAO",
  "AUTORIZACAO",
  "JULGAMENTO",
  "RECURSOS",
  "HOMOLOGACAO",
  "PUBLICACAO_RESULTADO",
  "ASSINATURA_CONTRATO",
]);
export const prazoProcessualStatusEnum = pgEnum("prazo_processual_status", [
  "PENDENTE",
  "EM_ATRASO",
  "CONCLUIDO",
]);
export const tarefaEquipeStatusEnum = pgEnum("tarefa_equipe_status", [
  "PENDENTE",
  "EM_ANDAMENTO",
  "AGUARDANDO",
  "BLOQUEADO",
  "CONCLUIDO",
]);
export const tarefaEquipePrioridadeEnum = pgEnum("tarefa_equipe_prioridade", [
  "BAIXA",
  "MEDIA",
  "ALTA",
]);
export const cotacaoStatusEnum = pgEnum("cotacao_status", [
  "ATIVA",
  "VENCIDA",
  "CANCELADA",
]);
export const prioridadeDfdEnum = pgEnum("prioridade_dfd", [
  "BAIXA",
  "MEDIA",
  "ALTA",
  "URGENTE",
]);

export const pcaPlanoStatusEnum = pgEnum("pca_plano_status", [
  "RASCUNHO",
  "EM_CONSOLIDACAO",
  "APROVADO",
  "PUBLICACAO_PREPARADA",
  "PUBLICADO",
  "CANCELADO",
]);
export const pcaPublicacaoStatusEnum = pgEnum("pca_publicacao_status", [
  "PREPARADA",
  "ENVIADA",
  "PUBLICADA",
  "ERRO",
  "CANCELADA",
]);
export const pcaHistoricoAcaoEnum = pgEnum("pca_historico_acao", [
  "CREATE",
  "UPDATE",
  "ADD_ITEM",
  "REMOVE_ITEM",
  "APPROVE",
  "CONSOLIDATE",
  "PREPARE_PUBLICATION",
  "PUBLISH",
]);

export const licitacaoStatusEnum = pgEnum("licitacao_status", [
  "PREPARACAO",
  "PUBLICACAO",
  "RECEBIMENTO_PROPOSTAS",
  "ABERTURA_PROPOSTAS",
  "LANCES",
  "JULGAMENTO",
  "HABILITACAO",
  "RECURSOS",
  "CONTROLE_INTERNO",
  "HOMOLOGACAO",
  "CONTRATACAO",
  "FRACASSADA",
  "CANCELADA",
]);
export const habilitacaoStatusEnum = pgEnum("habilitacao_status", [
  "PENDENTE",
  "HABILITADO",
  "INABILITADO",
]);
export const propostaSituacaoEnum = pgEnum("proposta_situacao", [
  "VALIDA",
  "DESCLASSIFICADA",
  "VENCEDORA",
]);
export const recursoResultadoEnum = pgEnum("recurso_resultado", [
  "PENDENTE",
  "PROVIDO",
  "IMPROVIDO",
  "PARCIALMENTE_PROVIDO",
]);
export const importacaoBllOrigemEnum = pgEnum("importacao_bll_origem", [
  "LICITACAO",
  "COMPRA_DIRETA",
]);
export const importacaoBllModoEnum = pgEnum("importacao_bll_modo", [
  "REMOTA_JSON",
  "CSV_MANUAL",
  "PLAYWRIGHT_LOCAL",
]);
export const importacaoBllStatusExecucaoEnum = pgEnum(
  "importacao_bll_status_execucao",
  ["PROCESSANDO", "CONCLUIDA", "ERRO"],
);
export const importacaoBllConciliacaoStatusEnum = pgEnum(
  "importacao_bll_conciliacao_status",
  ["PENDENTE", "SUGERIDO", "VINCULADO", "IGNORADO"],
);
export const importacaoBllLoteTipoEnum = pgEnum("importacao_bll_lote_tipo", [
  "GLOBAL",
  "ITEM",
  "LOTE",
]);
export const importacaoBllEdicaoOrigemEnum = pgEnum(
  "importacao_bll_edicao_origem",
  ["MANUAL", "IMPORTACAO_BLL", "PNCP_SYNC"],
);
export const importacaoLegadoLoteStatusEnum = pgEnum(
  "importacao_legado_lote_status",
  ["EM_REVISAO", "PRONTO_PARA_IMPORTACAO", "ARQUIVADO"],
);
export const importacaoLegadoRowReviewStatusEnum = pgEnum(
  "importacao_legado_row_review_status",
  [
    "PENDENTE",
    "APROVAR_IMPORTACAO",
    "IGNORAR",
    "VINCULAR_INTERNO",
    "DUPLICADO_BASE",
    "REVISAR",
  ],
);
export const importacaoPncpStatusExecucaoEnum = pgEnum(
  "importacao_pncp_status_execucao",
  ["PROCESSANDO", "CONCLUIDA", "ERRO"],
);

export const secretarias = pgTable("secretarias", {
  id: serial("id").primaryKey(),
  sigla: varchar("sigla", { length: 32 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  responsavel: varchar("responsavel", { length: 255 }),
  email: varchar("email", { length: 255 }),
  telefone: varchar("telefone", { length: 32 }),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const parametrosSistema = pgTable(
  "parametros_sistema",
  {
    id: serial("id").primaryKey(),
    categoria: parametroCategoriaEnum("categoria").notNull().default("REGRAS"),
    chave: varchar("chave", { length: 120 }).notNull(),
    valor: text("valor").notNull(),
    valorJson: jsonb("valor_json"),
    tipoDado: parametroTipoDadoEnum("tipo_dado").notNull().default("string"),
    descricao: text("descricao"),
    valorPadrao: jsonb("valor_padrao"),
    requerReinicio: boolean("requer_reinicio").notNull().default(false),
    versao: integer("versao").notNull().default(1),
    alteradoPor: integer("alterado_por"),
    justificativaAlteracao: text("justificativa_alteracao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqChave: uniqueIndex("parametros_sistema_chave_uq").on(table.chave),
    idxCategoria: index("parametros_sistema_categoria_idx").on(table.categoria),
    idxAtivo: index("parametros_sistema_ativo_idx").on(table.ativo),
  }),
);

export const parametrosHistorico = pgTable(
  "parametros_historico",
  {
    id: serial("id").primaryKey(),
    parametroId: integer("parametro_id")
      .notNull()
      .references(() => parametrosSistema.id, { onDelete: "cascade" }),
    valorAnterior: jsonb("valor_anterior"),
    valorNovo: jsonb("valor_novo").notNull(),
    alteradoPor: integer("alterado_por"),
    alteradoPorNome: varchar("alterado_por_nome", { length: 150 }).notNull(),
    dataAlteracao: timestamp("data_alteracao", { withTimezone: true })
      .notNull()
      .defaultNow(),
    justificativa: text("justificativa"),
    ipOrigem: varchar("ip_origem", { length: 45 }),
    requerAprovacao: boolean("requer_aprovacao").notNull().default(false),
    aprovadoPor: integer("aprovado_por"),
    dataAprovacao: timestamp("data_aprovacao", { withTimezone: true }),
  },
  (table) => ({
    idxParametro: index("parametros_historico_parametro_idx").on(
      table.parametroId,
    ),
    idxDataAlteracao: index("parametros_historico_data_alteracao_idx").on(
      table.dataAlteracao,
    ),
  }),
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    openId: varchar("open_id", { length: 255 }).unique(),
    username: varchar("username", { length: 80 }).unique(),
    name: text("name").notNull(),
    email: varchar("email", { length: 255 }),
    loginMethod: varchar("login_method", { length: 64 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    role: userRoleEnum("role").notNull().default("user"),
    secretariaId: integer("secretaria_id").references(() => secretarias.id),
    pessoaId: integer("pessoa_id").references(() => pessoas.id, {
      onDelete: "set null",
    }),
    sessionVersion: integer("session_version").notNull().default(1),
    identityProfileCompletedAt: timestamp("identity_profile_completed_at", {
      withTimezone: true,
    }),
    ativo: boolean("ativo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSignedIn: timestamp("last_signed_in", { withTimezone: true }),
  },
  (table) => ({
    idxSecretaria: index("users_secretaria_idx").on(table.secretariaId),
    idxPessoa: index("users_pessoa_idx").on(table.pessoaId),
    uqPessoa: uniqueIndex("users_pessoa_id_uq")
      .on(table.pessoaId)
      .where(sql`${table.pessoaId} is not null`),
  }),
);

export const userSubsystemAccess = pgTable(
  "user_subsystem_access",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subsystemKey: varchar("subsystem_key", { length: 64 }).notNull(),
    accessLevel: subsystemAccessLevelEnum("access_level")
      .notNull()
      .default("VIEWER"),
    isDefault: boolean("is_default").notNull().default(false),
    ativo: boolean("ativo").notNull().default(true),
    observacao: text("observacao"),
    criadoPor: integer("criado_por").references(() => users.id, {
      onDelete: "set null",
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqUserSubsystem: uniqueIndex("user_subsystem_access_user_subsystem_uq").on(
      table.userId,
      table.subsystemKey,
    ),
    idxUser: index("user_subsystem_access_user_idx").on(table.userId),
    idxSubsystem: index("user_subsystem_access_subsystem_idx").on(
      table.subsystemKey,
    ),
    idxAtivo: index("user_subsystem_access_ativo_idx").on(table.ativo),
  }),
);

export const cargos = pgTable(
  "cargos",
  {
    id: serial("id").primaryKey(),
    codigo: varchar("codigo", { length: 40 }),
    nome: varchar("nome", { length: 255 }).notNull(),
    nomeNormalizado: varchar("nome_normalizado", { length: 255 }).notNull(),
    categoria: varchar("categoria", { length: 120 }),
    descricao: text("descricao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqNomeNormalizado: uniqueIndex("cargos_nome_normalizado_uq").on(
      table.nomeNormalizado,
    ),
    uqCodigo: uniqueIndex("cargos_codigo_uq")
      .on(table.codigo)
      .where(sql`${table.codigo} is not null`),
    idxAtivo: index("cargos_ativo_idx").on(table.ativo),
  }),
);

export const funcoes = pgTable(
  "funcoes",
  {
    id: serial("id").primaryKey(),
    codigo: varchar("codigo", { length: 40 }),
    nome: varchar("nome", { length: 255 }).notNull(),
    nomeNormalizado: varchar("nome_normalizado", { length: 255 }).notNull(),
    descricao: text("descricao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqNomeNormalizado: uniqueIndex("funcoes_nome_normalizado_uq").on(
      table.nomeNormalizado,
    ),
    uqCodigo: uniqueIndex("funcoes_codigo_uq")
      .on(table.codigo)
      .where(sql`${table.codigo} is not null`),
    idxAtivo: index("funcoes_ativo_idx").on(table.ativo),
  }),
);

export const pessoas = pgTable(
  "pessoas",
  {
    id: serial("id").primaryKey(),
    nome: varchar("nome", { length: 200 }).notNull(),
    cpf: varchar("cpf", { length: 18 }),
    matricula: varchar("matricula", { length: 40 }),
    dataNascimento: date("data_nascimento"),
    cargo: varchar("cargo", { length: 255 }),
    cargoId: integer("cargo_id").references(() => cargos.id, {
      onDelete: "restrict",
    }),
    funcaoId: integer("funcao_id").references(() => funcoes.id, {
      onDelete: "restrict",
    }),
    secretariaId: integer("secretaria_id").references(() => secretarias.id),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxSecretaria: index("pessoas_secretaria_idx").on(table.secretariaId),
    idxMatricula: index("pessoas_matricula_idx").on(table.matricula),
    idxDataNascimento: index("pessoas_data_nascimento_idx").on(
      table.dataNascimento,
    ),
    idxCargo: index("pessoas_cargo_idx").on(table.cargoId),
    idxFuncao: index("pessoas_funcao_idx").on(table.funcaoId),
  }),
);

export const departamentos = pgTable(
  "departamentos",
  {
    id: serial("id").primaryKey(),
    nome: varchar("nome", { length: 255 }).notNull(),
    codigoCentroCusto: varchar("codigo_centro_custo", { length: 64 }),
    secretariaId: integer("secretaria_id")
      .notNull()
      .references(() => secretarias.id),
    responsavelId: integer("responsavel_id").references(() => pessoas.id),
    descricao: text("descricao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxSecretaria: index("departamentos_secretaria_idx").on(table.secretariaId),
    idxAtivo: index("departamentos_ativo_idx").on(table.ativo),
  }),
);

export const atosDesignacao = pgTable(
  "atos_designacao",
  {
    id: serial("id").primaryKey(),
    numero: varchar("numero", { length: 80 }).notNull(),
    ano: integer("ano").notNull(),
    tipo: atoDesignacaoTipoEnum("tipo").notNull(),
    ementa: text("ementa").notNull(),
    dataEmissao: date("data_emissao"),
    dataPublicacao: date("data_publicacao"),
    vigenciaInicio: date("vigencia_inicio"),
    vigenciaFim: date("vigencia_fim"),
    arquivoUrl: varchar("arquivo_url", { length: 500 }),
    arquivoChave: varchar("arquivo_chave", { length: 500 }),
    mimeType: varchar("mime_type", { length: 120 }),
    tamanhoBytes: integer("tamanho_bytes"),
    hashArquivo: varchar("hash_arquivo", { length: 128 }),
    ativo: boolean("ativo").notNull().default(true),
    criadoPor: integer("criado_por").references(() => users.id, {
      onDelete: "set null",
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxTipo: index("atos_designacao_tipo_idx").on(table.tipo),
    idxAtivo: index("atos_designacao_ativo_idx").on(table.ativo),
    idxVigencia: index("atos_designacao_vigencia_idx").on(
      table.vigenciaInicio,
      table.vigenciaFim,
    ),
    uqAto: uniqueIndex("atos_designacao_numero_ano_tipo_uq").on(
      table.numero,
      table.ano,
      table.tipo,
    ),
  }),
);

export const gruposInstitucionais = pgTable(
  "grupos_institucionais",
  {
    id: serial("id").primaryKey(),
    nome: varchar("nome", { length: 255 }).notNull(),
    tipo: grupoInstitucionalTipoEnum("tipo").notNull(),
    sigla: varchar("sigla", { length: 32 }),
    secretariaId: integer("secretaria_id").references(() => secretarias.id, {
      onDelete: "set null",
    }),
    atoDesignacaoId: integer("ato_designacao_id")
      .notNull()
      .references(() => atosDesignacao.id, { onDelete: "restrict" }),
    vigenciaInicio: date("vigencia_inicio"),
    vigenciaFim: date("vigencia_fim"),
    versao: integer("versao").notNull().default(1),
    substituiGrupoId: integer("substitui_grupo_id"),
    observacao: text("observacao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoPor: integer("criado_por").references(() => users.id, {
      onDelete: "set null",
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxTipo: index("grupos_institucionais_tipo_idx").on(table.tipo),
    idxSecretaria: index("grupos_institucionais_secretaria_idx").on(
      table.secretariaId,
    ),
    idxAto: index("grupos_institucionais_ato_idx").on(table.atoDesignacaoId),
    idxAtivo: index("grupos_institucionais_ativo_idx").on(table.ativo),
  }),
);

export const gruposInstitucionaisMembros = pgTable(
  "grupos_institucionais_membros",
  {
    id: serial("id").primaryKey(),
    grupoId: integer("grupo_id")
      .notNull()
      .references(() => gruposInstitucionais.id, { onDelete: "cascade" }),
    pessoaId: integer("pessoa_id")
      .notNull()
      .references(() => pessoas.id, { onDelete: "restrict" }),
    funcao: grupoInstitucionalMembroFuncaoEnum("funcao").notNull(),
    ordem: integer("ordem").notNull().default(0),
    titular: boolean("titular").notNull().default(true),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxGrupo: index("grupos_institucionais_membros_grupo_idx").on(
      table.grupoId,
    ),
    idxPessoa: index("grupos_institucionais_membros_pessoa_idx").on(
      table.pessoaId,
    ),
    uqGrupoPessoa: uniqueIndex(
      "grupos_institucionais_membros_grupo_pessoa_uq",
    ).on(table.grupoId, table.pessoaId),
  }),
);

export const ordenadoresDespesa = pgTable(
  "ordenadores_despesa",
  {
    id: serial("id").primaryKey(),
    pessoaId: integer("pessoa_id")
      .notNull()
      .references(() => pessoas.id, { onDelete: "restrict" }),
    atoDesignacaoId: integer("ato_designacao_id")
      .notNull()
      .references(() => atosDesignacao.id, { onDelete: "restrict" }),
    tipoVinculo: ordenadorTipoVinculoEnum("tipo_vinculo").notNull(),
    vigenciaInicio: date("vigencia_inicio"),
    vigenciaFim: date("vigencia_fim"),
    versao: integer("versao").notNull().default(1),
    observacao: text("observacao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoPor: integer("criado_por").references(() => users.id, {
      onDelete: "set null",
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxPessoa: index("ordenadores_despesa_pessoa_idx").on(table.pessoaId),
    idxAto: index("ordenadores_despesa_ato_idx").on(table.atoDesignacaoId),
    idxAtivo: index("ordenadores_despesa_ativo_idx").on(table.ativo),
  }),
);

export const ordenadoresDespesaSecretarias = pgTable(
  "ordenadores_despesa_secretarias",
  {
    id: serial("id").primaryKey(),
    ordenadorDespesaId: integer("ordenador_despesa_id")
      .notNull()
      .references(() => ordenadoresDespesa.id, { onDelete: "cascade" }),
    secretariaId: integer("secretaria_id")
      .notNull()
      .references(() => secretarias.id, { onDelete: "restrict" }),
  },
  (table) => ({
    idxOrdenador: index("ordenadores_despesa_secretarias_ordenador_idx").on(
      table.ordenadorDespesaId,
    ),
    idxSecretaria: index("ordenadores_despesa_secretarias_secretaria_idx").on(
      table.secretariaId,
    ),
    uqOrdenadorSecretaria: uniqueIndex("ordenadores_despesa_secretaria_uq").on(
      table.ordenadorDespesaId,
      table.secretariaId,
    ),
  }),
);

export const modalidades = pgTable("modalidades", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  ativo: boolean("ativo").notNull().default(true),
});

export const statusProcesso = pgTable("status_processo", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 32 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cor: varchar("cor", { length: 16 }),
  ativo: boolean("ativo").notNull().default(true),
});

export const processos = pgTable(
  "processos",
  {
    id: serial("id").primaryKey(),
    numeroSirel: varchar("numero_sirel", { length: 64 }).notNull().unique(),
    protocolo: varchar("protocolo", { length: 160 }),
    dataEntradaLicitacao: date("data_entrada_licitacao"),
    numeroAdministrativo: varchar("numero_administrativo", { length: 64 }),
    numeroEdital: varchar("numero_edital", { length: 64 }),
    anoReferencia: integer("ano_referencia").notNull(),
    foraDoFluxo: boolean("fora_do_fluxo").notNull().default(false),
    origemCadastro: processoOrigemCadastroEnum("origem_cadastro")
      .notNull()
      .default("MANUAL"),
    secretariaId: integer("secretaria_id")
      .notNull()
      .references(() => secretarias.id),
    modalidadeId: integer("modalidade_id").references(() => modalidades.id),
    statusId: integer("status_id").references(() => statusProcesso.id),
    objeto: text("objeto").notNull(),
    valorEstimado: numeric("valor_estimado", { precision: 14, scale: 2 }),
    valorHomologado: numeric("valor_homologado", { precision: 14, scale: 2 }),
    escopoDisputa: escopoDisputaEnum("escopo_disputa")
      .notNull()
      .default("GLOBAL"),
    criterioJulgamento: varchar("criterio_julgamento", { length: 120 }),
    modoDisputa: varchar("modo_disputa", { length: 120 }),
    tipoObjeto: tipoObjetoEnum("tipo_objeto").notNull().default("PRODUTO"),
    tipoContratacao: tipoContratacaoEnum("tipo_contratacao")
      .notNull()
      .default("AQUISICAO"),
    autoridadeCompetenteId: integer("autoridade_competente_id").references(
      () => pessoas.id,
    ),
    condutorProcessoId: integer("condutor_processo_id").references(
      () => pessoas.id,
    ),
    dataAbertura: date("data_abertura"),
    dataPublicacao: timestamp("data_publicacao", { withTimezone: true }),
    dataDisputaSessao: timestamp("data_disputa_sessao", { withTimezone: true }),
    dataEncerramento: date("data_encerramento"),
    ativo: boolean("ativo").notNull().default(true),
    publicado: boolean("publicado").notNull().default(false),
    homologado: boolean("homologado").notNull().default(false),
    finalizado: boolean("finalizado").notNull().default(false),
    criadoPor: integer("criado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxNumero: index("processos_numero_idx").on(table.numeroSirel),
    idxSecretaria: index("processos_secretaria_idx").on(table.secretariaId),
    idxStatus: index("processos_status_idx").on(table.statusId),
    idxAtivo: index("processos_ativo_idx").on(table.ativo),
  }),
);

export const workflowProcesso = pgTable("workflow_processo", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id")
    .notNull()
    .unique()
    .references(() => processos.id, { onDelete: "cascade" }),
  moduloAtual: workflowModuloEnum("modulo_atual")
    .notNull()
    .default("PLANEJAMENTO"),
  situacao: workflowSituacaoEnum("situacao").notNull().default("RASCUNHO"),
  etapaAtual: varchar("etapa_atual", { length: 255 })
    .notNull()
    .default("Cadastro inicial"),
  dataInicio: date("data_inicio"),
  dataConclusao: date("data_conclusao"),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dfd = pgTable("dfd", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id")
    .notNull()
    .unique()
    .references(() => processos.id, { onDelete: "cascade" }),
  setorDemandante: varchar("setor_demandante", { length: 255 }).notNull(),
  secretariaDemandanteId: integer("secretaria_demandante_id").references(
    () => secretarias.id,
  ),
  grauPrioridade: prioridadeDfdEnum("grau_prioridade")
    .notNull()
    .default("MEDIA"),
  demandaSistemica: boolean("demanda_sistemica").notNull().default(false),
  justificativa: text("justificativa").notNull(),
  dataNecessidade: date("data_necessidade"),
  dataPrevistaConclusao: date("data_prevista_conclusao"),
  observacoes: text("observacoes"),
  secretariaResponsavelId: integer("secretaria_responsavel_id").references(
    () => secretarias.id,
  ),
  solicitantePessoaId: integer("solicitante_pessoa_id").references(
    () => pessoas.id,
  ),
  solicitanteUserId: integer("solicitante_user_id").references(() => users.id),
  assinaturaResponsavelId: integer("assinatura_responsavel_id").references(
    () => pessoas.id,
  ),
  concluido: boolean("concluido").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dfdResponsaveis = pgTable(
  "dfd_responsaveis",
  {
    id: serial("id").primaryKey(),
    dfdId: integer("dfd_id")
      .notNull()
      .references(() => dfd.id, { onDelete: "cascade" }),
    pessoaId: integer("pessoa_id")
      .notNull()
      .references(() => pessoas.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqDfdPessoa: uniqueIndex("dfd_responsaveis_dfd_pessoa_uq").on(
      table.dfdId,
      table.pessoaId,
    ),
  }),
);

export const dfdSecretariasParticipantes = pgTable(
  "dfd_secretarias_participantes",
  {
    id: serial("id").primaryKey(),
    dfdId: integer("dfd_id")
      .notNull()
      .references(() => dfd.id, { onDelete: "cascade" }),
    secretariaId: integer("secretaria_id")
      .notNull()
      .references(() => secretarias.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqDfdSecretaria: uniqueIndex(
      "dfd_secretarias_participantes_dfd_secretaria_uq",
    ).on(table.dfdId, table.secretariaId),
  }),
);

export const pcaPlanos = pgTable(
  "pca_planos",
  {
    id: serial("id").primaryKey(),
    ano: integer("ano").notNull(),
    orgaoCnpj: varchar("orgao_cnpj", { length: 18 }).notNull(),
    orgaoNome: varchar("orgao_nome", { length: 255 }),
    unidade: varchar("unidade", { length: 255 }).notNull(),
    secretariaId: integer("secretaria_id").references(() => secretarias.id),
    status: pcaPlanoStatusEnum("status").notNull().default("RASCUNHO"),
    versao: integer("versao").notNull().default(1),
    dataAprovacao: date("data_aprovacao"),
    responsavelId: integer("responsavel_id").references(() => pessoas.id),
    responsavelNome: varchar("responsavel_nome", { length: 255 }),
    justificativa: text("justificativa"),
    pncpId: varchar("pncp_id", { length: 120 }),
    pncpUrl: varchar("pncp_url", { length: 500 }),
    pncpPayload: jsonb("pncp_payload"),
    pncpPublicadoEm: timestamp("pncp_publicado_em", { withTimezone: true }),
    metadados: jsonb("metadados"),
    criadoPor: integer("criado_por").references(() => users.id),
    aprovadoPor: integer("aprovado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqAnoUnidadeVersao: uniqueIndex("pca_planos_ano_unidade_versao_uq").on(
      table.ano,
      table.unidade,
      table.versao,
    ),
    idxAno: index("pca_planos_ano_idx").on(table.ano),
    idxSecretaria: index("pca_planos_secretaria_idx").on(table.secretariaId),
    idxStatus: index("pca_planos_status_idx").on(table.status),
  }),
);

export const pcaItens = pgTable(
  "pca_itens",
  {
    id: serial("id").primaryKey(),
    planoId: integer("plano_id")
      .notNull()
      .references(() => pcaPlanos.id, { onDelete: "cascade" }),
    processoId: integer("processo_id").references(() => processos.id, {
      onDelete: "set null",
    }),
    dfdId: integer("dfd_id").references(() => dfd.id, { onDelete: "set null" }),
    itemProcessoId: integer("item_processo_id").references(
      () => itensProcesso.id,
      { onDelete: "set null" },
    ),
    numeroItem: integer("numero_item").notNull(),
    descricao: text("descricao").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    unidade: varchar("unidade", { length: 32 }).notNull(),
    valorEstimado: numeric("valor_estimado", { precision: 14, scale: 2 }),
    dataDesejada: date("data_desejada"),
    grauPrioridade: prioridadeDfdEnum("grau_prioridade")
      .notNull()
      .default("MEDIA"),
    categoria: varchar("categoria", { length: 120 })
      .notNull()
      .default("PRODUTO"),
    tipo: varchar("tipo", { length: 120 }),
    unidadeRequisitanteId: integer("unidade_requisitante_id").references(
      () => secretarias.id,
    ),
    unidadeRequisitante: varchar("unidade_requisitante", { length: 255 }),
    dfdVinculo: varchar("dfd_vinculo", { length: 120 }),
    pendencias: jsonb("pendencias").$type<string[]>(),
    metadados: jsonb("metadados"),
    criadoPor: integer("criado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxPlano: index("pca_itens_plano_idx").on(table.planoId),
    idxProcesso: index("pca_itens_processo_idx").on(table.processoId),
    idxDfd: index("pca_itens_dfd_idx").on(table.dfdId),
    idxUnidadeRequisitante: index("pca_itens_unidade_req_idx").on(
      table.unidadeRequisitanteId,
    ),
  }),
);

export const pcaPublicacoes = pgTable(
  "pca_publicacoes",
  {
    id: serial("id").primaryKey(),
    planoId: integer("plano_id")
      .notNull()
      .references(() => pcaPlanos.id, { onDelete: "cascade" }),
    status: pcaPublicacaoStatusEnum("status").notNull().default("PREPARADA"),
    canal: varchar("canal", { length: 80 }).notNull().default("PNCP"),
    protocolo: varchar("protocolo", { length: 120 }),
    urlPublicacao: varchar("url_publicacao", { length: 500 }),
    payload: jsonb("payload"),
    retorno: jsonb("retorno"),
    erro: text("erro"),
    preparadoPor: integer("preparado_por").references(() => users.id),
    publicadoPor: integer("publicado_por").references(() => users.id),
    preparadoEm: timestamp("preparado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publicadoEm: timestamp("publicado_em", { withTimezone: true }),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxPlano: index("pca_publicacoes_plano_idx").on(table.planoId),
    idxStatus: index("pca_publicacoes_status_idx").on(table.status),
  }),
);

export const pcaHistorico = pgTable(
  "pca_historico",
  {
    id: serial("id").primaryKey(),
    planoId: integer("plano_id")
      .notNull()
      .references(() => pcaPlanos.id, { onDelete: "cascade" }),
    itemId: integer("item_id").references(() => pcaItens.id, {
      onDelete: "set null",
    }),
    acao: pcaHistoricoAcaoEnum("acao").notNull(),
    descricao: text("descricao").notNull(),
    dadosAnteriores: jsonb("dados_anteriores"),
    dadosNovos: jsonb("dados_novos"),
    usuarioId: integer("usuario_id").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxPlano: index("pca_historico_plano_idx").on(table.planoId),
    idxItem: index("pca_historico_item_idx").on(table.itemId),
    idxCriadoEm: index("pca_historico_criado_em_idx").on(table.criadoEm),
  }),
);

export const etp = pgTable("etp", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id")
    .notNull()
    .unique()
    .references(() => processos.id, { onDelete: "cascade" }),
  metodologiaCotacao: varchar("metodologia_cotacao", { length: 32 })
    .notNull()
    .default("MEDIA"),
  descricaoNecessidade: text("descricao_necessidade"),
  analiseSolucoesMercado: text("analise_solucoes_mercado"),
  justificativaTecnica: text("justificativa_tecnica"),
  providenciasPrevias: text("providencias_previas"),
  conclusaoViabilidade: text("conclusao_viabilidade"),
  observacoes: text("observacoes"),
  concluido: boolean("concluido").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tr = pgTable("tr", {
  id: serial("id").primaryKey(),
  processoId: integer("processo_id")
    .notNull()
    .unique()
    .references(() => processos.id, { onDelete: "cascade" }),
  objetoTermo: text("objeto_termo").notNull(),
  fundamentacaoContratacao: text("fundamentacao_contratacao").notNull(),
  descricaoSolucao: text("descricao_solucao").notNull(),
  requisitosContratacao: text("requisitos_contratacao").notNull(),
  modeloExecucao: text("modelo_execucao"),
  criteriosMedicaoPagamento: text("criterios_medicao_pagamento"),
  adequacaoOrcamentaria: text("adequacao_orcamentaria"),
  orcamentoSigiloso: boolean("orcamento_sigiloso").notNull().default(false),
  observacoes: text("observacoes"),
  concluido: boolean("concluido").notNull().default(false),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const catalogoItens = pgTable(
  "catalogo_itens",
  {
    id: serial("id").primaryKey(),
    descricao: text("descricao").notNull(),
    unidadePadrao: varchar("unidade_padrao", { length: 32 }).notNull(),
    valorReferencia: numeric("valor_referencia", { precision: 14, scale: 2 }),
    imagemUrl: varchar("imagem_url", { length: 255 }),
    imagemChave: varchar("imagem_chave", { length: 255 }),
    ativo: boolean("ativo").notNull().default(true),
    criadoPor: integer("criado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxDescricao: index("catalogo_itens_descricao_idx").on(table.descricao),
  }),
);

export const movimentacoesWorkflow = pgTable(
  "movimentacoes_workflow",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    moduloOrigem: varchar("modulo_origem", { length: 64 }),
    moduloDestino: varchar("modulo_destino", { length: 64 }).notNull(),
    descricao: varchar("descricao", { length: 255 }).notNull(),
    observacao: text("observacao"),
    usuarioId: integer("usuario_id").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("movimentacoes_processo_idx").on(table.processoId),
  }),
);

export const lotes = pgTable(
  "lotes",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    numeroLote: integer("numero_lote").notNull(),
    descricao: text("descricao").notNull(),
    valorEstimado: numeric("valor_estimado", { precision: 14, scale: 2 }),
    valorHomologado: numeric("valor_homologado", { precision: 14, scale: 2 }),
    origemAtualizacao: varchar("origem_atualizacao", { length: 32 })
      .notNull()
      .default("MANUAL"),
    origemReferencia: varchar("origem_referencia", { length: 64 }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqProcessoLote: uniqueIndex("lotes_processo_numero_uq").on(
      table.processoId,
      table.numeroLote,
    ),
  }),
);

export const itensProcesso = pgTable(
  "itens_processo",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    loteId: integer("lote_id").references(() => lotes.id, {
      onDelete: "set null",
    }),
    catalogoItemId: integer("catalogo_item_id").references(
      () => catalogoItens.id,
      { onDelete: "set null" },
    ),
    numeroItem: integer("numero_item").notNull(),
    descricao: text("descricao").notNull(),
    quantidade: numeric("quantidade", { precision: 14, scale: 3 }).notNull(),
    unidade: varchar("unidade", { length: 32 }).notNull(),
    valorUnitarioEstimado: numeric("valor_unitario_estimado", {
      precision: 14,
      scale: 2,
    }),
    valorTotalEstimado: numeric("valor_total_estimado", {
      precision: 14,
      scale: 2,
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("itens_processo_idx").on(table.processoId),
    idxCatalogoItem: index("itens_processo_catalogo_item_idx").on(
      table.catalogoItemId,
    ),
  }),
);

export const itensProcessoValores = pgTable(
  "itens_processo_valores",
  {
    id: serial("id").primaryKey(),
    itemProcessoId: integer("item_processo_id")
      .notNull()
      .references(() => itensProcesso.id, { onDelete: "cascade" }),
    valorEstimadoUnitario: numeric("valor_estimado_unitario", {
      precision: 14,
      scale: 2,
    }),
    valorEstimadoTotal: numeric("valor_estimado_total", {
      precision: 14,
      scale: 2,
    }),
    valorLanceVencedorUnitario: numeric("valor_lance_vencedor_unitario", {
      precision: 14,
      scale: 2,
    }),
    valorLanceVencedorTotal: numeric("valor_lance_vencedor_total", {
      precision: 14,
      scale: 2,
    }),
    percentualDesconto: numeric("percentual_desconto", {
      precision: 8,
      scale: 4,
    }),
    economiaObtida: numeric("economia_obtida", { precision: 14, scale: 2 }),
    fornecedorVencedorId: integer("fornecedor_vencedor_id").references(
      () => fornecedores.id,
      { onDelete: "set null" },
    ),
    fornecedorVencedorNome: varchar("fornecedor_vencedor_nome", {
      length: 255,
    }),
    fornecedorVencedorCnpj: varchar("fornecedor_vencedor_cnpj", {
      length: 20,
    }),
    itemHomologado: boolean("item_homologado").notNull().default(false),
    itemDeserto: boolean("item_deserto").notNull().default(false),
    itemFracassado: boolean("item_fracassado").notNull().default(false),
    motivoFracasso: text("motivo_fracasso"),
    dataHomologacao: date("data_homologacao"),
    numeroLote: varchar("numero_lote", { length: 64 }),
    origemAlteracao: varchar("origem_alteracao", { length: 64 }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqItemProcesso: uniqueIndex("itens_processo_valores_item_uq").on(
      table.itemProcessoId,
    ),
    idxFornecedor: index("itens_processo_valores_fornecedor_idx").on(
      table.fornecedorVencedorId,
    ),
    idxStatus: index("itens_processo_valores_status_idx").on(
      table.itemHomologado,
      table.itemDeserto,
      table.itemFracassado,
    ),
    idxLote: index("itens_processo_valores_lote_idx").on(table.numeroLote),
  }),
);

export const auditoriaValoresLicitacao = pgTable(
  "auditoria_valores_licitacao",
  {
    id: serial("id").primaryKey(),
    itemProcessoId: integer("item_processo_id")
      .notNull()
      .references(() => itensProcesso.id, { onDelete: "cascade" }),
    valorEstimadoAnterior: numeric("valor_estimado_anterior", {
      precision: 14,
      scale: 2,
    }),
    valorEstimadoNovo: numeric("valor_estimado_novo", {
      precision: 14,
      scale: 2,
    }),
    valorLanceAnterior: numeric("valor_lance_anterior", {
      precision: 14,
      scale: 2,
    }),
    valorLanceNovo: numeric("valor_lance_novo", {
      precision: 14,
      scale: 2,
    }),
    origemAlteracao: varchar("origem_alteracao", { length: 64 }).notNull(),
    usuarioResponsavel: integer("usuario_responsavel").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    justificativa: text("justificativa"),
    dataAlteracao: timestamp("data_alteracao", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxItem: index("auditoria_valores_licitacao_item_idx").on(
      table.itemProcessoId,
    ),
    idxData: index("auditoria_valores_licitacao_data_idx").on(
      table.dataAlteracao,
    ),
    idxOrigem: index("auditoria_valores_licitacao_origem_idx").on(
      table.origemAlteracao,
    ),
  }),
);

export const etpCotacoesPreliminares = pgTable(
  "etp_cotacoes_preliminares",
  {
    id: serial("id").primaryKey(),
    etpId: integer("etp_id")
      .notNull()
      .references(() => etp.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => itensProcesso.id, { onDelete: "cascade" }),
    fonte: varchar("fonte", { length: 255 }).notNull(),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }).notNull(),
    documento: varchar("documento", { length: 80 }),
    dataCotacao: date("data_cotacao"),
    quantidadeConsiderada: numeric("quantidade_considerada", {
      precision: 14,
      scale: 3,
    }).notNull(),
    valorUnitario: numeric("valor_unitario", {
      precision: 14,
      scale: 2,
    }).notNull(),
    valorTotal: numeric("valor_total", { precision: 14, scale: 2 }).notNull(),
    considerada: boolean("considerada").notNull().default(true),
    motivoDesconsideracao: varchar("motivo_desconsideracao", { length: 32 }),
    justificativaDesconsideracao: text("justificativa_desconsideracao"),
    observacao: text("observacao"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxEtp: index("etp_cotacoes_preliminares_etp_idx").on(table.etpId),
    idxItem: index("etp_cotacoes_preliminares_item_idx").on(table.itemId),
  }),
);

export const fornecedores = pgTable(
  "fornecedores",
  {
    id: serial("id").primaryKey(),
    razaoSocial: varchar("razao_social", { length: 255 }).notNull(),
    cnpj: varchar("cnpj", { length: 20 }).notNull().unique(),
    email: varchar("email", { length: 255 }),
    telefone: varchar("telefone", { length: 32 }),
    cidade: varchar("cidade", { length: 128 }),
    estado: varchar("estado", { length: 2 }),
    logoUrl: varchar("logo_url", { length: 255 }),
    logoChave: varchar("logo_chave", { length: 255 }),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxCnpj: index("fornecedores_cnpj_idx").on(table.cnpj),
  }),
);

export const cotacoes = pgTable(
  "cotacoes",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    itemId: integer("item_id").references(() => itensProcesso.id, {
      onDelete: "cascade",
    }),
    fornecedorId: integer("fornecedor_id")
      .notNull()
      .references(() => fornecedores.id),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
    valorTotal: numeric("valor_total", { precision: 14, scale: 2 }),
    dataCotacao: date("data_cotacao"),
    status: cotacaoStatusEnum("status").notNull().default("ATIVA"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("cotacoes_processo_idx").on(table.processoId),
    idxItem: index("cotacoes_item_idx").on(table.itemId),
    idxFornecedor: index("cotacoes_fornecedor_idx").on(table.fornecedorId),
  }),
);

export const licitacoes = pgTable(
  "licitacoes",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .unique()
      .references(() => processos.id, { onDelete: "cascade" }),
    statusLicitacao: licitacaoStatusEnum("status_licitacao")
      .notNull()
      .default("PREPARACAO"),
    exigeDeclaracaoNaoFracionamento: boolean(
      "exige_declaracao_nao_fracionamento",
    )
      .notNull()
      .default(false),
    publicarNoDou: boolean("publicar_no_dou").notNull().default(false),
    publicarEmJornal: boolean("publicar_em_jornal").notNull().default(false),
    dataPublicacaoEdital: timestamp("data_publicacao_edital", {
      withTimezone: true,
    }),
    dataRecebimentoPropostasInicio: timestamp(
      "data_recebimento_propostas_inicio",
      { withTimezone: true },
    ),
    dataRecebimentoPropostasFim: timestamp("data_recebimento_propostas_fim", {
      withTimezone: true,
    }),
    dataAberturaPropostas: timestamp("data_abertura_propostas", {
      withTimezone: true,
    }),
    dataInicioLances: timestamp("data_inicio_lances", { withTimezone: true }),
    dataFimLances: timestamp("data_fim_lances", { withTimezone: true }),
    dataJulgamento: timestamp("data_julgamento", { withTimezone: true }),
    dataHomologacao: timestamp("data_homologacao", { withTimezone: true }),
    linkBllPublico: varchar("link_bll_publico", { length: 500 }),
    linkPncpPublico: varchar("link_pncp_publico", { length: 500 }),
    fundamentoLegalInciso: varchar("fundamento_legal_inciso", { length: 80 }),
    comissaoId: integer("comissao_id").references(
      () => gruposInstitucionais.id,
      { onDelete: "restrict" },
    ),
    equipeApoioId: integer("equipe_apoio_id").references(
      () => gruposInstitucionais.id,
      { onDelete: "restrict" },
    ),
    ordenadorDespesaId: integer("ordenador_despesa_id").references(
      () => ordenadoresDespesa.id,
      { onDelete: "restrict" },
    ),
    designacoesSnapshot: jsonb("designacoes_snapshot"),
    designacoesSelecionadasPor: integer(
      "designacoes_selecionadas_por",
    ).references(() => users.id, { onDelete: "set null" }),
    designacoesSelecionadasEm: timestamp("designacoes_selecionadas_em", {
      withTimezone: true,
    }),
    inversaoFasesHabilitada: boolean("inversao_fases_habilitada")
      .notNull()
      .default(false),
    inversaoFasesJustificativa: text("inversao_fases_justificativa"),
    observacoes: text("observacoes"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxStatus: index("licitacoes_status_idx").on(table.statusLicitacao),
    idxComissao: index("licitacoes_comissao_idx").on(table.comissaoId),
    idxEquipeApoio: index("licitacoes_equipe_apoio_idx").on(
      table.equipeApoioId,
    ),
    idxOrdenadorDespesa: index("licitacoes_ordenador_despesa_idx").on(
      table.ordenadorDespesaId,
    ),
  }),
);

export const licitacaoChecklistExcecoes = pgTable(
  "licitacao_checklist_excecoes",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    categoria: varchar("categoria", { length: 160 }).notNull(),
    statusFlexivel: varchar("status_flexivel", { length: 40 })
      .notNull()
      .default("PADRAO"),
    naoAplicavel: boolean("nao_aplicavel").notNull().default(false),
    justificativa: text("justificativa"),
    departamentoResponsavel: varchar("departamento_responsavel", {
      length: 160,
    }),
    previsaoRecebimento: date("previsao_recebimento"),
    processoFisicoNumero: varchar("processo_fisico_numero", { length: 120 }),
    localArquivamento: varchar("local_arquivamento", { length: 255 }),
    digitalizarDepois: boolean("digitalizar_depois").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("licitacao_checklist_excecoes_processo_idx").on(
      table.processoId,
    ),
    uqProcessoCategoria: uniqueIndex(
      "licitacao_checklist_excecoes_processo_categoria_uq",
    ).on(table.processoId, table.categoria),
  }),
);

export const licitantes = pgTable(
  "licitantes",
  {
    id: serial("id").primaryKey(),
    licitacaoId: integer("licitacao_id")
      .notNull()
      .references(() => licitacoes.id, { onDelete: "cascade" }),
    fornecedorId: integer("fornecedor_id")
      .notNull()
      .references(() => fornecedores.id, { onDelete: "cascade" }),
    dataCadastro: timestamp("data_cadastro", { withTimezone: true })
      .notNull()
      .defaultNow(),
    statusHabilitacao: habilitacaoStatusEnum("status_habilitacao")
      .notNull()
      .default("PENDENTE"),
    observacaoHabilitacao: text("observacao_habilitacao"),
    ativo: boolean("ativo").notNull().default(true),
    origemAtualizacao: varchar("origem_atualizacao", { length: 32 })
      .notNull()
      .default("MANUAL"),
    origemReferencia: varchar("origem_referencia", { length: 64 }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxLicitacao: index("licitantes_licitacao_idx").on(table.licitacaoId),
    idxFornecedor: index("licitantes_fornecedor_idx").on(table.fornecedorId),
    uqLicitante: uniqueIndex("licitantes_licitacao_fornecedor_uq").on(
      table.licitacaoId,
      table.fornecedorId,
    ),
  }),
);

export const propostasLicitacao = pgTable(
  "propostas_licitacao",
  {
    id: serial("id").primaryKey(),
    licitanteId: integer("licitante_id")
      .notNull()
      .references(() => licitantes.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => itensProcesso.id, { onDelete: "cascade" }),
    valorUnitarioProposto: numeric("valor_unitario_proposto", {
      precision: 14,
      scale: 2,
    }).notNull(),
    valorTotalProposto: numeric("valor_total_proposto", {
      precision: 14,
      scale: 2,
    }).notNull(),
    dataProposta: timestamp("data_proposta", { withTimezone: true })
      .notNull()
      .defaultNow(),
    classificacao: integer("classificacao"),
    situacao: propostaSituacaoEnum("situacao").notNull().default("VALIDA"),
    justificativa: text("justificativa"),
    origemAtualizacao: varchar("origem_atualizacao", { length: 32 })
      .notNull()
      .default("MANUAL"),
    origemReferencia: varchar("origem_referencia", { length: 64 }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxLicitante: index("propostas_licitacao_licitante_idx").on(
      table.licitanteId,
    ),
    idxItem: index("propostas_licitacao_item_idx").on(table.itemId),
    uqPropostaPorItem: uniqueIndex("propostas_licitacao_licitante_item_uq").on(
      table.licitanteId,
      table.itemId,
    ),
  }),
);

export const lancesLicitacao = pgTable(
  "lances_licitacao",
  {
    id: serial("id").primaryKey(),
    propostaId: integer("proposta_id")
      .notNull()
      .references(() => propostasLicitacao.id, { onDelete: "cascade" }),
    valorLance: numeric("valor_lance", { precision: 14, scale: 2 }).notNull(),
    dataLance: timestamp("data_lance", { withTimezone: true })
      .notNull()
      .defaultNow(),
    usuarioId: integer("usuario_id").references(() => users.id),
    observacao: text("observacao"),
    origemAtualizacao: varchar("origem_atualizacao", { length: 32 })
      .notNull()
      .default("MANUAL"),
    origemReferencia: varchar("origem_referencia", { length: 64 }),
  },
  (table) => ({
    idxProposta: index("lances_licitacao_proposta_idx").on(table.propostaId),
    idxUsuario: index("lances_licitacao_usuario_idx").on(table.usuarioId),
  }),
);

export const recursosLicitacao = pgTable(
  "recursos_licitacao",
  {
    id: serial("id").primaryKey(),
    licitacaoId: integer("licitacao_id")
      .notNull()
      .references(() => licitacoes.id, { onDelete: "cascade" }),
    licitanteId: integer("licitante_id")
      .notNull()
      .references(() => licitantes.id, { onDelete: "cascade" }),
    dataInterposicao: date("data_interposicao").notNull(),
    dataJulgamento: date("data_julgamento"),
    resultado: recursoResultadoEnum("resultado").notNull().default("PENDENTE"),
    descricao: text("descricao").notNull(),
    decisao: text("decisao"),
    criadoPor: integer("criado_por").references(() => users.id),
    origemAtualizacao: varchar("origem_atualizacao", { length: 32 })
      .notNull()
      .default("MANUAL"),
    origemReferencia: varchar("origem_referencia", { length: 64 }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxLicitacao: index("recursos_licitacao_licitacao_idx").on(
      table.licitacaoId,
    ),
    idxLicitante: index("recursos_licitacao_licitante_idx").on(
      table.licitanteId,
    ),
  }),
);

export const licitacaoAtaSyncRuns = pgTable(
  "licitacao_ata_sync_runs",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id").references(() => processos.id, {
      onDelete: "set null",
    }),
    documentoId: integer("documento_id").references(() => documentos.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 32 }).notNull().default("DISCOVERED"),
    modoDescoberta: varchar("modo_descoberta", { length: 64 }),
    arquivoOriginal: varchar("arquivo_original", { length: 320 }),
    arquivoFontePath: varchar("arquivo_fonte_path", { length: 500 }),
    parsedJsonPath: varchar("parsed_json_path", { length: 500 }),
    previewJsonPath: varchar("preview_json_path", { length: 500 }),
    outputDir: varchar("output_dir", { length: 500 }),
    editalExtraido: varchar("edital_extraido", { length: 240 }),
    processoAdministrativoExtraido: varchar(
      "processo_administrativo_extraido",
      { length: 240 },
    ),
    summary: jsonb("summary"),
    criadoPor: integer("criado_por").references(() => users.id, {
      onDelete: "set null",
    }),
    aplicadoPor: integer("aplicado_por").references(() => users.id, {
      onDelete: "set null",
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    aplicadoEm: timestamp("aplicado_em", { withTimezone: true }),
  },
  (table) => ({
    idxProcesso: index("licitacao_ata_sync_runs_processo_idx").on(
      table.processoId,
    ),
    idxDocumento: index("licitacao_ata_sync_runs_documento_idx").on(
      table.documentoId,
    ),
    idxStatus: index("licitacao_ata_sync_runs_status_idx").on(table.status),
  }),
);

export const documentoClassificacoes = pgTable(
  "documento_classificacoes",
  {
    id: serial("id").primaryKey(),
    codigo: varchar("codigo", { length: 120 }).notNull(),
    nome: varchar("nome", { length: 255 }).notNull(),
    descricao: text("descricao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqCodigo: uniqueIndex("documento_classificacoes_codigo_uq").on(
      table.codigo,
    ),
    idxAtivo: index("documento_classificacoes_ativo_idx").on(table.ativo),
  }),
);

export const documentos = pgTable(
  "documentos",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    descricao: text("descricao"),
    tipo: documentoTipoEnum("tipo").notNull().default("OUTRO"),
    categoria: varchar("categoria", { length: 120 }),
    classificacaoId: integer("classificacao_id").references(
      () => documentoClassificacoes.id,
      { onDelete: "restrict" },
    ),
    versao: integer("versao").notNull().default(1),
    documentoRaizId: integer("documento_raiz_id"),
    versaoAnteriorId: integer("versao_anterior_id"),
    arquivoUrl: varchar("arquivo_url", { length: 500 }),
    arquivoChave: varchar("arquivo_chave", { length: 255 }),
    tamanhoBytes: integer("tamanho_bytes"),
    mimeType: varchar("mime_type", { length: 120 }),
    dataReferencia: date("data_referencia"),
    palavrasChave: jsonb("palavras_chave").$type<string[]>(),
    publico: boolean("publico").notNull().default(false),
    statusPublicacao: documentoPublicacaoStatusEnum("status_publicacao")
      .notNull()
      .default("RASCUNHO"),
    aprovadoPor: integer("aprovado_por").references(() => users.id),
    aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
    justificativa: text("justificativa"),
    restritoA: jsonb("restrito_a").$type<string[]>(),
    criadoPor: integer("criado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("documentos_processo_idx").on(table.processoId),
    idxTipo: index("documentos_tipo_idx").on(table.tipo),
    idxClassificacao: index("documentos_classificacao_idx").on(
      table.classificacaoId,
    ),
    idxDocumentoRaiz: index("documentos_raiz_idx").on(
      table.documentoRaizId,
      table.versao,
    ),
    idxVersaoAnterior: index("documentos_versao_anterior_idx").on(
      table.versaoAnteriorId,
    ),
    uqDocumentoRaizVersao: uniqueIndex("documentos_raiz_versao_uq")
      .on(table.documentoRaizId, table.versao)
      .where(sql`${table.documentoRaizId} is not null`),
    fkDocumentoRaiz: foreignKey({
      name: "documentos_documento_raiz_id_documentos_id_fk",
      columns: [table.documentoRaizId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    fkVersaoAnterior: foreignKey({
      name: "documentos_versao_anterior_id_documentos_id_fk",
      columns: [table.versaoAnteriorId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    idxDataReferencia: index("documentos_data_referencia_idx").on(
      table.dataReferencia,
    ),
    idxStatusPublicacao: index("documentos_status_publicacao_idx").on(
      table.statusPublicacao,
    ),
    idxPortalPublico: index("documentos_portal_publico_idx")
      .on(table.processoId, table.tipo, table.versao)
      .where(
        sql`${table.publico} = true AND ${table.statusPublicacao} = 'APROVADO'`,
      ),
  }),
);

export const prazosProcessuais = pgTable(
  "prazos_processuais",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    tipo: prazoProcessualTipoEnum("tipo").notNull(),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    dataPrevista: date("data_prevista").notNull(),
    dataRealizada: date("data_realizada"),
    status: prazoProcessualStatusEnum("status").notNull().default("PENDENTE"),
    responsavelId: integer("responsavel_id").references(() => users.id),
    alertasConfig: jsonb("alertas_config")
      .$type<{ lembretes: number[]; canais: string[] }>()
      .notNull()
      .default({ lembretes: [7, 3, 1], canais: ["sistema"] }),
    observacao: text("observacao"),
    criadoPor: integer("criado_por").references(() => users.id),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("prazos_processuais_processo_idx").on(table.processoId),
    idxStatus: index("prazos_processuais_status_idx").on(table.status),
    idxTipo: index("prazos_processuais_tipo_idx").on(table.tipo),
    idxResponsavel: index("prazos_processuais_responsavel_idx").on(
      table.responsavelId,
    ),
    idxDataPrevista: index("prazos_processuais_data_prevista_idx").on(
      table.dataPrevista,
    ),
  }),
);

export const tarefasEquipe = pgTable(
  "tarefas_equipe",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id").references(() => processos.id, {
      onDelete: "set null",
    }),
    prazoId: integer("prazo_id").references(() => prazosProcessuais.id, {
      onDelete: "set null",
    }),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    descricao: text("descricao"),
    dataEntrega: date("data_entrega").notNull(),
    prioridade: tarefaEquipePrioridadeEnum("prioridade")
      .notNull()
      .default("MEDIA"),
    status: tarefaEquipeStatusEnum("status").notNull().default("PENDENTE"),
    delegadoPorId: integer("delegado_por_id").references(() => users.id),
    responsavelId: integer("responsavel_id")
      .notNull()
      .references(() => users.id),
    notificarResponsavel: boolean("notificar_responsavel")
      .notNull()
      .default(true),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("tarefas_equipe_processo_idx").on(table.processoId),
    idxPrazo: index("tarefas_equipe_prazo_idx").on(table.prazoId),
    idxStatus: index("tarefas_equipe_status_idx").on(table.status),
    idxPrioridade: index("tarefas_equipe_prioridade_idx").on(table.prioridade),
    idxResponsavel: index("tarefas_equipe_responsavel_idx").on(
      table.responsavelId,
    ),
    idxDataEntrega: index("tarefas_equipe_data_entrega_idx").on(
      table.dataEntrega,
    ),
  }),
);

export const contratos = pgTable(
  "contratos",
  {
    id: serial("id").primaryKey(),
    numeroContrato: varchar("numero_contrato", { length: 64 })
      .notNull()
      .unique(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id),
    fornecedorId: integer("fornecedor_id")
      .notNull()
      .references(() => fornecedores.id),
    valorContrato: numeric("valor_contrato", { precision: 14, scale: 2 }),
    dataAssinatura: date("data_assinatura"),
    dataVigenciaInicio: date("data_vigencia_inicio"),
    dataVigenciaFim: date("data_vigencia_fim"),
    objeto: text("objeto").notNull(),
    status: contratoStatusEnum("status").notNull().default("ATIVO"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("contratos_processo_idx").on(table.processoId),
    idxFornecedor: index("contratos_fornecedor_idx").on(table.fornecedorId),
    idxStatus: index("contratos_status_idx").on(table.status),
  }),
);

export const contratoItens = pgTable(
  "contrato_itens",
  {
    id: serial("id").primaryKey(),
    contratoId: integer("contrato_id")
      .notNull()
      .references(() => contratos.id, { onDelete: "cascade" }),
    catalogoItemId: integer("catalogo_item_id")
      .notNull()
      .references(() => catalogoItens.id, { onDelete: "cascade" }),
    descricao: text("descricao").notNull(),
    unidade: varchar("unidade", { length: 32 }).notNull(),
    quantidadeContratada: numeric("quantidade_contratada", {
      precision: 14,
      scale: 3,
    }).notNull(),
    quantidadeConsumida: numeric("quantidade_consumida", {
      precision: 14,
      scale: 3,
    })
      .notNull()
      .default("0"),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxContrato: index("contrato_itens_contrato_idx").on(table.contratoId),
    idxCatalogoItem: index("contrato_itens_catalogo_item_idx").on(
      table.catalogoItemId,
    ),
    uqContratoItem: uniqueIndex("contrato_itens_contrato_catalogo_uq").on(
      table.contratoId,
      table.catalogoItemId,
    ),
  }),
);

export const aditivosContratos = pgTable("aditivos_contratos", {
  id: serial("id").primaryKey(),
  contratoId: integer("contrato_id")
    .notNull()
    .references(() => contratos.id, { onDelete: "cascade" }),
  numeroAditivo: integer("numero_aditivo").notNull(),
  tipo: varchar("tipo", { length: 64 }).notNull(),
  descricao: text("descricao").notNull(),
  valorAditado: numeric("valor_aditado", { precision: 14, scale: 2 }),
  diasAdicionados: integer("dias_adicionados"),
  dataAssinatura: date("data_assinatura"),
  criadoEm: timestamp("criado_em", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const alertas = pgTable(
  "alertas",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id").references(() => processos.id, {
      onDelete: "cascade",
    }),
    contratoId: integer("contrato_id").references(() => contratos.id, {
      onDelete: "cascade",
    }),
    tipo: alertaTipoEnum("tipo").notNull(),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    descricao: text("descricao"),
    dataAlerta: date("data_alerta").notNull(),
    lido: boolean("lido").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("alertas_processo_idx").on(table.processoId),
    idxContrato: index("alertas_contrato_idx").on(table.contratoId),
  }),
);

export const notificacoesUsuario = pgTable(
  "notificacoes_usuario",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    processoId: integer("processo_id").references(() => processos.id, {
      onDelete: "cascade",
    }),
    documentoId: integer("documento_id").references(() => documentos.id, {
      onDelete: "cascade",
    }),
    prazoId: integer("prazo_id").references(() => prazosProcessuais.id, {
      onDelete: "cascade",
    }),
    tipo: notificacaoTipoEnum("tipo").notNull().default("SISTEMA"),
    prioridade: notificacaoPrioridadeEnum("prioridade")
      .notNull()
      .default("BAIXA"),
    chave: varchar("chave", { length: 255 }).notNull(),
    titulo: varchar("titulo", { length: 255 }).notNull(),
    mensagem: text("mensagem").notNull(),
    href: varchar("href", { length: 255 }),
    acaoRelacionada: jsonb("acao_relacionada"),
    origemAutomatica: boolean("origem_automatica").notNull().default(true),
    lida: boolean("lida").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dataExpiracao: timestamp("data_expiracao", { withTimezone: true }),
  },
  (table) => ({
    idxUser: index("notificacoes_usuario_user_idx").on(table.userId),
    idxLida: index("notificacoes_usuario_lida_idx").on(table.lida),
    idxExpiracao: index("notificacoes_usuario_expiracao_idx").on(
      table.dataExpiracao,
    ),
    uqChavePorUsuario: uniqueIndex("notificacoes_usuario_user_chave_uq").on(
      table.userId,
      table.chave,
    ),
  }),
);

export const notificacoesPreferencias = pgTable(
  "notificacoes_preferencias",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    frequencia: notificacaoFrequenciaEnum("frequencia")
      .notNull()
      .default("IMEDIATA"),
    escopo: notificacaoEscopoEnum("escopo").notNull().default("MEUS_ITENS"),
    canalInApp: boolean("canal_in_app").notNull().default(true),
    canalEmail: boolean("canal_email").notNull().default(false),
    canalPush: boolean("canal_push").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqUser: uniqueIndex("notificacoes_preferencias_user_uq").on(table.userId),
  }),
);

export const notificacoesPushSubscriptions = pgTable(
  "notificacoes_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: varchar("p256dh", { length: 255 }).notNull(),
    auth: varchar("auth", { length: 255 }).notNull(),
    expirationTime: timestamp("expiration_time", { withTimezone: true }),
    userAgent: varchar("user_agent", { length: 255 }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqUserEndpoint: uniqueIndex("notificacoes_push_user_endpoint_uq").on(
      table.userId,
      table.endpoint,
    ),
    idxUser: index("notificacoes_push_user_idx").on(table.userId),
  }),
);

export const notificacoesEnvios = pgTable(
  "notificacoes_envios",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chave: varchar("chave", { length: 255 }).notNull(),
    canal: notificacaoCanalEnum("canal").notNull(),
    status: notificacaoEnvioStatusEnum("status").notNull().default("ENVIADO"),
    destino: varchar("destino", { length: 255 }),
    erro: text("erro"),
    tentativas: integer("tentativas").notNull().default(0),
    ultimoEnvioEm: timestamp("ultimo_envio_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqUserChaveCanal: uniqueIndex("notificacoes_envios_user_chave_uq").on(
      table.userId,
      table.chave,
      table.canal,
    ),
    idxUser: index("notificacoes_envios_user_idx").on(table.userId),
    idxStatus: index("notificacoes_envios_status_idx").on(table.status),
  }),
);

export const prazosAgendaCompartilhamentos = pgTable(
  "prazos_agenda_compartilhamentos",
  {
    id: serial("id").primaryKey(),
    token: varchar("token", { length: 64 }).notNull(),
    compartilhadoPorId: integer("compartilhado_por_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    compartilhadoComId: integer("compartilhado_com_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    permissao: agendaCompartilhamentoPermissaoEnum("permissao")
      .notNull()
      .default("SOMENTE_VISUALIZACAO"),
    filtros: jsonb("filtros").notNull().default({}),
    ativo: boolean("ativo").notNull().default(true),
    expiraEm: timestamp("expira_em", { withTimezone: true }),
    ultimoAcessoEm: timestamp("ultimo_acesso_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqToken: uniqueIndex("prazos_agenda_compartilhamentos_token_uq").on(
      table.token,
    ),
    idxCompartilhadoPor: index(
      "prazos_agenda_compartilhamentos_compartilhado_por_idx",
    ).on(table.compartilhadoPorId),
    idxCompartilhadoCom: index(
      "prazos_agenda_compartilhamentos_compartilhado_com_idx",
    ).on(table.compartilhadoComId),
    idxAtivo: index("prazos_agenda_compartilhamentos_ativo_idx").on(
      table.ativo,
    ),
  }),
);

export const importacaoBllExecucoes = pgTable(
  "importacao_bll_execucoes",
  {
    id: serial("id").primaryKey(),
    origem: importacaoBllOrigemEnum("origem").notNull(),
    modo: importacaoBllModoEnum("modo").notNull(),
    status: importacaoBllStatusExecucaoEnum("status")
      .notNull()
      .default("PROCESSANDO"),
    agendada: boolean("agendada").notNull().default(false),
    referenciaRotina: date("referencia_rotina"),
    urlFonte: varchar("url_fonte", { length: 500 }),
    arquivoRegistrosNome: varchar("arquivo_registros_nome", { length: 255 }),
    arquivoItensNome: varchar("arquivo_itens_nome", { length: 255 }),
    atualizadoFonteEm: timestamp("atualizado_fonte_em", { withTimezone: true }),
    totalRegistros: integer("total_registros").notNull().default(0),
    totalItens: integer("total_itens").notNull().default(0),
    mensagem: text("mensagem"),
    detalhes: jsonb("detalhes"),
    criadoPor: integer("criado_por").references(() => users.id),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finalizadoEm: timestamp("finalizado_em", { withTimezone: true }),
  },
  (table) => ({
    idxOrigem: index("importacao_bll_execucoes_origem_idx").on(table.origem),
    idxStatus: index("importacao_bll_execucoes_status_idx").on(table.status),
    idxIniciadoEm: index("importacao_bll_execucoes_iniciado_em_idx").on(
      table.iniciadoEm,
    ),
    idxReferenciaRotina: index(
      "importacao_bll_execucoes_referencia_rotina_idx",
    ).on(table.referenciaRotina),
  }),
);

export const importacaoBllProcessos = pgTable(
  "importacao_bll_processos",
  {
    id: serial("id").primaryKey(),
    origem: importacaoBllOrigemEnum("origem").notNull(),
    chaveExterna: varchar("chave_externa", { length: 120 }).notNull(),
    idOrigem: varchar("id_origem", { length: 120 }),
    numeroEdital: varchar("numero_edital", { length: 120 }),
    numeroAdministrativo: varchar("numero_administrativo", { length: 120 }),
    anoReferencia: integer("ano_referencia"),
    modalidade: varchar("modalidade", { length: 160 }).notNull(),
    situacaoExterna: varchar("situacao_externa", { length: 160 }),
    tipoContrato: varchar("tipo_contrato", { length: 160 }),
    artigo: varchar("artigo", { length: 120 }),
    inciso: varchar("inciso", { length: 120 }),
    objeto: text("objeto").notNull(),
    condutorNome: varchar("condutor_nome", { length: 255 }),
    coordenadorNome: varchar("coordenador_nome", { length: 255 }),
    autoridadeNome: varchar("autoridade_nome", { length: 255 }),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
    valorReferencia: numeric("valor_referencia", { precision: 14, scale: 2 }),
    valorTotal: numeric("valor_total", { precision: 14, scale: 2 }),
    publicacaoEm: timestamp("publicacao_em", { withTimezone: true }),
    conclusaoEm: timestamp("conclusao_em", { withTimezone: true }),
    inicioRecepcaoEm: timestamp("inicio_recepcao_em", { withTimezone: true }),
    fimRecepcaoEm: timestamp("fim_recepcao_em", { withTimezone: true }),
    inicioDisputaEm: timestamp("inicio_disputa_em", { withTimezone: true }),
    linkExterno: varchar("link_externo", { length: 500 }),
    totalLotes: integer("total_lotes").notNull().default(0),
    totalItens: integer("total_itens").notNull().default(0),
    // Phase 1: Critical fields for data preservation
    justificativa: text("justificativa"),
    legislacaoAplicavel: varchar("legislacao_aplicavel", { length: 255 }),
    observacoes: text("observacoes"),
    cotaMe: boolean("cota_me").default(false),
    codigoPncp: varchar("codigo_pncp", { length: 100 }),
    urlPncp: varchar("url_pncp", { length: 500 }),
    dataSincronizacaoPncp: timestamp("data_sincronizacao_pncp", {
      withTimezone: true,
    }),
    completenessScore: integer("completeness_score").default(0),
    lastValidationAt: timestamp("last_validation_at", { withTimezone: true }),
    processoInternoId: integer("processo_interno_id").references(
      () => processos.id,
      { onDelete: "set null" },
    ),
    statusConciliacao: importacaoBllConciliacaoStatusEnum("status_conciliacao")
      .notNull()
      .default("PENDENTE"),
    scoreConciliacao: integer("score_conciliacao"),
    detalhesConciliacao: jsonb("detalhes_conciliacao"),
    conciliadoPor: integer("conciliado_por").references(() => users.id),
    conciliadoEm: timestamp("conciliado_em", { withTimezone: true }),
    ultimaExecucaoId: integer("ultima_execucao_id").references(
      () => importacaoBllExecucoes.id,
      { onDelete: "set null" },
    ),
    primeiraCapturaEm: timestamp("primeira_captura_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ultimaAtualizacaoEm: timestamp("ultima_atualizacao_em", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    dadosOriginais: jsonb("dados_originais"),
  },
  (table) => ({
    uqOrigemChave: uniqueIndex("importacao_bll_processos_origem_chave_uq").on(
      table.origem,
      table.chaveExterna,
    ),
    uqProcessoInterno: uniqueIndex(
      "importacao_bll_processos_processo_interno_uq",
    ).on(table.processoInternoId),
    idxNumeroEdital: index("importacao_bll_processos_numero_edital_idx").on(
      table.numeroEdital,
    ),
    idxNumeroAdministrativo: index(
      "importacao_bll_processos_numero_adm_idx",
    ).on(table.numeroAdministrativo),
    idxModalidade: index("importacao_bll_processos_modalidade_idx").on(
      table.modalidade,
    ),
    idxStatusConciliacao: index(
      "importacao_bll_processos_status_conciliacao_idx",
    ).on(table.statusConciliacao),
    idxProcessoInterno: index(
      "importacao_bll_processos_processo_interno_idx",
    ).on(table.processoInternoId),
    idxPublicacaoEm: index("importacao_bll_processos_publicacao_em_idx").on(
      table.publicacaoEm,
    ),
    idxUltimaExecucao: index("importacao_bll_processos_execucao_idx").on(
      table.ultimaExecucaoId,
    ),
    // Phase 1: Indexes for new fields
    idxPncp: index("importacao_bll_processos_pncp_idx").on(table.codigoPncp),
    idxCompletude: index("importacao_bll_processos_completude_idx").on(
      table.completenessScore,
    ),
    idxJustificativa: index("importacao_bll_processos_justificativa_gin").on(
      table.justificativa,
    ),
  }),
);

export const importacaoBllFornecedores = pgTable(
  "importacao_bll_fornecedores",
  {
    id: serial("id").primaryKey(),
    nome: varchar("nome", { length: 255 }).notNull(),
    nomeNormalizado: varchar("nome_normalizado", { length: 255 }).notNull(),
    documento: varchar("documento", { length: 20 }),
    dadosOriginais: jsonb("dados_originais"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxNome: index("importacao_bll_fornecedores_nome_idx").on(table.nome),
    uqNome: uniqueIndex("importacao_bll_fornecedores_nome_uq").on(
      table.nomeNormalizado,
    ),
    uqDocumento: uniqueIndex("importacao_bll_fornecedores_documento_uq").on(
      table.documento,
    ),
  }),
);

export const importacaoBllItens = pgTable(
  "importacao_bll_itens",
  {
    id: serial("id").primaryKey(),
    processoImportadoId: integer("processo_importado_id")
      .notNull()
      .references(() => importacaoBllProcessos.id, { onDelete: "cascade" }),
    fornecedorImportadoId: integer("fornecedor_importado_id").references(
      () => importacaoBllFornecedores.id,
      { onDelete: "set null" },
    ),
    loteNumero: varchar("lote_numero", { length: 32 }),
    itemNumero: varchar("item_numero", { length: 32 }),
    descricao: text("descricao").notNull(),
    unidade: varchar("unidade", { length: 64 }),
    quantidade: numeric("quantidade", { precision: 14, scale: 4 }),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
    marca: varchar("marca", { length: 120 }),
    modelo: varchar("modelo", { length: 120 }),
    valorReferencia: numeric("valor_referencia", { precision: 14, scale: 2 }),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }),
    situacaoExterna: varchar("situacao_externa", { length: 120 }),
    faseExterna: varchar("fase_externa", { length: 120 }),
    dadosOriginais: jsonb("dados_originais"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcessoImportado: index("importacao_bll_itens_processo_idx").on(
      table.processoImportadoId,
    ),
    idxFornecedorImportado: index(
      "importacao_bll_itens_espec_fornecedor_idx",
    ).on(table.fornecedorImportadoId),
    idxLoteNumero: index("importacao_bll_itens_lote_idx").on(table.loteNumero),
    idxFornecedor: index("importacao_bll_itens_fornecedor_idx").on(
      table.fornecedorNome,
    ),
  }),
);

// Phase 1: Enhanced import tables for data preservation
export const importacaoBllLotes = pgTable(
  "importacao_bll_lotes",
  {
    id: serial("id").primaryKey(),
    processoImportadoId: integer("processo_importado_id")
      .notNull()
      .references(() => importacaoBllProcessos.id, { onDelete: "cascade" }),
    vencedorFornecedorId: integer("vencedor_fornecedor_id").references(
      () => importacaoBllFornecedores.id,
      { onDelete: "set null" },
    ),
    numero: varchar("numero", { length: 32 }).notNull(),
    titulo: text("titulo").notNull(),
    tipo: importacaoBllLoteTipoEnum("tipo"),
    faseAtual: varchar("fase_atual", { length: 64 }),
    intervaloMinimoLance: numeric("intervalo_minimo_lance", {
      precision: 14,
      scale: 2,
    }),
    exclusivoMe: boolean("exclusivo_me").default(false),
    localEntrega: text("local_entrega"),
    garantiaExigida: text("garantia_exigida"),
    valorReferencia: numeric("valor_referencia", { precision: 14, scale: 2 }),
    valorHomologado: numeric("valor_homologado", { precision: 14, scale: 2 }),
    vencedor: varchar("vencedor", { length: 255 }),
    dadosOriginais: jsonb("dados_originais"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("importacao_bll_lotes_processo_idx").on(
      table.processoImportadoId,
    ),
    idxVencedorFornecedor: index(
      "importacao_bll_lotes_vencedor_fornecedor_idx",
    ).on(table.vencedorFornecedorId),
    idxVencedor: index("importacao_bll_lotes_vencedor_idx").on(table.vencedor),
    idxTipo: index("importacao_bll_lotes_tipo_idx").on(table.tipo),
    uqProcessoNumero: uniqueIndex("importacao_bll_lotes_processo_numero_uq").on(
      table.processoImportadoId,
      table.numero,
    ),
  }),
);

export const importacaoBllItensEspecificados = pgTable(
  "importacao_bll_itens_especificados",
  {
    id: serial("id").primaryKey(),
    loteImportadoId: integer("lote_importado_id").references(
      () => importacaoBllLotes.id,
      { onDelete: "cascade" },
    ),
    processoImportadoId: integer("processo_importado_id")
      .notNull()
      .references(() => importacaoBllProcessos.id, { onDelete: "cascade" }),
    fornecedorImportadoId: integer("fornecedor_importado_id").references(
      () => importacaoBllFornecedores.id,
      { onDelete: "set null" },
    ),
    numeroItem: varchar("numero_item", { length: 32 }).notNull(),
    codigoCatalogo: varchar("codigo_catalogo", { length: 64 }),
    descricaoResumida: text("descricao_resumida").notNull(),
    especificacaoTecnica: text("especificacao_tecnica"),
    unidadeMedida: varchar("unidade_medida", { length: 32 }),
    quantidade: numeric("quantidade", { precision: 14, scale: 4 }),
    valorReferenciaUnitario: numeric("valor_referencia_unitario", {
      precision: 14,
      scale: 2,
    }),
    valorHomologadoUnitario: numeric("valor_homologado_unitario", {
      precision: 14,
      scale: 2,
    }),
    subtotalReferencia: numeric("subtotal_referencia", {
      precision: 14,
      scale: 2,
    }),
    subtotalHomologado: numeric("subtotal_homologado", {
      precision: 14,
      scale: 2,
    }),
    fornecedorHomologado: varchar("fornecedor_homologado", { length: 255 }),
    marcaHomologada: varchar("marca_homologada", { length: 120 }),
    modeloHomologado: varchar("modelo_homologado", { length: 120 }),
    catalogoInternoId: integer("catalogo_interno_id").references(
      () => catalogoItens.id,
      { onDelete: "set null" },
    ),
    similaridadeCatalogo: numeric("similaridade_catalogo", {
      precision: 3,
      scale: 2,
    }),
    dadosOriginais: jsonb("dados_originais"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("importacao_bll_itens_proc_idx").on(
      table.processoImportadoId,
    ),
    idxLote: index("importacao_bll_itens_especificados_lote_idx").on(
      table.loteImportadoId,
    ),
    idxFornecedorImportado: index(
      "importacao_bll_itens_fornecedor_importado_idx",
    ).on(table.fornecedorImportadoId),
    idxCatalogo: index("importacao_bll_itens_catalogo_idx").on(
      table.catalogoInternoId,
    ),
    idxCodigoCatalogo: index("importacao_bll_itens_codigo_catalogo_idx").on(
      table.codigoCatalogo,
    ),
    idxEspecificacao: index("importacao_bll_itens_espec_gin").on(
      table.especificacaoTecnica,
    ),
  }),
);

export const importacaoBllEdicoesAudit = pgTable(
  "importacao_bll_edicoes_audit",
  {
    id: serial("id").primaryKey(),
    processoImportadoId: integer("processo_importado_id")
      .notNull()
      .references(() => importacaoBllProcessos.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    camposAlterados: jsonb("campos_alterados").notNull(), // Array of {field, old_value, new_value}
    justificativa: text("justificativa").notNull(),
    origemEdicao: importacaoBllEdicaoOrigemEnum("origem_edicao")
      .notNull()
      .default("MANUAL"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxProcesso: index("importacao_bll_edicoes_audit_processo_idx").on(
      table.processoImportadoId,
    ),
    idxUsuario: index("importacao_bll_edicoes_audit_usuario_idx").on(
      table.usuarioId,
    ),
  }),
);

export const importacaoLegadoLotes = pgTable(
  "importacao_legado_lotes",
  {
    id: serial("id").primaryKey(),
    filename: varchar("filename", { length: 255 }).notNull(),
    sheetName: varchar("sheet_name", { length: 160 }).notNull(),
    status: importacaoLegadoLoteStatusEnum("status")
      .notNull()
      .default("EM_REVISAO"),
    totalRegistros: integer("total_registros").notNull().default(0),
    totalLimpos: integer("total_limpos").notNull().default(0),
    totalPendencias: integer("total_pendencias").notNull().default(0),
    totalCriticos: integer("total_criticos").notNull().default(0),
    totalMatchInterno: integer("total_match_interno").notNull().default(0),
    totalMatchBase: integer("total_match_base").notNull().default(0),
    totalPendentesRevisao: integer("total_pendentes_revisao")
      .notNull()
      .default(0),
    totalAprovadosImportacao: integer("total_aprovados_importacao")
      .notNull()
      .default(0),
    totalIgnorados: integer("total_ignorados").notNull().default(0),
    totalVinculadosInterno: integer("total_vinculados_interno")
      .notNull()
      .default(0),
    totalDuplicadosBase: integer("total_duplicados_base").notNull().default(0),
    issueBuckets: jsonb("issue_buckets")
      .notNull()
      .default(sql`'[]'::jsonb`),
    duplicateGroups: jsonb("duplicate_groups")
      .notNull()
      .default(sql`'[]'::jsonb`),
    criadoPor: integer("criado_por").references(() => users.id, {
      onDelete: "set null",
    }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxStatus: index("importacao_legado_lotes_status_idx").on(table.status),
    idxCriadoEm: index("importacao_legado_lotes_criado_em_idx").on(
      table.criadoEm,
    ),
  }),
);

export const importacaoLegadoRegistros = pgTable(
  "importacao_legado_registros",
  {
    id: serial("id").primaryKey(),
    loteId: integer("lote_id")
      .notNull()
      .references(() => importacaoLegadoLotes.id, { onDelete: "cascade" }),
    linha: integer("linha").notNull(),
    legacyId: varchar("legacy_id", { length: 128 }),
    modalidade: varchar("modalidade", { length: 160 }),
    processoAdministrativo: varchar("processo_administrativo", {
      length: 160,
    }),
    protocolo: varchar("protocolo", { length: 160 }),
    numeroEdital: varchar("numero_edital", { length: 160 }),
    statusLegado: varchar("status_legado", { length: 160 }),
    secretaria: varchar("secretaria", { length: 255 }),
    mappedSecretaria: varchar("mapped_secretaria", { length: 255 }),
    objetoResumo: text("objeto_resumo"),
    valorEstimado: numeric("valor_estimado", { precision: 18, scale: 2 }),
    valorContratado: numeric("valor_contratado", { precision: 18, scale: 2 }),
    analysisSeverity: varchar("analysis_severity", { length: 24 }).notNull(),
    issues: jsonb("issues")
      .notNull()
      .default(sql`'[]'::jsonb`),
    duplicateFileCount: integer("duplicate_file_count").notNull().default(0),
    duplicateGroupKey: varchar("duplicate_group_key", { length: 255 }),
    internalMatches: jsonb("internal_matches")
      .notNull()
      .default(sql`'[]'::jsonb`),
    importedMatches: jsonb("imported_matches")
      .notNull()
      .default(sql`'[]'::jsonb`),
    reviewStatus: importacaoLegadoRowReviewStatusEnum("review_status")
      .notNull()
      .default("PENDENTE"),
    reviewNotes: text("review_notes"),
    selectedInternalProcessId: integer(
      "selected_internal_process_id",
    ).references(() => processos.id, { onDelete: "set null" }),
    selectedImportedProcessId: integer(
      "selected_imported_process_id",
    ).references(() => importacaoBllProcessos.id, { onDelete: "set null" }),
    reviewedBy: integer("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rawPayload: jsonb("raw_payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxLoteLinha: uniqueIndex("importacao_legado_registros_lote_linha_uq").on(
      table.loteId,
      table.linha,
    ),
    idxReview: index("importacao_legado_registros_review_idx").on(
      table.reviewStatus,
    ),
    idxSeverity: index("importacao_legado_registros_severity_idx").on(
      table.analysisSeverity,
    ),
    idxNumeroEdital: index("importacao_legado_registros_edital_idx").on(
      table.numeroEdital,
    ),
    idxAdministrativo: index("importacao_legado_registros_adm_idx").on(
      table.processoAdministrativo,
    ),
  }),
);

export const importacaoPncpExecucoes = pgTable(
  "importacao_pncp_execucoes",
  {
    id: serial("id").primaryKey(),
    dataInicio: date("data_inicio"),
    dataFim: date("data_fim"),
    status: importacaoPncpStatusExecucaoEnum("status")
      .notNull()
      .default("PROCESSANDO"),
    agendada: boolean("agendada").notNull().default(false),
    totalContratacoes: integer("total_contratacoes").notNull().default(0),
    totalItensContratacao: integer("total_itens_contratacao")
      .notNull()
      .default(0),
    totalAtas: integer("total_atas").notNull().default(0),
    totalItensAta: integer("total_itens_ata").notNull().default(0),
    totalContratos: integer("total_contratos").notNull().default(0),
    totalAditivos: integer("total_aditivos").notNull().default(0),
    totalFornecedores: integer("total_fornecedores").notNull().default(0),
    mensagem: text("mensagem"),
    erros: jsonb("erros"),
    detalhes: jsonb("detalhes"),
    criadoPor: integer("criado_por").references(() => users.id),
    iniciadoEm: timestamp("iniciado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finalizadoEm: timestamp("finalizado_em", { withTimezone: true }),
  },
  (table) => ({
    idxStatus: index("importacao_pncp_execucoes_status_idx").on(table.status),
    idxPeriodo: index("importacao_pncp_execucoes_periodo_idx").on(
      table.dataInicio,
      table.dataFim,
    ),
  }),
);

export const importacaoPncpFornecedores = pgTable(
  "importacao_pncp_fornecedores",
  {
    id: serial("id").primaryKey(),
    documento: varchar("documento", { length: 32 }),
    nome: varchar("nome", { length: 255 }).notNull(),
    tipo: varchar("tipo", { length: 8 }),
    municipio: varchar("municipio", { length: 120 }),
    uf: varchar("uf", { length: 2 }),
    dadosOriginais: jsonb("dados_originais"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqDocumento: uniqueIndex("importacao_pncp_fornecedores_documento_uq").on(
      table.documento,
    ),
    idxNome: index("importacao_pncp_fornecedores_nome_idx").on(table.nome),
  }),
);

export const importacaoPncpContratacoes = pgTable(
  "importacao_pncp_contratacoes",
  {
    id: serial("id").primaryKey(),
    numeroControlePncp: varchar("numero_controle_pncp", {
      length: 120,
    }).notNull(),
    anoCompra: integer("ano_compra"),
    sequencialCompra: integer("sequencial_compra"),
    modalidade: varchar("modalidade", { length: 160 }),
    modoDisputa: varchar("modo_disputa", { length: 160 }),
    criterioJulgamento: varchar("criterio_julgamento", { length: 160 }),
    objeto: text("objeto"),
    valorTotalEstimado: numeric("valor_total_estimado", {
      precision: 14,
      scale: 2,
    }),
    dataPublicacao: timestamp("data_publicacao", { withTimezone: true }),
    dataAberturaProposta: timestamp("data_abertura_proposta", {
      withTimezone: true,
    }),
    dataEncerramentoProposta: timestamp("data_encerramento_proposta", {
      withTimezone: true,
    }),
    orgaoEntidadeNome: varchar("orgao_entidade_nome", { length: 255 }),
    orgaoEntidadeCnpj: varchar("orgao_entidade_cnpj", { length: 32 }),
    unidadeNome: varchar("unidade_nome", { length: 255 }),
    situacao: varchar("situacao", { length: 160 }),
    urlProcesso: varchar("url_processo", { length: 500 }),
    processoInternoId: integer("processo_interno_id").references(
      () => processos.id,
      { onDelete: "set null" },
    ),
    dadosOriginais: jsonb("dados_originais"),
    ultimaExecucaoId: integer("ultima_execucao_id").references(
      () => importacaoPncpExecucoes.id,
      { onDelete: "set null" },
    ),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqControle: uniqueIndex("importacao_pncp_contratacoes_controle_uq").on(
      table.numeroControlePncp,
    ),
    idxPublicacao: index("importacao_pncp_contratacoes_publicacao_idx").on(
      table.dataPublicacao,
    ),
    idxProcessoInterno: index(
      "importacao_pncp_contratacoes_processo_interno_idx",
    ).on(table.processoInternoId),
  }),
);

export const importacaoPncpItensContratacao = pgTable(
  "importacao_pncp_itens_contratacao",
  {
    id: serial("id").primaryKey(),
    contratacaoId: integer("contratacao_id")
      .notNull()
      .references(() => importacaoPncpContratacoes.id, {
        onDelete: "cascade",
      }),
    numeroItem: varchar("numero_item", { length: 64 }),
    descricao: text("descricao"),
    unidade: varchar("unidade", { length: 64 }),
    quantidade: numeric("quantidade", { precision: 14, scale: 4 }),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
    valorTotal: numeric("valor_total", { precision: 14, scale: 2 }),
    situacao: varchar("situacao", { length: 120 }),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
    fornecedorDocumento: varchar("fornecedor_documento", { length: 32 }),
    fornecedorImportadoId: integer("fornecedor_importado_id").references(
      () => importacaoPncpFornecedores.id,
      { onDelete: "set null" },
    ),
    dadosOriginais: jsonb("dados_originais"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxContratacao: index("importacao_pncp_itens_contratacao_idx").on(
      table.contratacaoId,
    ),
    uqContratacaoItem: uniqueIndex("importacao_pncp_itens_contratacao_uq").on(
      table.contratacaoId,
      table.numeroItem,
    ),
  }),
);

export const importacaoPncpAtas = pgTable(
  "importacao_pncp_atas",
  {
    id: serial("id").primaryKey(),
    idAtaPncp: varchar("id_ata_pncp", { length: 120 }).notNull(),
    numeroAta: varchar("numero_ata", { length: 120 }),
    objeto: text("objeto"),
    valorGlobal: numeric("valor_global", { precision: 14, scale: 2 }),
    dataAssinatura: timestamp("data_assinatura", { withTimezone: true }),
    dataInicioVigencia: timestamp("data_inicio_vigencia", {
      withTimezone: true,
    }),
    dataFimVigencia: timestamp("data_fim_vigencia", {
      withTimezone: true,
    }),
    situacao: varchar("situacao", { length: 120 }),
    orgaoGerenciadorNome: varchar("orgao_gerenciador_nome", { length: 255 }),
    orgaoGerenciadorCnpj: varchar("orgao_gerenciador_cnpj", { length: 32 }),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
    fornecedorDocumento: varchar("fornecedor_documento", { length: 32 }),
    fornecedorImportadoId: integer("fornecedor_importado_id").references(
      () => importacaoPncpFornecedores.id,
      { onDelete: "set null" },
    ),
    urlAta: varchar("url_ata", { length: 500 }),
    processoInternoId: integer("processo_interno_id").references(
      () => processos.id,
      { onDelete: "set null" },
    ),
    dadosOriginais: jsonb("dados_originais"),
    ultimaExecucaoId: integer("ultima_execucao_id").references(
      () => importacaoPncpExecucoes.id,
      { onDelete: "set null" },
    ),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqAta: uniqueIndex("importacao_pncp_atas_id_uq").on(table.idAtaPncp),
    idxVigencia: index("importacao_pncp_atas_vigencia_idx").on(
      table.dataInicioVigencia,
      table.dataFimVigencia,
    ),
    idxProcessoInterno: index("importacao_pncp_atas_processo_interno_idx").on(
      table.processoInternoId,
    ),
  }),
);

export const importacaoPncpItensAta = pgTable(
  "importacao_pncp_itens_ata",
  {
    id: serial("id").primaryKey(),
    ataId: integer("ata_id")
      .notNull()
      .references(() => importacaoPncpAtas.id, { onDelete: "cascade" }),
    numeroItem: varchar("numero_item", { length: 64 }),
    descricao: text("descricao"),
    unidade: varchar("unidade", { length: 64 }),
    quantidade: numeric("quantidade", { precision: 14, scale: 4 }),
    valorUnitario: numeric("valor_unitario", { precision: 14, scale: 2 }),
    valorTotal: numeric("valor_total", { precision: 14, scale: 2 }),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
    fornecedorDocumento: varchar("fornecedor_documento", { length: 32 }),
    fornecedorImportadoId: integer("fornecedor_importado_id").references(
      () => importacaoPncpFornecedores.id,
      { onDelete: "set null" },
    ),
    dadosOriginais: jsonb("dados_originais"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxAta: index("importacao_pncp_itens_ata_idx").on(table.ataId),
    uqAtaItem: uniqueIndex("importacao_pncp_itens_ata_uq").on(
      table.ataId,
      table.numeroItem,
    ),
  }),
);

export const importacaoPncpContratos = pgTable(
  "importacao_pncp_contratos",
  {
    id: serial("id").primaryKey(),
    idContratoPncp: varchar("id_contrato_pncp", { length: 120 }).notNull(),
    numeroContrato: varchar("numero_contrato", { length: 120 }),
    objeto: text("objeto"),
    modalidade: varchar("modalidade", { length: 160 }),
    valorTotal: numeric("valor_total", { precision: 14, scale: 2 }),
    dataAssinatura: timestamp("data_assinatura", { withTimezone: true }),
    dataInicioVigencia: timestamp("data_inicio_vigencia", {
      withTimezone: true,
    }),
    dataFimVigencia: timestamp("data_fim_vigencia", {
      withTimezone: true,
    }),
    dataEncerramento: timestamp("data_encerramento", { withTimezone: true }),
    situacao: varchar("situacao", { length: 120 }),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
    fornecedorDocumento: varchar("fornecedor_documento", { length: 32 }),
    fornecedorImportadoId: integer("fornecedor_importado_id").references(
      () => importacaoPncpFornecedores.id,
      { onDelete: "set null" },
    ),
    urlContrato: varchar("url_contrato", { length: 500 }),
    processoInternoId: integer("processo_interno_id").references(
      () => processos.id,
      { onDelete: "set null" },
    ),
    dadosOriginais: jsonb("dados_originais"),
    ultimaExecucaoId: integer("ultima_execucao_id").references(
      () => importacaoPncpExecucoes.id,
      { onDelete: "set null" },
    ),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqContrato: uniqueIndex("importacao_pncp_contratos_id_uq").on(
      table.idContratoPncp,
    ),
    idxVigencia: index("importacao_pncp_contratos_vigencia_idx").on(
      table.dataInicioVigencia,
      table.dataFimVigencia,
    ),
    idxProcessoInterno: index(
      "importacao_pncp_contratos_processo_interno_idx",
    ).on(table.processoInternoId),
  }),
);

export const contratosPncp = pgTable(
  "contratos_pncp",
  {
    id: serial("id").primaryKey(),
    processoId: integer("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    pncpContractId: varchar("pncp_contract_id", { length: 120 }).notNull(),
    pncpProcessId: varchar("pncp_process_id", { length: 120 }),
    pncpUrl: varchar("pncp_url", { length: 500 }),
    pncpApiUrl: varchar("pncp_api_url", { length: 500 }),
    numeroContrato: varchar("numero_contrato", { length: 120 }),
    anoContrato: integer("ano_contrato"),
    objetoContrato: text("objeto_contrato"),
    valorTotalContrato: numeric("valor_total_contrato", {
      precision: 14,
      scale: 2,
    }),
    valorEmpenhado: numeric("valor_empenhado", { precision: 14, scale: 2 }),
    valorLiquidado: numeric("valor_liquidado", { precision: 14, scale: 2 }),
    valorPago: numeric("valor_pago", { precision: 14, scale: 2 }),
    dataAssinatura: date("data_assinatura"),
    dataInicioVigencia: date("data_inicio_vigencia"),
    dataFimVigencia: date("data_fim_vigencia"),
    diasVigencia: integer("dias_vigencia"),
    fornecedorId: integer("fornecedor_id").references(() => fornecedores.id, {
      onDelete: "set null",
    }),
    fornecedorNome: varchar("fornecedor_nome", { length: 255 }),
    fornecedorCnpj: varchar("fornecedor_cnpj", { length: 20 }),
    statusContrato: varchar("status_contrato", { length: 120 }),
    itensVinculados: jsonb("itens_vinculados"),
    urlDocumentoContrato: varchar("url_documento_contrato", { length: 500 }),
    urlDocumentoEmpenho: varchar("url_documento_empenho", { length: 500 }),
    ultimaSincronizacaoPncp: timestamp("ultima_sincronizacao_pncp", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    dadosCompletosPncp: jsonb("dados_completos_pncp"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uqPncpContract: uniqueIndex("contratos_pncp_contract_uq").on(
      table.pncpContractId,
    ),
    idxProcesso: index("contratos_pncp_processo_idx").on(table.processoId),
    idxFornecedor: index("contratos_pncp_fornecedor_idx").on(
      table.fornecedorId,
    ),
    idxFornecedorCnpj: index("contratos_pncp_fornecedor_cnpj_idx").on(
      table.fornecedorCnpj,
    ),
    idxStatus: index("contratos_pncp_status_idx").on(table.statusContrato),
  }),
);

export const importacaoPncpAditivos = pgTable(
  "importacao_pncp_aditivos",
  {
    id: serial("id").primaryKey(),
    contratoId: integer("contrato_id")
      .notNull()
      .references(() => importacaoPncpContratos.id, { onDelete: "cascade" }),
    idAditivoPncp: varchar("id_aditivo_pncp", { length: 120 }),
    numeroAditivo: varchar("numero_aditivo", { length: 120 }),
    tipoAditivo: varchar("tipo_aditivo", { length: 160 }),
    objeto: text("objeto"),
    valorAditivo: numeric("valor_aditivo", { precision: 14, scale: 2 }),
    dataAssinatura: timestamp("data_assinatura", { withTimezone: true }),
    dataInicioVigencia: timestamp("data_inicio_vigencia", {
      withTimezone: true,
    }),
    dataFimVigencia: timestamp("data_fim_vigencia", { withTimezone: true }),
    dadosOriginais: jsonb("dados_originais"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxContrato: index("importacao_pncp_aditivos_contrato_idx").on(
      table.contratoId,
    ),
    uqContratoAditivo: uniqueIndex("importacao_pncp_aditivos_uq").on(
      table.contratoId,
      table.idAditivoPncp,
    ),
  }),
);

export const authLog = pgTable(
  "auth_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    loginInformado: varchar("login_informado", { length: 120 }),
    loginNormalizado: varchar("login_normalizado", { length: 120 }),
    ipAddress: varchar("ip_address", { length: 120 }),
    evento: authEventTypeEnum("evento").notNull(),
    detalhe: text("detalhe"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxUser: index("auth_log_user_idx").on(table.userId),
    idxLogin: index("auth_log_login_idx").on(table.loginNormalizado),
    idxEvento: index("auth_log_evento_idx").on(table.evento),
    idxCriadoEm: index("auth_log_criado_em_idx").on(table.criadoEm),
  }),
);

export const authRecoveryChallenges = pgTable(
  "auth_recovery_challenges",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    purpose: varchar("purpose", { length: 40 }).notNull(),
    challengeHash: varchar("challenge_hash", { length: 128 }).notNull(),
    usernameFingerprint: varchar("username_fingerprint", {
      length: 128,
    }),
    identityFingerprint: varchar("identity_fingerprint", {
      length: 128,
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    ipFingerprint: varchar("ip_fingerprint", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxUser: index("auth_recovery_challenges_user_idx").on(table.userId),
    idxPurpose: index("auth_recovery_challenges_purpose_idx").on(table.purpose),
    idxChallenge: index("auth_recovery_challenges_hash_idx").on(
      table.challengeHash,
    ),
    idxIp: index("auth_recovery_challenges_ip_idx").on(table.ipFingerprint),
    idxUsername: index("auth_recovery_challenges_username_idx").on(
      table.usernameFingerprint,
    ),
    idxIdentity: index("auth_recovery_challenges_identity_idx").on(
      table.identityFingerprint,
    ),
    idxCreatedAt: index("auth_recovery_challenges_created_at_idx").on(
      table.createdAt,
    ),
  }),
);

export const auditoriaLog = pgTable(
  "auditoria_log",
  {
    id: serial("id").primaryKey(),
    usuarioId: integer("usuario_id").references(() => users.id),
    tabela: varchar("tabela", { length: 120 }).notNull(),
    registroId: integer("registro_id").notNull(),
    acao: auditoriaAcaoEnum("acao").notNull(),
    dadosAnteriores: jsonb("dados_anteriores"),
    dadosNovos: jsonb("dados_novos"),
    descricao: text("descricao"),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    idxUsuario: index("auditoria_usuario_idx").on(table.usuarioId),
    idxTabela: index("auditoria_tabela_idx").on(table.tabela),
    idxTabelaRegistroCriado: index("auditoria_tabela_registro_criado_idx").on(
      table.tabela,
      table.registroId,
      table.criadoEm,
    ),
  }),
);

export const arquivoIndex = pgTable(
  "arquivo_index",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    relativePath: text("relative_path").notNull().unique(),
    parentPath: text("parent_path").notNull().default(""),
    name: text("name").notNull(),
    extension: varchar("extension", { length: 32 }).notNull().default(""),
    kind: varchar("kind", { length: 32 }).notNull(),
    size: bigint("size", { mode: "number" }),
    modifiedAt: timestamp("modified_at", { withTimezone: true }),
    contentText: text("content_text"),
    contentIndexedAt: timestamp("content_indexed_at", { withTimezone: true }),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    parentIdx: index("arquivo_index_parent_idx").on(table.parentPath),
    kindIdx: index("arquivo_index_kind_idx").on(table.kind),
  }),
);

export const arquivoFavoritos = pgTable(
  "arquivo_favoritos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    relativePath: text("relative_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userPathUq: uniqueIndex("arquivo_favoritos_user_path_uq").on(table.userId, table.relativePath),
    userIdx: index("arquivo_favoritos_user_idx").on(table.userId),
  }),
);

export const arquivoAuditLog = pgTable(
  "arquivo_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 32 }).notNull(),
    relativePath: text("relative_path"),
    fileName: text("file_name"),
    fileSize: bigint("file_size", { mode: "number" }),
    ipAddress: varchar("ip_address", { length: 120 }),
    userAgent: text("user_agent"),
    success: boolean("success").notNull().default(true),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("arquivo_audit_user_idx").on(table.userId),
    actionIdx: index("arquivo_audit_action_idx").on(table.action),
    createdIdx: index("arquivo_audit_created_idx").on(table.createdAt),
    pathIdx: index("arquivo_audit_path_idx").on(table.relativePath),
  }),
);
