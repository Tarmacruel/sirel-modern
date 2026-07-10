import {
  getDefaultLicitacaoFlowEnforcement,
  resolveLicitacaoFlowEnforcement,
  type LicitacaoFlowEnforcement,
} from "@sirel/shared/licitacao-guided-flow";

export function getLicitacaoFlowEnforcement(): LicitacaoFlowEnforcement {
  return resolveLicitacaoFlowEnforcement(
    process.env["LICITACAO.FLUXO.ENFORCEMENT"] ??
      process.env.LICITACAO_FLUXO_ENFORCEMENT ??
      getDefaultLicitacaoFlowEnforcement(),
  );
}

export function isLicitacaoFlowBlocking() {
  return getLicitacaoFlowEnforcement() === "BLOCKING";
}
