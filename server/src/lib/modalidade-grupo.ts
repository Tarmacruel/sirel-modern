import { ilike, isNull, not, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

type ModalidadeGrupo =
  | "PREGAO"
  | "CONCORRENCIA"
  | "DISPENSA"
  | "INEXIGIBILIDADE"
  | "CREDENCIAMENTO"
  | "LEILAO"
  | "OUTROS";

const modalidadeGrupoPatterns: Record<
  Exclude<ModalidadeGrupo, "OUTROS">,
  string[]
> = {
  PREGAO: ["%PREGAO%"],
  CONCORRENCIA: ["%CONCORRENCIA%"],
  DISPENSA: ["%DISPENSA%"],
  INEXIGIBILIDADE: ["%INEXIGIBILIDADE%"],
  CREDENCIAMENTO: ["%CREDENCIAMENTO%"],
  LEILAO: ["%LEILAO%"],
};

function buildKnownModalidadeCondition(column: AnyPgColumn): SQL<unknown> {
  return or(
    ...Object.values(modalidadeGrupoPatterns).flatMap((patterns) =>
      patterns.map((pattern) => ilike(column, pattern)),
    ),
  )!;
}

export function buildModalidadeGrupoFilter(
  column: AnyPgColumn,
  modalidadeGrupo?: ModalidadeGrupo,
) {
  if (!modalidadeGrupo) return undefined;

  if (modalidadeGrupo === "OUTROS") {
    return or(isNull(column), not(buildKnownModalidadeCondition(column)));
  }

  return or(
    ...modalidadeGrupoPatterns[modalidadeGrupo].map((pattern) =>
      ilike(column, pattern),
    ),
  );
}
