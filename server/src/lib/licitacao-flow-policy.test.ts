import { afterEach, describe, expect, it } from "vitest";

import {
  getLicitacaoFlowEnforcement,
  isLicitacaoFlowBlocking,
} from "./licitacao-flow-policy.js";

const originalDotEnv = process.env["LICITACAO.FLUXO.ENFORCEMENT"];
const originalUnderscoreEnv = process.env.LICITACAO_FLUXO_ENFORCEMENT;

afterEach(() => {
  if (originalDotEnv === undefined) {
    delete process.env["LICITACAO.FLUXO.ENFORCEMENT"];
  } else {
    process.env["LICITACAO.FLUXO.ENFORCEMENT"] = originalDotEnv;
  }

  if (originalUnderscoreEnv === undefined) {
    delete process.env.LICITACAO_FLUXO_ENFORCEMENT;
  } else {
    process.env.LICITACAO_FLUXO_ENFORCEMENT = originalUnderscoreEnv;
  }
});

describe("licitacao-flow-policy", () => {
  it("usa ADVISORY como padrao", () => {
    delete process.env["LICITACAO.FLUXO.ENFORCEMENT"];
    delete process.env.LICITACAO_FLUXO_ENFORCEMENT;

    expect(getLicitacaoFlowEnforcement()).toBe("ADVISORY");
    expect(isLicitacaoFlowBlocking()).toBe(false);
  });

  it("permite alternar para BLOCKING por ambiente", () => {
    process.env.LICITACAO_FLUXO_ENFORCEMENT = "BLOCKING";

    expect(getLicitacaoFlowEnforcement()).toBe("BLOCKING");
    expect(isLicitacaoFlowBlocking()).toBe(true);
  });
});
