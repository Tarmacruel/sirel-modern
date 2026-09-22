import { z } from "zod";

export const resultadosItem = [
  "FRACASSADO",
  "DESERTO",
  "REVOGADO",
  "ANULADO",
] as const;
export const situacoesProcedimento = [...resultadosItem, "SUSPENSO"] as const;
export const situacaoLabels: Record<string, string> = {
  EM_ANDAMENTO: "Em andamento",
  FRACASSADO: "Fracassado",
  DESERTO: "Deserto",
  REVOGADO: "Revogado",
  ANULADO: "Anulado",
  SUSPENSO: "Suspenso",
  CANCELADO_LEGADO: "Cancelado (registro anterior)",
};
export interface DecisaoLicitacao {
  situacao: string;
  data: string;
  justificativa: string;
  documentoId?: number | null;
  usuarioId?: number;
  anterior?: {
    statusId: number | null;
    dataEncerramento: string | null;
    fase: string;
    workflow: any;
  };
}
export function situacaoAtual(decisao: unknown, fase?: string): string {
  const value = (decisao as DecisaoLicitacao | null)?.situacao;
  return (
    value ??
    (fase === "FRACASSADA"
      ? "FRACASSADO"
      : fase === "CANCELADA"
        ? "CANCELADO_LEGADO"
        : "EM_ANDAMENTO")
  );
}
export function resultadoAtual(item: {
  resultadoLicitacao?: string | null;
  itemFracassado?: boolean;
  itemDeserto?: boolean;
}) {
  return (
    item.resultadoLicitacao ??
    (item.itemFracassado ? "FRACASSADO" : item.itemDeserto ? "DESERTO" : null)
  );
}
const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Informe uma data válida.");
export const decisaoInput = z.object({
  processoId: z.number().int().positive(),
  data: dataSchema,
  justificativa: z.string().trim().min(3, "Informe a justificativa.").max(4000),
  documentoId: z.number().int().positive().nullish(),
});
export const situacaoProcessoInput = decisaoInput.extend({
  situacao: z.enum(situacoesProcedimento),
});
export const resultadoItensInput = decisaoInput.extend({
  itemIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length),
  resultado: z.enum(resultadosItem),
});
export const reabrirItensInput = decisaoInput.extend({
  itemIds: z.array(z.number().int().positive()).min(1).max(1000),
});

export function validarResultado(
  resultado: string,
  propostas: { situacao: string; classificacao?: number | null }[],
  homologado = false,
) {
  if (
    homologado ||
    propostas.some(
      (p) =>
        p.situacao === "VENCEDORA" ||
        (p.classificacao === 1 &&
          !["DESCLASSIFICADA", "INABILITADA"].includes(p.situacao)),
    )
  )
    return "O item já possui vencedor ou homologação. Revise o resultado antes de encerrá-lo.";
  if (resultado === "DESERTO" && propostas.length)
    return "O item possui propostas e não pode ser declarado deserto.";
  if (
    resultado === "FRACASSADO" &&
    (!propostas.length ||
      propostas.some(
        (p) => !["DESCLASSIFICADA", "INABILITADA"].includes(p.situacao),
      ))
  )
    return "Para declarar fracasso, registre a desclassificação ou inabilitação de todas as propostas do item.";
  return null;
}
