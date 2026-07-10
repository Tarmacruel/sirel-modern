import { describe, expect, it } from "vitest";

import {
  getLicitacaoDocumentRequirements,
  getLicitacaoGuidedPhaseSequence,
  getLicitacaoRequirementsByPhase,
  resolveLicitacaoFlowEnforcement,
} from "@sirel/shared/licitacao-guided-flow";

function categoriesForPhase(
  phase: string,
  params: Parameters<typeof getLicitacaoDocumentRequirements>[0],
) {
  return getLicitacaoDocumentRequirements(params)
    .filter((item) => item.phase === phase)
    .map((item) => item.category);
}

describe("licitacao guided flow catalog", () => {
  it("ordena requisitos pelo order numerico", () => {
    const requirements = getLicitacaoDocumentRequirements({
      modalidadeCodigo: "PREGAO_ELETRONICO",
      modoDisputa: "ABERTO",
      publicarNoDou: true,
      publicarEmJornal: true,
    });

    expect(requirements.map((item) => item.order)).toEqual(
      [...requirements].map((item) => item.order).sort((a, b) => a - b),
    );
  });

  it("modela todos os documentos por fase e ordem explicitas", () => {
    const context = {
      modalidadeCodigo: "PREGAO_ELETRONICO",
      modoDisputa: "ABERTO",
    };
    const requirements = getLicitacaoDocumentRequirements(context);
    const groupedRequirements = Array.from(
      getLicitacaoRequirementsByPhase(context).values(),
    ).flat();

    expect(groupedRequirements).toHaveLength(requirements.length);
    requirements.forEach((item) => {
      expect(item.phase).toBeTruthy();
      expect(Number.isFinite(item.order)).toBe(true);
    });
  });

  it("mantem Disputa apenas com documentos da sessao", () => {
    const disputa = categoriesForPhase("DISPUTA", {
      modalidadeCodigo: "PREGAO_ELETRONICO",
      modoDisputa: "ABERTO",
    });

    expect(disputa).toContain("LICITACAO_ATA_SESSAO_PROVISORIA");
    expect(disputa).not.toContain("LICITACAO_HABILITACAO_EMPRESAS");
    expect(disputa).not.toContain("LICITACAO_RECURSOS");
    expect(disputa).not.toContain("LICITACAO_COMUNICACAO_CONTROLADORIA");
    expect(disputa).not.toContain("LICITACAO_ATA_HOMOLOGACAO");
  });

  it("diferencia publicacao de dispensa e competitivas", () => {
    const dispensa = categoriesForPhase("PUBLICACAO", {
      modalidadeCodigo: "DISPENSA_ELETRONICA",
      modoDisputa: "ABERTO",
    });
    const pregao = categoriesForPhase("PUBLICACAO", {
      modalidadeCodigo: "PREGAO_ELETRONICO",
      modoDisputa: "ABERTO",
      publicarNoDou: true,
      publicarEmJornal: true,
    });

    expect(dispensa).toContain("LICITACAO_AVISO_CONTRATACAO_DIRETA");
    expect(dispensa).not.toContain("LICITACAO_EDITAL");
    expect(pregao).toContain("LICITACAO_EDITAL");
    expect(pregao).toContain("LICITACAO_PUBLICACAO_DOU");
    expect(pregao).toContain("LICITACAO_PUBLICACAO_JORNAL");
  });

  it("inicia a preparacao por selecoes do catalogo institucional", () => {
    const preparacao = getLicitacaoDocumentRequirements({
      modalidadeCodigo: "DISPENSA_ELETRONICA",
      modoDisputa: "ABERTO",
    }).filter((item) => item.phase === "PREPARACAO");

    expect(preparacao.slice(0, 3).map((item) => item.category)).toEqual([
      "LICITACAO_DECRETO_COMISSAO",
      "LICITACAO_DECRETO_EQUIPE_APOIO",
      "LICITACAO_DECRETO_ORDENADOR_DESPESAS",
    ]);
    preparacao.slice(0, 3).forEach((item) => {
      expect(item.source).toBe("CATALOG");
      expect(item.completionStrategy).toBe("CATALOG_SELECTION");
      expect(item.editor).toBe("INSTITUTIONAL_SELECTOR");
    });
  });

  it("exige fundamento centralizado para inexigibilidade", () => {
    const inexigibilidade = categoriesForPhase("PUBLICACAO", {
      modalidadeCodigo: "INEXIGIBILIDADE",
    });

    expect(inexigibilidade[0]).toBe("LICITACAO_FUNDAMENTO_INEXIGIBILIDADE");
  });

  it("separa habilitacao, recursos, controle interno e homologacao", () => {
    const requirements = getLicitacaoDocumentRequirements({
      modalidadeCodigo: "PREGAO_ELETRONICO",
      modoDisputa: "ABERTO",
    });
    const phaseByCategory = Object.fromEntries(
      requirements.map((item) => [item.category, item.phase]),
    );

    expect(phaseByCategory.LICITACAO_HABILITACAO_EMPRESAS).toBe(
      "HABILITACAO",
    );
    expect(phaseByCategory.LICITACAO_RECURSOS).toBe("RECURSOS");
    expect(phaseByCategory.LICITACAO_COMUNICACAO_CONTROLADORIA).toBe(
      "CONTROLE_INTERNO",
    );
    expect(phaseByCategory.LICITACAO_ATA_HOMOLOGACAO).toBe("HOMOLOGACAO");
  });

  it("mantem politica advisory como padrao e blocking testavel", () => {
    expect(resolveLicitacaoFlowEnforcement(undefined)).toBe("ADVISORY");
    expect(resolveLicitacaoFlowEnforcement("BLOCKING")).toBe("BLOCKING");
  });

  it("mantem a sequencia com controle interno antes de homologacao", () => {
    expect(
      getLicitacaoGuidedPhaseSequence({
        modalidadeCodigo: "DISPENSA_ELETRONICA",
        modoDisputa: "ABERTO",
      }).map((item) => item.key),
    ).toEqual([
      "PREPARACAO",
      "PUBLICACAO",
      "DISPUTA",
      "JULGAMENTO",
      "HABILITACAO",
      "RECURSOS",
      "CONTROLE_INTERNO",
      "HOMOLOGACAO",
      "FECHAMENTO",
    ]);
  });
});
