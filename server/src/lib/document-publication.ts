export type DocumentoPublicacaoStatus =
  | "RASCUNHO"
  | "EM_REVISAO"
  | "APROVADO"
  | "REJEITADO"
  | "RETIRADO";

/**
 * A capacidade pública precisa ser revogada pelo banco, inclusive para links
 * já emitidos. Perfis restritos tornam o documento inelegível por definição.
 */
export function documentoEstaPublicamenteDisponivel(documento: {
  publico: boolean | null | undefined;
  statusPublicacao: DocumentoPublicacaoStatus | string | null | undefined;
  restritoA: unknown;
}) {
  const semRestricao =
    documento.restritoA == null ||
    (Array.isArray(documento.restritoA) && documento.restritoA.length === 0);

  return (
    documento.publico === true &&
    documento.statusPublicacao === "APROVADO" &&
    semRestricao
  );
}

export function normalizeDocumentoAccessRoles(values: readonly string[] | null | undefined) {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );
}
