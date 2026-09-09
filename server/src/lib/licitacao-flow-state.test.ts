import { describe, expect, it } from "vitest";
import { getLicitacaoDocumentRequirements } from "@sirel/shared/licitacao-guided-flow";
import { evaluateLicitacaoFlow, isCompletedFlowException, type LicitacaoFlowSnapshot } from "./licitacao-flow-state.js";
import { assertLicitacaoFlowState } from "./licitacao-flow-guard.js";

function ready(): LicitacaoFlowSnapshot {
  const context = { modalidadeCodigo: "DISPENSA_SIMPLIFICADA", modoDisputa: "NAO_SE_APLICA" };
  return {
    context, publicado: true, homologado: false, status: "HOMOLOGACAO",
    fields: { comissaoId: 1, equipeApoioId: 2, ordenadorDespesaId: 3, condutorProcessoId: 4,
      dataPublicacaoEdital: "2026-09-08", linkPncpPublico: "https://pncp.gov.br/app/editais/123" },
    documents: getLicitacaoDocumentRequirements(context).filter((item) => item.obrigatorio)
      .map((item) => ({ categoria: item.category, arquivoUrl: `/storage/test/${item.category}.pdf` })),
    exceptions: [], bidders: [{ id: 1, statusHabilitacao: "HABILITADO", ativo: true }],
    proposals: [{ itemId: 1, licitanteId: 1, situacao: "VENCEDORA", classificacao: 1 }], itemIds: [1], pendingAppeals: 0,
  };
}
const evaluate = (snapshot: LicitacaoFlowSnapshot) => ({ snapshot, state: evaluateLicitacaoFlow(snapshot, "BLOCKING") });

describe("completude do fluxo da licitacao", () => {
  it("completa a dispensa sem disputa sem BLL, lances ou sessao competitiva", () => {
    const flow = evaluate(ready());
    expect(flow.state.phases.map((phase) => phase.key)).toEqual(["PREPARACAO", "PUBLICACAO", "JULGAMENTO", "HABILITACAO", "CONTROLE_INTERNO", "HOMOLOGACAO", "FECHAMENTO"]);
    expect(flow.state.evidence.map((item) => item.category)).not.toContain("LICITACAO_PUBLIC_LINK_BLL");
    expect(() => assertLicitacaoFlowState(flow, "homologar")).not.toThrow();
    expect(() => assertLicitacaoFlowState(flow, "close")).toThrow(/homologacao/);
    flow.snapshot.homologado = true;
    expect(() => assertLicitacaoFlowState(evaluate(flow.snapshot), "close")).not.toThrow();
  });

  it("bloqueia cada requisito documental obrigatorio mesmo em processo historico avancado", () => {
    for (const requirement of getLicitacaoDocumentRequirements(ready().context).filter((item) => item.obrigatorio && item.completionStrategy !== "CATALOG_SELECTION" && item.completionStrategy !== "SYSTEM_FIELD")) {
      const snapshot = ready();
      snapshot.documents = snapshot.documents.filter((item) => item.categoria !== requirement.category);
      expect(() => assertLicitacaoFlowState(evaluate(snapshot), "homologar")).toThrow(requirement.label);
      expect(snapshot.status).toBe("HOMOLOGACAO");
    }
  });

  it("libera fases progressivamente a partir da preparacao", () => {
    const snapshot = ready(); snapshot.status = "PREPARACAO"; snapshot.publicado = false;
    snapshot.documents = [];
    let flow = evaluate(snapshot);
    expect(flow.state.phases.find((item) => item.key === "PUBLICACAO")?.accessible).toBe(false);
    expect(() => assertLicitacaoFlowState(flow, "phase", "JULGAMENTO")).toThrow(/PREPARACAO/);
    snapshot.documents = ready().documents.filter((doc) => getLicitacaoDocumentRequirements(snapshot.context).some((req) => req.category === doc.categoria && req.phase === "PREPARACAO"));
    flow = evaluate(snapshot);
    expect(flow.state.phases.find((item) => item.key === "PUBLICACAO")?.accessible).toBe(true);
    expect(flow.state.phases.find((item) => item.key === "JULGAMENTO")?.accessible).toBe(false);
    snapshot.documents = ready().documents;
    expect(() => assertLicitacaoFlowState(evaluate(snapshot), "publish")).not.toThrow();
    expect(() => assertLicitacaoFlowState(evaluate(snapshot), "phase", "JULGAMENTO")).toThrow(/publicacao/);
  });

  it("aceita declaracao fisica completa e nao aplicabilidade justificada, nunca outro setor", () => {
    const snapshot = ready(); const categoria = "LICITACAO_RESERVA_ORCAMENTARIA";
    snapshot.documents = snapshot.documents.filter((item) => item.categoria !== categoria);
    snapshot.exceptions = [{ categoria, statusFlexivel: "CONCLUIDO_FISICO", justificativa: "Original assinado", processoFisicoNumero: "PA-123", localArquivamento: "Arquivo, caixa 5" }];
    expect(evaluate(snapshot).state.actions.homologar.allowed).toBe(true);
    snapshot.exceptions[0].statusFlexivel = "OUTRO_SETOR";
    expect(evaluate(snapshot).state.actions.homologar.allowed).toBe(false);
    snapshot.exceptions[0].statusFlexivel = "NAO_APLICAVEL";
    expect(evaluate(snapshot).state.actions.homologar.allowed).toBe(true);
    snapshot.exceptions[0].justificativa = "";
    expect(evaluate(snapshot).state.actions.homologar.allowed).toBe(false);
    expect(isCompletedFlowException({ categoria, statusFlexivel: "CONCLUIDO_FISICO", justificativa: "Sim", localArquivamento: "Arquivo" })).toBe(false);
  });

  it("nao aceita upload ou declaracao substituindo selecao institucional", () => {
    const snapshot = ready(); snapshot.fields.comissaoId = null;
    snapshot.exceptions = [{ categoria: "LICITACAO_DECRETO_COMISSAO", statusFlexivel: "NAO_APLICAVEL", justificativa: "Teste" }];
    expect(() => assertLicitacaoFlowState(evaluate(snapshot), "publish")).toThrow(/Comissao/);
  });

  it("rejeita fornecedor inabilitado, item sem proposta e recurso excepcional pendente", () => {
    const snapshot = ready(); snapshot.bidders[0].statusHabilitacao = "INABILITADO";
    expect(() => assertLicitacaoFlowState(evaluate(snapshot), "homologar")).toThrow(/habilitacao/);
    snapshot.bidders[0].statusHabilitacao = "HABILITADO"; snapshot.itemIds.push(2);
    expect(() => assertLicitacaoFlowState(evaluate(snapshot), "homologar")).toThrow(/cada item/);
    snapshot.itemIds = [1]; snapshot.pendingAppeals = 1;
    expect(() => assertLicitacaoFlowState(evaluate(snapshot), "homologar")).toThrow(/recurso/);
    expect(() => assertLicitacaoFlowState(evaluate(snapshot), "phase", "LANCES")).toThrow(/nao aplicavel/);
  });

  it("preserva requisitos competitivos e a ordem da inversao de fases", () => {
    const snapshot = ready(); snapshot.context = { modalidadeCodigo: "PREGAO_ELETRONICO", modoDisputa: "ABERTO", inversaoFasesHabilitada: true };
    const flow = evaluate(snapshot);
    expect(flow.state.phases.map((phase) => phase.key)).toEqual(["PREPARACAO", "PUBLICACAO", "HABILITACAO", "DISPUTA", "JULGAMENTO", "RECURSOS", "CONTROLE_INTERNO", "HOMOLOGACAO", "FECHAMENTO"]);
    expect(flow.state.evidence.find((item) => item.category === "LICITACAO_ATA_RELATORIO_LANCES")?.obrigatorio).toBe(true);
    expect(flow.state.actions.homologar.allowed).toBe(false);
  });

  it("preserva modo orientativo por configuracao sem ocultar pendencias", () => {
    const snapshot = ready(); snapshot.documents = [];
    const flow = { snapshot, state: evaluateLicitacaoFlow(snapshot, "ADVISORY") };
    expect(flow.state.actions.homologar.blockers.length).toBeGreaterThan(0);
    expect(() => assertLicitacaoFlowState(flow, "homologar")).not.toThrow();
  });
});
