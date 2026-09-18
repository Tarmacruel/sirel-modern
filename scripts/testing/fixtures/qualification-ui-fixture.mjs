import { createDisputeFixture } from "./dispute-ui-fixture.mjs";

// Reuse the actual flow evaluator; all changes are confined to these synthetic arrays.
export function createQualificationFixture({
  inverted = false,
  empty = false,
  many = false,
  direct = false,
  enforcement = "BLOCKING",
} = {}) {
  const base = createDisputeFixture({
    populated: true,
    inverted,
    direct,
    enforcement,
  });
  const initial = base.detail();
  const documents = initial.documentos;
  const bidders = initial.licitantes;
  const proposals = initial.propostas;
  for (let index = documents.length - 1; index >= 0; index--) {
    if (documents[index].categoria === "LICITACAO_HABILITACAO_EMPRESAS")
      documents.splice(index, 1);
  }
  bidders[0].statusHabilitacao = "PENDENTE";
  bidders[0].observacaoHabilitacao = "Aguardando certidão atualizada.";
  proposals.splice(1);
  for (let index = 1; index < (many ? 17 : 3); index++) {
    bidders.push({
      ...bidders[0],
      id: 8601 + index,
      fornecedorId: 9601 + index,
      razaoSocial:
        index === 1
          ? "Comercial Horizonte Ltda."
          : index === 2
            ? "Serviços Aurora Ltda."
            : `Fornecedor ${index + 1} Ltda.`,
      statusHabilitacao:
        index === 1 ? "HABILITADO" : index === 2 ? "INABILITADO" : "PENDENTE",
      observacaoHabilitacao:
        index === 1
          ? "Documentação conferida."
          : index === 2
            ? "Documentação incompleta."
            : null,
    });
  }
  if (empty) {
    bidders.splice(0);
    proposals.splice(0);
  }
  const flow = base.detail().flow;
  const qualificationIndex = flow.phases.findIndex(
    (phase) => phase.key === "HABILITACAO",
  );
  const previousPhases = flow.phases
    .slice(0, qualificationIndex)
    .map((phase) => phase.key);
  for (const item of flow.evidence) {
    if (
      ["DOCUMENT_UPLOAD", "PARSER"].includes(item.source) &&
      previousPhases.includes(item.phase) &&
      !documents.some((doc) => doc.categoria === item.category)
    )
      base.upload({ category: item.category, title: item.label });
  }
  base.mutate("licitacao.advanceStage", { statusLicitacao: "HABILITACAO" });
  base.mutations.splice(0);
  const originalMutate = base.mutate;
  base.mutate = (name, input) => {
    if (name === "licitacao.saveHabilitacao") {
      base.mutations.push({ name, input });
      Object.assign(
        bidders.find((item) => item.id === input.licitanteId),
        input,
      );
      return { success: true };
    }
    if (
      name === "licitacao.advanceStage" &&
      base.detail().flow.phases.find((phase) => phase.key === "HABILITACAO")
        .pending.length &&
      enforcement === "BLOCKING"
    )
      throw new Error("Qualification still blocks advancement");
    const result = originalMutate(name, input);
    if (name === "licitacao.saveLicitante") {
      result.statusHabilitacao = "PENDENTE";
      result.observacaoHabilitacao = null;
    }
    return result;
  };
  return base;
}
