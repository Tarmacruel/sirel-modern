import { evaluateLicitacaoFlow } from "../../../server/src/lib/licitacao-flow-state.ts";
import { createPreparationFixture } from "./preparation-ui-fixture.mjs";

/** All data and mutations are local to the browser smoke test. */
export function createPublicationFixture({ manual = true, modalidade = "DISPENSA_SIMPLIFICADA", inverted = false } = {}) {
  const base = createPreparationFixture();
  const initial = base.detail();
  const context = {
    modalidadeCodigo: modalidade,
    modoDisputa: "ABERTO",
    exigeDeclaracaoNaoFracionamento: true,
    inversaoFasesHabilitada: inverted,
  };
  const fields = { comissaoId: 901, equipeApoioId: 902, ordenadorDespesaId: 903, condutorProcessoId: 904, fundamentoLegalInciso: modalidade === "INEXIGIBILIDADE" ? "I" : null };
  let published = false;
  const documents = [];
  const mutations = [];
  const snapshot = () => ({ context, publicado: published, homologado: false, status: published ? "PUBLICACAO" : "PREPARACAO", fields, documents, exceptions: [], bidders: [], proposals: [], itemIds: [90001], pendingAppeals: 0 });
  const flow = () => evaluateLicitacaoFlow(snapshot(), "BLOCKING");
  function upload({ category, title }) {
    const document = { ...initial.documentos[0], id: 92000 + documents.length, categoria: category, titulo: title, criadoEm: new Date("2026-09-15T12:00:00Z") };
    document.arquivoUrl = `/api/planejamento/documentos/${document.id}/download`;
    documents.push(document);
    return document;
  }
  for (const item of flow().evidence) {
    if (item.source === "DOCUMENT_UPLOAD" && (item.phase === "PREPARACAO" || item.category === "LICITACAO_CONFIRMACAO_PNCP")) {
      upload({ category: item.category, title: item.label });
    }
  }
  function detail() {
    const currentFlow = flow();
    return {
      ...initial,
      processo: { ...initial.processo, publicado: published, foraDoFluxo: manual, modalidadeCodigo: modalidade, modoDisputa: "ABERTO", suportaLances: true, numeroEdital: published ? "001/2026" : null },
      licitacao: { ...initial.licitacao, ...fields, inversaoFasesHabilitada: inverted, statusLicitacao: published ? "PUBLICACAO" : "PREPARACAO" },
      documentos: documents,
      checklistInterno: { ...initial.checklistInterno, itens: currentFlow.evidence.filter((item) => item.phase === "PREPARACAO").map((item) => ({ ...item, documentos: documents.filter((document) => document.categoria === item.category) })) },
      flow: currentFlow,
    };
  }
  function mutate(name, input) {
    mutations.push({ name, input });
    if (name === "licitacao.saveConfiguracao") {
      Object.assign(fields, input);
      return { ok: true };
    }
    if (name === "licitacao.publish") {
      Object.assign(fields, input);
      const evaluated = flow();
      if (!evaluated.actions.publish.allowed) throw new Error(`Fixture publication blocked: ${evaluated.actions.publish.blockers.map((item) => item.category).join(", ")}`);
      published = true;
      return { numeroEdital: "001/2026" };
    }
    throw new Error(`Unexpected mutation: ${name}`);
  }
  return {
    detail, upload, mutate, mutations,
    query(name) {
      if (name === "licitacao.detail") return detail();
      if (name === "documentos.listByProcesso") return documents;
      if (name === "processos.macroPhaseGate") return { allowed: false, blockers: [] };
      return base.query(name);
    },
  };
}
