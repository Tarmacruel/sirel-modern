import { workflowMacroPhaseLabels } from "@sirel/shared/const";

export type MacroModuleKey = keyof typeof workflowMacroPhaseLabels;
export type MacroModuleStatus = "done" | "current" | "upcoming";

export const macroPhaseDefinitions: Array<{
  key: MacroModuleKey;
  label: string;
  description: string;
}> = [
  {
    key: "PLANEJAMENTO",
    label: workflowMacroPhaseLabels.PLANEJAMENTO,
    description: "DFD, ETP, cotacoes preliminares e TR externo.",
  },
  {
    key: "COMPRAS",
    label: workflowMacroPhaseLabels.COMPRAS,
    description: "Consolidacao final de precos, mapa comparativo e preparo para a Licitacao.",
  },
  {
    key: "LICITACAO",
    label: workflowMacroPhaseLabels.LICITACAO,
    description: "Preparacao interna, publicacao, sessao publica e homologacao.",
  },
  {
    key: "CONTRATOS",
    label: workflowMacroPhaseLabels.CONTRATOS,
    description: "Formalizacao, vigencia, saldo e acompanhamento contratual.",
  },
];

const macroOrder: MacroModuleKey[] = macroPhaseDefinitions.map((item) => item.key);

export function deriveMacroPhaseStatuses(currentModulo?: string | null): Record<MacroModuleKey, MacroModuleStatus> {
  const currentIndex = macroOrder.indexOf((currentModulo as MacroModuleKey | undefined) ?? "PLANEJAMENTO");
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;

  return macroOrder.reduce((acc, key, index) => {
    acc[key] = index < safeIndex ? "done" : index === safeIndex ? "current" : "upcoming";
    return acc;
  }, {} as Record<MacroModuleKey, MacroModuleStatus>);
}

export function getNextMacroModule(currentModulo?: string | null): MacroModuleKey | null {
  const currentIndex = macroOrder.indexOf((currentModulo as MacroModuleKey | undefined) ?? "PLANEJAMENTO");
  if (currentIndex === -1) return null;
  return macroOrder[currentIndex + 1] ?? null;
}
