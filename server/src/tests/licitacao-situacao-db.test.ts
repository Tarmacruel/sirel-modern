import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { initTRPC, TRPCError } from "@trpc/server";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../db/client.js", () => ({ requireDb: () => holder.db }));
vi.mock("../trpc.js", () => {
  const t = initTRPC.context<any>().create();
  return {
    router: t.router,
    protectedProcedure: t.procedure,
    operadorProcedure: t.procedure,
    gestorProcedure: t.procedure.use(({ ctx, next }) => {
        if (!["admin", "gestor"].includes((ctx as any).user.role))
        throw new TRPCError({ code: "FORBIDDEN" });
      return next();
    }),
  };
});
import { licitacaoSituacaoRouter } from "../routers/licitacao-situacao.js";
import {
  assertProcessOperational,
  guardOperationalMutation,
} from "../lib/licitacao-operational-guard.js";

// Opt-in. Only CREATE/DROP DATABASE are issued on the connection's maintenance DB.
// Every business write runs in a uniquely named disposable database, never DATABASE_URL.
describe.skipIf(process.env.RUN_DECISAO_DB_TESTS !== "true")(
  "decisões em PostgreSQL isolado",
  () => {
    let admin: pg.Client, pool: pg.Pool;
    const databaseName = `sirel_decisao_test_${process.pid}_${Date.now()}`;
    let created = false;
    const caller = licitacaoSituacaoRouter.createCaller({
      user: { id: 1, role: "gestor" },
    } as never);
    const operator = licitacaoSituacaoRouter.createCaller({
      user: { id: 1, role: "operador" },
    } as never);
    const decision = {
      processoId: 1,
      data: "2026-09-22",
      justificativa: "Decisão de teste isolado",
    };
    beforeAll(async () => {
      const source = process.env.DATABASE_URL;
      if (!source)
        throw new Error(
          "DATABASE_URL necessária para criar o banco descartável.",
        );
      admin = new pg.Client({ connectionString: source });
      await admin.connect();
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      created = true;
      const url = new URL(source);
      url.pathname = `/${databaseName}`;
      pool = new pg.Pool({ connectionString: url.toString() });
      holder.db = drizzle(pool);
      await pool.query(`
      CREATE TYPE licitacao_status AS ENUM ('PREPARACAO','JULGAMENTO','HABILITACAO','FRACASSADA','CANCELADA');
      CREATE TYPE workflow_situacao AS ENUM ('EM_ANDAMENTO','SUSPENSO','CONCLUIDO');
      CREATE TABLE users(id integer PRIMARY KEY,name text);
      CREATE TABLE status_processo(id serial PRIMARY KEY,codigo text UNIQUE,nome text,ativo boolean);
      CREATE TABLE processos(id integer PRIMARY KEY,status_id integer REFERENCES status_processo(id),data_encerramento date,homologado boolean DEFAULT false,atualizado_em timestamptz);
      CREATE TABLE licitacoes(id serial PRIMARY KEY,processo_id integer UNIQUE REFERENCES processos(id),status_licitacao licitacao_status,situacao_procedimento jsonb,atualizado_em timestamptz);
      CREATE TABLE itens_processo(id integer PRIMARY KEY,processo_id integer REFERENCES processos(id),numero_item integer,descricao text);
      CREATE TABLE itens_processo_valores(item_processo_id integer UNIQUE REFERENCES itens_processo(id),resultado_licitacao text,resultado_decisao jsonb,item_fracassado boolean DEFAULT false,item_deserto boolean DEFAULT false,item_homologado boolean DEFAULT false,fornecedor_vencedor_id integer,fornecedor_vencedor_nome text,motivo_fracasso text,origem_alteracao text,atualizado_em timestamptz);
      CREATE TABLE licitantes(id integer PRIMARY KEY,status_habilitacao text);
      CREATE TABLE propostas_licitacao(id serial PRIMARY KEY,licitante_id integer DEFAULT 1 REFERENCES licitantes(id),item_id integer REFERENCES itens_processo(id),situacao text,classificacao integer);
      CREATE TABLE contratos(id integer PRIMARY KEY,processo_id integer REFERENCES processos(id));
      CREATE TABLE documentos(id integer PRIMARY KEY,processo_id integer REFERENCES processos(id));
      CREATE TABLE workflow_processo(processo_id integer UNIQUE REFERENCES processos(id),situacao workflow_situacao,etapa_atual text,data_conclusao date,atualizado_em timestamptz);
      CREATE TABLE licitacao_decisoes(id serial PRIMARY KEY,processo_id integer,acao text,item_ids jsonb,decisao jsonb,anterior jsonb,usuario_id integer REFERENCES users(id),criado_em timestamptz DEFAULT now());
      CREATE TABLE movimentacoes_workflow(id serial PRIMARY KEY,processo_id integer,modulo_destino text,descricao text,observacao text,usuario_id integer);
      CREATE TABLE auditoria_log(id serial PRIMARY KEY,usuario_id integer,tabela text,registro_id integer,acao text,dados_anteriores jsonb,dados_novos jsonb,descricao text);
    `);
    });
    beforeEach(async () => {
      await pool.query(`TRUNCATE users,status_processo,processos,licitacoes,itens_processo,itens_processo_valores,licitantes,propostas_licitacao,contratos,documentos,workflow_processo,licitacao_decisoes,movimentacoes_workflow,auditoria_log RESTART IDENTITY CASCADE;
      INSERT INTO users VALUES(1,'Gestor de teste'); INSERT INTO status_processo(codigo,nome,ativo) VALUES('JULGAMENTO','Em julgamento',true);
      INSERT INTO processos(id,status_id) VALUES(1,1),(2,1);
      INSERT INTO licitacoes(processo_id,status_licitacao) VALUES(1,'JULGAMENTO');
      INSERT INTO workflow_processo(processo_id,situacao,etapa_atual) VALUES(1,'EM_ANDAMENTO','Julgamento');
      INSERT INTO itens_processo VALUES(10,1,1,'Item A'),(11,1,2,'Item B'),(12,2,1,'Outro processo');
      INSERT INTO licitantes VALUES(1,'PENDENTE');
      INSERT INTO propostas_licitacao(item_id,situacao) VALUES(10,'DESCLASSIFICADA'),(11,'VALIDA');
      INSERT INTO documentos VALUES(1,1),(2,2);`);
    });
    afterAll(async () => {
      await pool?.end();
      if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
      await admin?.end();
    });

    it("registra fracasso parcial sem encerrar o processo ou o outro item", async () => {
      await caller.registrarItens({
        ...decision,
        itemIds: [10],
        resultado: "FRACASSADO",
        documentoId: 1,
      });
      const result = await caller.get({ processoId: 1 });
      expect(result.situacao).toBe("EM_ANDAMENTO");
      expect(result.itens.map((i) => i.resultado)).toEqual([
        "FRACASSADO",
        null,
      ]);
      await expect(
        assertProcessOperational(holder.db, 1, [10]),
      ).rejects.toThrow(/item está encerrado/);
      await expect(
        assertProcessOperational(holder.db, 1, [11]),
      ).resolves.toBeUndefined();
      await expect(
        caller.registrarProcesso({ ...decision, situacao: "FRACASSADO" }),
      ).rejects.toThrow(/todas as propostas/);
    });
    it("encerra sem vencedor, persiste histórico e permite reabrir processo e itens separadamente", async () => {
      await pool.query(
        "UPDATE propostas_licitacao SET situacao='DESCLASSIFICADA'",
      );
      expect((await caller.get({ processoId: 1 })).sugestao).toBe("FRACASSADO");
      await caller.registrarProcesso({ ...decision, situacao: "FRACASSADO" });
      expect((await caller.get({ processoId: 1 })).situacao).toBe("FRACASSADO");
      await expect(
        guardOperationalMutation("workflow.move", { processoId: 1 }),
      ).rejects.toThrow(/reabertura/);
      await expect(operator.reabrirProcesso(decision)).rejects.toThrow();
      await caller.reabrirProcesso(decision);
      expect((await caller.get({ processoId: 1 })).todosEncerrados).toBe(true);
      await caller.reabrirItens({ ...decision, itemIds: [10, 11] });
      expect(
        (await caller.get({ processoId: 1 })).itens.every((i) => !i.resultado),
      ).toBe(true);
      expect(
        (await pool.query("select status_licitacao from licitacoes")).rows[0]
          .status_licitacao,
      ).toBe("JULGAMENTO");
      expect(
        (await pool.query("select count(*)::int as n from auditoria_log"))
          .rows[0].n,
      ).toBe(3);
    });
    it("suspende e retoma sem modificar resultados dos itens", async () => {
      await caller.registrarProcesso({ ...decision, situacao: "SUSPENSO" });
      expect(
        (await caller.get({ processoId: 1 })).itens.every((i) => !i.resultado),
      ).toBe(true);
      await caller.reabrirProcesso(decision);
      expect(
        (await pool.query("select situacao,etapa_atual from workflow_processo"))
          .rows[0],
      ).toMatchObject({ situacao: "EM_ANDAMENTO", etapa_atual: "Julgamento" });
    });
    it.each(["REVOGADO", "ANULADO"] as const)(
      "registra %s em lote e mostra no histórico",
      async (resultado) => {
        await caller.registrarItens({
          ...decision,
          itemIds: [10, 11],
          resultado,
        });
        const result = await caller.get({ processoId: 1 });
        expect(result.todosEncerrados).toBe(true);
        expect(result.situacao).toBe("EM_ANDAMENTO");
        expect(result.historico[0].decisao.situacao).toBe(resultado);
      },
    );
    it("registra deserto somente sem propostas", async () => {
      await expect(
        caller.registrarItens({
          ...decision,
          itemIds: [10],
          resultado: "DESERTO",
        }),
      ).rejects.toThrow(/possui propostas/);
      await pool.query("DELETE FROM propostas_licitacao");
      await caller.registrarProcesso({ ...decision, situacao: "DESERTO" });
      expect((await caller.get({ processoId: 1 })).situacao).toBe("DESERTO");
    });
    it("rejeita itens e documentos de outro processo, vencedor e contratação", async () => {
      await expect(
        caller.registrarItens({
          ...decision,
          itemIds: [12],
          resultado: "REVOGADO",
        }),
      ).rejects.toThrow(/deste processo/);
      await expect(
        caller.registrarItens({
          ...decision,
          itemIds: [10],
          resultado: "REVOGADO",
          documentoId: 2,
        }),
      ).rejects.toThrow(/documento/);
      await pool.query(
        "UPDATE propostas_licitacao SET situacao='VENCEDORA' WHERE item_id=10",
      );
      await expect(
        caller.registrarItens({
          ...decision,
          itemIds: [10],
          resultado: "REVOGADO",
        }),
      ).rejects.toThrow(/vencedor/);
      await pool.query("INSERT INTO contratos VALUES(1,1)");
      await expect(
        caller.registrarProcesso({ ...decision, situacao: "ANULADO" }),
      ).rejects.toThrow(/contratação/);
      expect(
        (await pool.query("select count(*)::int as n from auditoria_log"))
          .rows[0].n,
      ).toBe(0);
    });
    it("valida data, justificativa e faz rollback se auditoria falhar", async () => {
      await expect(
        caller.registrarProcesso({
          ...decision,
          situacao: "SUSPENSO",
          data: "2026-02-31",
        }),
      ).rejects.toThrow();
      await expect(
        caller.registrarProcesso({
          ...decision,
          situacao: "SUSPENSO",
          justificativa: " ",
        }),
      ).rejects.toThrow();
      await pool.query(
        "ALTER TABLE auditoria_log ADD CONSTRAINT test_failure CHECK(false)",
      );
      try {
        await expect(
          caller.registrarProcesso({ ...decision, situacao: "SUSPENSO" }),
        ).rejects.toThrow();
      } finally {
        await pool.query(
          "ALTER TABLE auditoria_log DROP CONSTRAINT test_failure",
        );
      }
      expect((await caller.get({ processoId: 1 })).situacao).toBe(
        "EM_ANDAMENTO",
      );
      expect((await caller.get({ processoId: 1 })).historico).toHaveLength(0);
    });
  },
);
