import { describe, expect, it } from "vitest";

import { calcularPrazoLegalMinimo } from "@sirel/shared/prazos-legais";

function formatDateBR(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

describe("calcularPrazoLegalMinimo", () => {
  it("aplica 8 dias uteis para pregao eletronico de bens a partir do primeiro dia util seguinte", () => {
    const resultado = calcularPrazoLegalMinimo({
      dataPublicacaoPNCP: new Date("2026-03-27T12:00:00"),
      modalidadeCodigo: "PREGAO_ELETRONICO",
      tipoObjeto: "PRODUTO",
      acrescimoMunicipal: 0,
    });

    expect(resultado.diasUteisTotais).toBe(8);
    expect(formatDateBR(resultado.dataInicioContagem)).toBe("30/03/2026");
    expect(formatDateBR(resultado.dataMinima)).toBe("08/04/2026");
  });

  it("usa 35 dias uteis para concorrencia por tecnica e preco", () => {
    const resultado = calcularPrazoLegalMinimo({
      dataPublicacaoPNCP: new Date("2026-03-26T12:00:00"),
      modalidadeCodigo: "CONCORRENCIA_ELETRONICA",
      criterioJulgamento: "TECNICA_PRECO",
      acrescimoMunicipal: 0,
    });

    expect(resultado.diasUteisTotais).toBe(35);
    expect(resultado.regraAplicada.modalidade).toBe(
      "CONCORRENCIA_TECNICA_PRECO",
    );
  });

  it("usa 1 dia util para dispensa simplificada", () => {
    const resultado = calcularPrazoLegalMinimo({
      dataPublicacaoPNCP: new Date("2026-03-26T12:00:00"),
      modalidadeCodigo: "DISPENSA_SIMPLIFICADA",
      acrescimoMunicipal: 0,
    });

    expect(resultado.diasUteisTotais).toBe(1);
    expect(formatDateBR(resultado.dataMinima)).toBe("27/03/2026");
  });

  it("permite mesma data em inexigibilidade", () => {
    const publicacao = new Date("2026-03-26T12:00:00");
    const resultado = calcularPrazoLegalMinimo({
      dataPublicacaoPNCP: publicacao,
      modalidadeCodigo: "INEXIGIBILIDADE",
      acrescimoMunicipal: 0,
    });

    expect(resultado.diasUteisTotais).toBe(0);
    expect(formatDateBR(resultado.dataMinima)).toBe("26/03/2026");
  });

  it("respeita a contagem do art. 183 na dispensa eletronica", () => {
    const resultado = calcularPrazoLegalMinimo({
      dataPublicacaoPNCP: new Date("2026-03-26T12:00:00"),
      modalidadeCodigo: "DISPENSA_ELETRONICA",
      acrescimoMunicipal: 0,
    });

    expect(resultado.diasUteisTotais).toBe(3);
    expect(formatDateBR(resultado.dataMinima)).toBe("31/03/2026");
  });

  it("considera feriado local na contagem do prazo legal", () => {
    const resultado = calcularPrazoLegalMinimo({
      dataPublicacaoPNCP: new Date("2026-03-26T12:00:00"),
      modalidadeCodigo: "DISPENSA_ELETRONICA",
      acrescimoMunicipal: 0,
      feriadosLocais: [new Date("2026-03-30T12:00:00")],
    });

    expect(formatDateBR(resultado.dataMinima)).toBe("01/04/2026");
  });

  it("distingue servico comum em concorrencia quando o cadastro explicita a classificacao", () => {
    const resultado = calcularPrazoLegalMinimo({
      dataPublicacaoPNCP: new Date("2026-03-26T12:00:00"),
      modalidadeCodigo: "CONCORRENCIA_ELETRONICA",
      tipoObjeto: "SERVICO_COMUM",
      criterioJulgamento: "MENOR_PRECO",
      acrescimoMunicipal: 0,
    });

    expect(resultado.regraAplicada.tipoObjeto).toBe("SERVICOS_COMUNS");
    expect(resultado.diasUteisTotais).toBe(10);
  });

  it("distingue servico especial em concorrencia com prazo ampliado", () => {
    const resultado = calcularPrazoLegalMinimo({
      dataPublicacaoPNCP: new Date("2026-03-26T12:00:00"),
      modalidadeCodigo: "CONCORRENCIA_ELETRONICA",
      tipoObjeto: "SERVICO_ESPECIAL",
      criterioJulgamento: "MENOR_PRECO",
      acrescimoMunicipal: 0,
    });

    expect(resultado.regraAplicada.tipoObjeto).toBe("SERVICOS_ESPECIAIS");
    expect(resultado.diasUteisTotais).toBe(25);
  });
});
