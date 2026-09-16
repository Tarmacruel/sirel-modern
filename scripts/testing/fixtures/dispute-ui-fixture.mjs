import { evaluateLicitacaoFlow } from "../../../server/src/lib/licitacao-flow-state.ts";
import { createPublicationFixture } from "./publication-ui-fixture.mjs";

/** Synthetic data. All browser writes stay in this fixture. */
export function createDisputeFixture({
  populated = false,
  inverted = false,
  noBids = false,
  direct = false,
  enforcement = "BLOCKING",
} = {}) {
  const modalidade = noBids ? "CONCORRENCIA" : "DISPENSA_SIMPLIFICADA";
  const base = createPublicationFixture({
    manual: false,
    modalidade,
    inverted,
  });
  const initial = base.detail();
  const context = {
    modalidadeCodigo: modalidade,
    modoDisputa: noBids || direct ? "NAO_SE_APLICA" : "ABERTO",
    inversaoFasesHabilitada: inverted,
    exigeDeclaracaoNaoFracionamento: true,
  };
  const fields = {
    ...initial.licitacao,
    linkPncpPublico: "https://pncp.gov.br/fixture",
    linkBllPublico: "https://bllcompras.com/fixture",
    dataPublicacaoEdital: "2026-09-08T12:00:00",
    dataAberturaPropostas: "2026-09-15T14:00:00",
  };
  let status = direct ? "JULGAMENTO" : "LANCES";
  const documents = initial.documentos;
  const bidders = [],
    proposals = [],
    bids = [],
    mutations = [];
  const supplier = {
    id: 9601,
    label: "Fornecedor de teste Ltda.",
    metadata: { cnpj: "00.000.000/0001-00" },
  };
  const flow = () =>
    evaluateLicitacaoFlow(
      {
        context,
        publicado: true,
        homologado: false,
        status,
        fields,
        documents,
        exceptions: [],
        bidders,
        proposals,
        itemIds: [90001],
        pendingAppeals: 0,
      },
      enforcement,
    );
  function addBidder() {
    const bidder = {
      id: 8601 + bidders.length,
      fornecedorId: supplier.id,
      razaoSocial: supplier.label,
      cnpj: supplier.metadata.cnpj,
      ativo: true,
      statusHabilitacao: inverted ? "HABILITADO" : "PENDENTE",
      dataCadastro: new Date("2026-09-14T12:00:00Z"),
    };
    bidders.push(bidder);
    return bidder;
  }
  function addProposal(input = {}) {
    const proposal = {
      id: 8701 + proposals.length,
      itemId: 90001,
      itemNumero: 1,
      itemDescricao: "Materiais de manutenção predial",
      licitanteId: bidders[0]?.id,
      licitanteNome: supplier.label,
      fornecedorId: supplier.id,
      valorUnitarioProposto: "1450.00",
      valorAtualUnitario: "1400.00",
      classificacao: 1,
      situacao: "VALIDA",
      dataProposta: new Date("2026-09-14T12:00:00Z"),
      ...input,
    };
    proposals.push(proposal);
    return proposal;
  }
  function addBid(input = {}) {
    const bid = {
      id: 8801 + bids.length,
      propostaId: proposals[0]?.id,
      valorLance: "1400.00",
      dataLance: new Date("2026-09-15T14:00:00Z"),
      usuarioNome: "Usuário de validação",
      observacao: "Oferta de teste",
      ...input,
    };
    bids.push(bid);
    return bid;
  }
  if (populated || inverted) {
    addBidder();
    for (let index = 0; index < (populated ? 17 : 1); index++) {
      addProposal();
      addBid();
    }
  }
  for (const item of flow().evidence) {
    if (
      item.source === "DOCUMENT_UPLOAD" &&
      (["PREPARACAO", "PUBLICACAO"].includes(item.phase) ||
        (inverted && item.phase === "HABILITACAO"))
    ) {
      if (!documents.some((document) => document.categoria === item.category))
        base.upload({ category: item.category, title: item.label });
    }
  }
  function detail() {
    return {
      ...initial,
      processo: {
        ...initial.processo,
        modalidade: noBids ? "Concorrência" : "Dispensa Simplificada",
        publicado: true,
        modoDisputa: context.modoDisputa,
        suportaLances: !noBids && !direct,
        numeroEdital: "001/2026",
      },
      licitacao: { ...fields, statusLicitacao: status },
      documentos: documents,
      licitantes: bidders,
      propostas: proposals,
      lances: bids,
      flowEnforcement: enforcement,
      flow: flow(),
      resumo: {
        ...initial.resumo,
        totalLicitantes: bidders.length,
        totalPropostas: proposals.length,
        totalLances: bids.length,
      },
    };
  }
  function mutate(name, input) {
    mutations.push({ name, input });
    switch (name) {
      case "licitacao.saveLicitante":
        return addBidder();
      case "licitacao.deleteLicitante":
        bidders.find((item) => item.id === input.licitanteId).ativo = false;
        return { ok: true };
      case "licitacao.saveProposta":
        return addProposal(input);
      case "licitacao.saveLance":
        return addBid(input);
      case "licitacao.advanceStage": {
        if (
          input.statusLicitacao === "JULGAMENTO" &&
          enforcement === "BLOCKING" &&
          flow().phases.find((item) => item.key === "DISPUTA")?.pending.length
        )
          throw new Error("Dispute evidence still blocks advancement");
        status = input.statusLicitacao;
        return { ok: true };
      }
      default:
        throw new Error(`Unexpected mutation: ${name}`);
    }
  }
  return {
    detail,
    mutations,
    mutate,
    upload: base.upload,
    query(name) {
      if (name === "licitacao.detail") return detail();
      if (name === "documentos.listByProcesso") return documents;
      if (name === "cadastros.lookup") return { items: [supplier], total: 1 };
      return base.query(name);
    },
    preview(documentId) {
      mutations.push({
        name: "ata.preview",
        input: { documentoId: documentId },
      });
      return {
        runId: 9801,
        processId: 2567,
        documentId,
        generatedAt: "2026-09-15T12:00:00Z",
        process: {
          id: 2567,
          numeroSirel: "0140/2026",
          objeto: initial.processo.objeto,
        },
        extractedMetadata: {},
        phase: { current: status, suggested: null, willAdvance: false },
        counts: {
          fornecedoresCriar: 0,
          licitantesCriar: 0,
          lotesCriar: 0,
          propostasCriar: 0,
          propostasAtualizar: 0,
          lancesCriar: 0,
          recursosCriar: 0,
          resultadosAtualizar: 0,
          conflitosBloqueantes: 0,
        },
        warnings: [],
        blockingIssues: [],
        lots: [],
        artifacts: [],
      };
    },
    applyPreview(runId) {
      mutations.push({ name: "ata.apply", input: { runId } });
      return { success: true, runId, processId: 2567 };
    },
  };
}
