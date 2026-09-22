import { beforeEach, expect, it, vi } from "vitest";
import { initTRPC } from "@trpc/server";
import { getTableName } from "drizzle-orm";
import { grupoInstitucionalSaveInputSchema } from "@sirel/shared/schemas/cadastros-institucionais";

const { reads, writes, audit } = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: string; data: any }[],
  audit: vi.fn(),
}));
vi.mock("../trpc.js", () => {
  const t = initTRPC.create();
  return {
    router: t.router,
    operadorProcedure: t.procedure,
    gestorProcedure: t.procedure,
    protectedProcedure: t.procedure,
  };
});
vi.mock("../db/auditoria.js", () => ({ logAuditoria: audit }));
vi.mock("../db/client.js", () => {
  const db: any = {
    select: () => {
      const chain: any = {
        then: (resolve: any, reject: any) =>
          Promise.resolve(reads.shift() ?? []).then(resolve, reject),
      };
      for (const key of [
        "from",
        "where",
        "limit",
        "innerJoin",
        "leftJoin",
        "orderBy",
      ])
        chain[key] = () => chain;
      return chain;
    },
    update: (table: any) => ({
      set: (data: any) => {
        writes.push({ table: getTableName(table), data });
        return {
          where: () => ({
            returning: async () => [{ id: 10, ...data }],
            then: (resolve: any) => Promise.resolve([]).then(resolve),
          }),
        };
      },
    }),
    transaction: (callback: any) => callback(db),
  };
  return { requireDb: () => db };
});
import { cadastrosInstitucionaisRouter } from "../routers/cadastros-institucionais.js";

const agent = {
  id: 5,
  tipo: "AGENTE_CONTRATACAO",
  nome: "Agente de teste",
  ativo: true,
  atoDesignacaoId: 7,
  atoNumero: "100",
  atoAno: 2026,
  atoTipo: "DECRETO",
  atoArquivoUrl: "/storage/ato.pdf",
};
const member = {
  grupoId: 5,
  pessoaId: 9,
  pessoaNome: "Agente de teste",
  funcao: "AGENTE_CONTRATACAO",
  ativo: true,
};
const input = {
  tipo: "AGENTE_CONTRATACAO",
  nome: "Agente de teste",
  atoDesignacaoId: 7,
  membros: [member],
};
const caller = cadastrosInstitucionaisRouter.createCaller({} as never);
beforeEach(() => {
  reads.length = 0;
  writes.length = 0;
  audit.mockReset();
});

it("exige uma pessoa ativa na função de agente", () => {
  expect(grupoInstitucionalSaveInputSchema.safeParse(input).success).toBe(true);
  for (const membros of [
    [],
    [member, { ...member, pessoaId: 10 }],
    [{ ...member, ativo: false }],
    [{ ...member, funcao: "MEMBRO" }],
  ]) {
    expect(
      grupoInstitucionalSaveInputSchema.safeParse({ ...input, membros })
        .success,
    ).toBe(false);
  }
});

it("seleciona o agente, guarda o ato no snapshot e atualiza o condutor", async () => {
  reads.push(
    [{ id: 1, condutorProcessoId: 3 }],
    [{ id: 10, agenteContratacaoId: null }],
    [agent],
    [member],
  );
  await caller.designacoes.selectForLicitacao({
    processoId: 1,
    agenteContratacaoId: 5,
  });
  expect(
    writes.find((write) => write.table === "licitacoes")?.data,
  ).toMatchObject({
    agenteContratacaoId: 5,
    designacoesSnapshot: {
      agenteContratacao: { id: 5, ato: { arquivoUrl: "/storage/ato.pdf" } },
    },
  });
  expect(
    writes.find((write) => write.table === "processos")?.data
      .condutorProcessoId,
  ).toBe(9);
  expect(audit).toHaveBeenCalledOnce();
});

it("preserva a designação quando um cliente anterior omite o campo", async () => {
  reads.push(
    [{ id: 1, condutorProcessoId: 9 }],
    [{ id: 10, agenteContratacaoId: 5 }],
    [agent],
    [member],
  );
  await caller.designacoes.selectForLicitacao({ processoId: 1 });
  expect(writes[0].data.agenteContratacaoId).toBe(5);
  expect(writes.some((write) => write.table === "processos")).toBe(false);
});

it.each(["COMISSAO_CONTRATACAO", "EQUIPE_APOIO"])(
  "não aceita %s como agente",
  async (tipo) => {
    reads.push([{ id: 1 }], [{ id: 10 }], [{ ...agent, tipo }], [member]);
    await expect(
      caller.designacoes.selectForLicitacao({
        processoId: 1,
        agenteContratacaoId: 5,
      }),
    ).rejects.toThrow(/inválido/);
    expect(writes).toHaveLength(0);
  },
);

it("impede alterar cadastro usado em processo", async () => {
  reads.push([agent], [member], [{ id: 10 }]);
  await expect(
    caller.agentesContratacao.save({
      ...input,
      tipo: "AGENTE_CONTRATACAO",
      id: 5,
      membros: [
        { ...member, funcao: "AGENTE_CONTRATACAO", ordem: 0, titular: true },
      ],
      versao: 1,
      ativo: true,
    }),
  ).rejects.toThrow(/nova versao/);
  expect(writes).toHaveLength(0);
});
