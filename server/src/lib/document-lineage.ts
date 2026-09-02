export type DocumentoComLinhagem = {
  id: number;
  documentoRaizId?: number | null;
};

export type DocumentoComVersao = {
  versao: number;
};

/**
 * Registros legados não possuem raiz explícita: nesse caso, o próprio
 * documento é a raiz da sua linhagem.
 */
export function resolveDocumentoRaizId({
  id,
  documentoRaizId,
}: DocumentoComLinhagem) {
  return documentoRaizId ?? id;
}

/**
 * A versão é local à linhagem, não ao processo. A lista pode chegar sem
 * ordenação, por isso o próximo valor deriva sempre do maior existente.
 */
export function nextDocumentoVersao(rows: readonly DocumentoComVersao[]) {
  return (
    rows.reduce((highestVersion, row) => {
      const version = Number(row.versao);
      return Number.isSafeInteger(version) && version > highestVersion
        ? version
        : highestVersion;
    }, 0) + 1
  );
}

/** Retorna verdadeiro somente quando a versão candidata é estritamente nova. */
export function isDocumentoVersaoPosterior(
  candidate: DocumentoComVersao,
  reference: DocumentoComVersao,
) {
  return candidate.versao > reference.versao;
}
