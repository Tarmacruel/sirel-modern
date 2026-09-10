import { evaluateLicitacaoFlow } from "../../../server/src/lib/licitacao-flow-state.ts";

/** Synthetic data only. The ID mirrors the reported route, never a live record. */
export function createPreparationFixture() {
  const context = {
    modalidadeCodigo: "DISPENSA_SIMPLIFICADA",
    modoDisputa: "NAO_SE_APLICA",
    exigeDeclaracaoNaoFracionamento: true,
  };
  const documents = [{
    id: 91001, processoId: 2567, categoria: "LICITACAO_RESERVA_ORCAMENTARIA",
    titulo: "Reserva orçamentária", descricao: "Documento fictício para validação da interface.",
    tipo: "OUTRO", versao: 1, arquivoUrl: "/api/planejamento/documentos/91001/download",
    criadoEm: new Date("2026-09-08T14:00:00Z"),
  }];
  const designation = (id, nome) => ({ id, nome, vigenciaInicio: "2026-01-01", vigenciaFim: "2026-12-31", ato: { label: "Decreto municipal 001/2026" }, membros: [], secretarias: [] });
  const designations = {
    comissao: designation(901, "Comissão de contratação"),
    equipeApoio: designation(902, "Equipe de apoio"),
    ordenadorDespesa: designation(903, "Responsável pela ordenação de despesas"),
    condutorSugerido: null,
  };
  const user = {
    id: 990001, username: "ui.validation", name: "Usuário de validação", role: "admin",
    email: null, secretariaId: null, subsystemAccess: [], availableSubsystems: [],
    defaultSubsystemKey: "SIREL", requiresIdentityCompletion: false,
    identityProfile: { pessoaId: 990001, complete: true, missingFields: [], cpfMasked: null, matriculaMasked: null, dataNascimentoPresent: true },
    identityCompletionMode: "REMINDER",
  };
  function detail() {
    const fields = { comissaoId: 901, equipeApoioId: 902, ordenadorDespesaId: 903, condutorProcessoId: 904 };
    const flow = evaluateLicitacaoFlow({
      context, publicado: false, homologado: false, status: "PREPARACAO", fields,
      documents, exceptions: [], bidders: [], proposals: [], itemIds: [90001], pendingAppeals: 0,
    }, "BLOCKING");
    const items = flow.evidence.filter((item) => item.phase === "PREPARACAO").map((item) => ({
      ...item, documentos: documents.filter((document) => document.categoria === item.category),
      statusFlexivel: "PADRAO", naoAplicavel: false,
    }));
    return {
      processo: {
        id: 2567, numeroSirel: "0140/2026", numeroEdital: null, objeto: "Aquisição de materiais para manutenção das unidades administrativas.",
        secretariaId: 9001, secretaria: "SECRETARIA DE ADMINISTRAÇÃO", modalidadeId: 9001,
        modalidade: "Dispensa Simplificada", modalidadeCodigo: context.modalidadeCodigo,
        modoDisputa: context.modoDisputa, criterioJulgamento: "MENOR_PRECO", tipoObjeto: "COMPRAS",
        valorEstimado: "65435.00", dataEntradaLicitacao: new Date("2026-04-15T12:00:00Z"),
        publicado: false, homologado: false, foraDoFluxo: true, suportaLances: false,
        condutorProcessoId: 904, condutorProcesso: { id: 904, nome: "Responsável de validação", cargo: "Agente de contratação" },
        statusId: 9001,
      },
      licitacao: { id: 9001, processoId: 2567, statusLicitacao: "PREPARACAO", ...fields,
        exigeDeclaracaoNaoFracionamento: true, publicarNoDou: false, publicarEmJornal: false,
        inversaoFasesHabilitada: false,
      },
      workflow: { moduloAtual: "LICITACAO" },
      itens: [{ id: 90001, numeroItem: 1, descricao: "Materiais de manutenção predial", unidade: "LOTE", quantidade: "1", valorUnitarioEstimado: "65435.00", valorTotalEstimado: "65435.00" }],
      licitantes: [], propostas: [], lances: [], recursos: [],
      historico: [{ id: 9901, descricao: "Processo recebido na licitação", observacao: null, criadoEm: new Date("2026-04-15T12:00:00Z") }],
      documentos: documents, checklistInterno: { itens: items, total: items.length, concluidos: items.filter((item) => item.concluido).length, pendentes: items.filter((item) => !item.concluido).length },
      calendarioPublicacao: { canais: [], diasUteisMinimos: 3, dataMinimaAbertura: null },
      flowEnforcement: "BLOCKING", flow,
      transparencia: { status: "READY", message: "Disponível" },
      resumo: { totalItens: 1, totalLicitantes: 0, totalPropostas: 0, totalLances: 0, totalRecursos: 0 },
    };
  }
  function query(name) {
    switch (name) {
      case "auth.me": return { user };
      case "dashboard.entry": return { tour: { version: "ui-validation", shouldAutoStart: false }, actions: [], recentProcesses: [], notices: [] };
      case "dashboard.summary": return {};
      case "notificacoes.summary": return { unread: 0, total: 0 };
      case "licitacao.detail": return detail();
      case "documentos.listByProcesso": return documents;
      case "cadastros.formOptions": return { statusProcesso: [{ id: 9001, nome: "Em preparação" }], pessoas: [], fornecedores: [], secretarias: [], modalidades: [] };
      case "parametros.obterValor": return null;
      case "cadastrosInstitucionais.designacoes.getForLicitacao": return designations;
      case "cadastrosInstitucionais.designacoes.availableForProcess": return { comissoes: [designations.comissao], equipesApoio: [designations.equipeApoio], ordenadores: [designations.ordenadorDespesa] };
      case "auditoria.list": return { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
      case "cadastros.lookup": return { items: [], total: 0 };
      default: throw new Error(`Fixture ausente para ${name}`);
    }
  }
  function upload({ category, title }) {
    const document = { ...documents[0], id: 91000 + documents.length + 1, categoria: category, titulo: title, criadoEm: new Date() };
    document.arquivoUrl = `/api/planejamento/documentos/${document.id}/download`;
    documents.push(document);
    return document;
  }
  return { query, upload, detail };
}
