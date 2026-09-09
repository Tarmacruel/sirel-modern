import { beforeEach, describe, expect, it, vi } from "vitest";
import { initTRPC } from "@trpc/server";

const { writes, readResults } = vi.hoisted(() => ({ writes: vi.fn(), readResults: [] as unknown[][] }));
vi.mock("../trpc.js", () => {
  const t = initTRPC.create();
  return { router: t.router, operadorProcedure: t.procedure, publicProcedure: t.procedure, gestorProcedure: t.procedure, protectedProcedure: t.procedure };
});
vi.mock("../db/client.js", () => {
  const chain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn(() => Promise.resolve(readResults.shift() ?? [])) };
  return { requireDb: () => ({ select: () => chain, insert: writes, update: writes, delete: writes }), databaseEnabled: false };
});
vi.mock("../lib/licitacao-flow-guard.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/licitacao-flow-guard.js")>();
  const { evaluateLicitacaoFlow } = await import("../lib/licitacao-flow-state.js");
  return { ...actual, assertLicitacaoFlow: vi.fn(async (_db, _id, action, status) => {
    const snapshot = { context: { modalidadeCodigo: "DISPENSA_SIMPLIFICADA", modoDisputa: "NAO_SE_APLICA" },
      publicado: false, homologado: false, status: "PREPARACAO", fields: {}, documents: [], exceptions: [],
      bidders: [], proposals: [], itemIds: [], pendingAppeals: 0 };
    actual.assertLicitacaoFlowState({ snapshot, state: evaluateLicitacaoFlow(snapshot, "BLOCKING") }, action, status);
  }) };
});

import { licitacaoRouter } from "../routers/licitacao.js";
import { workflowRouter } from "../routers/workflow.js";

beforeEach(() => { writes.mockReset(); readResults.length = 0; });

describe("API rejeita avanco incompleto antes de gravar", () => {
  const caller = licitacaoRouter.createCaller({} as never);
  it("publicacao direta nao cria licitacao nem marca publicado", async () => {
    await expect(caller.publish({ processoId: 1, condutorProcessoId: 1, justificativaAuditoria: "Cadastro fora do fluxo" })).rejects.toThrow(/PREPARACAO/);
    expect(writes).not.toHaveBeenCalled();
  });
  it("nao permite pular fases com justificativa fora do fluxo", async () => {
    await expect(caller.advanceStage({ processoId: 1, statusLicitacao: "HOMOLOGACAO", etapaAtual: "Homologacao", justificativaAuditoria: "Teste fora do fluxo" })).rejects.toThrow(/PREPARACAO/);
    expect(writes).not.toHaveBeenCalled();
  });
  it("homologacao antecipada nao altera status, datas ou historico", async () => {
    await expect(caller.homologar({ processoId: 1, dataHomologacao: "2026-09-08" })).rejects.toThrow(/PREPARACAO/);
    expect(writes).not.toHaveBeenCalled();
  });
  it("habilitacao fora de ordem nao altera licitante", async () => {
    readResults.push([{ id: 2, licitacaoId: 3 }], [{ id: 3, processoId: 1 }]);
    await expect(caller.saveHabilitacao({ licitanteId: 2, statusHabilitacao: "HABILITADO" })).rejects.toThrow(/PREPARACAO/);
    expect(writes).not.toHaveBeenCalled();
  });
  it("recurso fora de ordem nao cria registros", async () => {
    await expect(caller.saveRecurso({ processoId: 1, licitanteId: 2, descricao: "Recurso de teste", resultado: "PENDENTE" })).rejects.toThrow(/PREPARACAO/);
    expect(writes).not.toHaveBeenCalled();
  });
  it("lance de dispensa sem disputa nao grava lance ou fase", async () => {
    readResults.push([{ id: 4, licitanteId: 2 }], [{ id: 2, licitacaoId: 3 }], [{ id: 3, processoId: 1 }]);
    await expect(caller.saveLance({ propostaId: 4, valorLance: 10 })).rejects.toThrow(/nao aplicavel/);
    expect(writes).not.toHaveBeenCalled();
  });
  it("publicacao pela rota alternativa tambem verifica os requisitos", async () => {
    await expect(workflowRouter.createCaller({} as never).publish({ processoId: 1, condutorProcessoId: 1 })).rejects.toThrow(/PREPARACAO/);
    expect(writes).not.toHaveBeenCalled();
  });
});
