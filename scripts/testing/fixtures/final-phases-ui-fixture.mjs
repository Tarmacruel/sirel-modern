import { evaluateLicitacaoFlow } from "../../../server/src/lib/licitacao-flow-state.ts";
import { createDisputeFixture } from "./dispute-ui-fixture.mjs";

/** Browser operations use synthetic data and the real phase evaluator. */
export function createFinalPhasesFixture({
  phase = "RECURSOS",
  manual = false,
  direct = false,
  inverted = false,
  appeals = phase === "RECURSOS" ? 1 : 0,
  enforcement = "BLOCKING",
  gateBlockers = [],
  modalidade,
} = {}) {
  const base = createDisputeFixture({
    populated: true,
    direct,
    inverted,
    enforcement,
  });
  const initial = base.detail();
  const context = {
    modalidadeCodigo: modalidade ?? initial.processo.modalidadeCodigo,
    modoDisputa: initial.processo.modoDisputa,
    inversaoFasesHabilitada: inverted,
    exigeDeclaracaoNaoFracionamento: true,
  };
  let status = phase,
    homologado = phase === "FECHAMENTO",
    module = "LICITACAO";
  const fields = {
    ...initial.licitacao,
    fundamentoLegalInciso:
      modalidade === "INEXIGIBILIDADE"
        ? "I"
        : initial.licitacao.fundamentoLegalInciso,
    dataHomologacao: homologado ? "2026-09-20" : null,
  };
  const documents = initial.documentos,
    bidders = initial.licitantes,
    proposals = initial.propostas;
  proposals.splice(1);
  proposals[0].valorAtualTotal = 14000;
  bidders.forEach((bidder) => (bidder.statusHabilitacao = "HABILITADO"));
  const resources = Array.from({ length: appeals }, (_, i) => ({
    id: 9900 + i,
    licitanteId: bidders[0].id,
    licitanteNome: bidders[0].razaoSocial,
    dataInterposicao: "2026-09-16",
    dataJulgamento: null,
    resultado: "PENDENTE",
    descricao: `Recurso de teste ${i + 1}: revisão da classificação.`,
    decisao: null,
  }));
  const history = [...initial.historico];
  let justification = manual
    ? "Processo legado conferido para testes de interface."
    : null;
  const flow = () =>
    evaluateLicitacaoFlow(
      {
        context,
        publicado: true,
        homologado,
        status,
        fields,
        documents,
        exceptions: [],
        bidders,
        proposals,
        itemIds: [90001],
        pendingAppeals: resources.filter(
          (item) => item.resultado === "PENDENTE",
        ).length,
      },
      enforcement,
    );
  const previousPhases = flow()
    .phases.slice(
      0,
      flow().phases.findIndex((item) => item.key === phase),
    )
    .map((item) => item.key);
  for (const item of flow().evidence) {
    if (
      ["DOCUMENT_UPLOAD", "PARSER"].includes(item.source) &&
      previousPhases.includes(item.phase) &&
      !documents.some((doc) => doc.categoria === item.category)
    )
      base.upload({ category: item.category, title: item.label });
  }
  const detail = () => ({
    ...base.detail(),
    processo: {
      ...initial.processo,
      modalidadeCodigo: context.modalidadeCodigo,
      modalidade: modalidade ?? initial.processo.modalidade,
      homologado,
      foraDoFluxo: manual,
      justificativaAuditoria: justification,
    },
    licitacao: { ...fields, statusLicitacao: status },
    flow: flow(),
    recursos: resources,
    historico: history,
  });
  const gate = () => ({
    processoId: 2567,
    moduloAtual: module,
    moduloDestino: "CONTRATOS",
    expectedTarget: "CONTRATOS",
    blockers: [
      ...flow().phases.flatMap((item) => item.pending),
      ...gateBlockers,
    ],
    canAdvance:
      flow().phases.every((item) => !item.pending.length) &&
      !gateBlockers.length,
  });
  const mutations = [];
  return {
    detail,
    mutations,
    upload: base.upload,
    preview: base.preview,
    applyPreview: base.applyPreview,
    gate,
    query(name) {
      if (name === "licitacao.detail") return detail();
      if (name === "processos.macroPhaseGate") return gate();
      if (name === "auditoria.list")
        return {
          items: manual
            ? [
                {
                  id: 9851,
                  criadoEm: new Date("2026-09-18T15:00:00Z"),
                  usuarioNome: "Usuário de teste",
                  acao: "UPDATE",
                  tabela: "licitacoes",
                  descricao: "Data de homologação conferida",
                  dadosAnteriores: { campo: "dataHomologacao", valor: null },
                  dadosNovos: { campo: "dataHomologacao", valor: "2026-09-20" },
                },
              ]
            : [],
          total: manual ? 1 : 0,
          page: 1,
          pageSize: 25,
          totalPages: 1,
        };
      return base.query(name);
    },
    mutate(name, input) {
      mutations.push({ name, input });
      if (name === "licitacao.saveRecurso") {
        if (input.recursoId)
          Object.assign(
            resources.find((item) => item.id === input.recursoId),
            input,
          );
        else
          resources.push({
            id: 10000 + resources.length,
            licitanteNome: bidders[0].razaoSocial,
            ...input,
          });
      } else if (name === "licitacao.advanceStage") {
        const phases = flow().phases;
        const targetIndex = phases.findIndex(
          (item) => item.key === input.statusLicitacao,
        );
        if (
          enforcement === "BLOCKING" &&
          phases.slice(0, targetIndex).some((item) => item.pending.length)
        )
          throw new Error("Previous phases still block advancement");
        status = input.statusLicitacao;
      } else if (name === "licitacao.homologar") {
        if (!flow().actions.homologar.allowed)
          throw new Error("Homologation blocked");
        homologado = true;
        Object.assign(fields, input);
      } else if (name === "processos.advanceMacroPhase") {
        if (!gate().canAdvance && !input.permitirBypass)
          throw new Error("Contracts gate blocked");
        module = "CONTRATOS";
      } else if (name === "licitacao.saveJustificativaAuditoria")
        justification = input.justificativa;
      else throw new Error(`Unexpected mutation: ${name}`);
      history.unshift({
        id: 11000 + mutations.length,
        descricao: "Registro de teste atualizado",
        observacao: null,
        criadoEm: new Date("2026-09-20T12:00:00Z"),
      });
      return { success: true };
    },
  };
}
