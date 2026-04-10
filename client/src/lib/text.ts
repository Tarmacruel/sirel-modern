const latin1MojibakeReplacements: Array<[RegExp, string]> = [
  [/Ã§/g, "c"],
  [/Ã£/g, "a"],
  [/Ã¡/g, "a"],
  [/Ã¢/g, "a"],
  [/Ã /g, "a"],
  [/Ã¤/g, "a"],
  [/Ã©/g, "e"],
  [/Ãª/g, "e"],
  [/Ã¨/g, "e"],
  [/Ã­/g, "i"],
  [/Ã¬/g, "i"],
  [/Ã³/g, "o"],
  [/Ã´/g, "o"],
  [/Ãµ/g, "o"],
  [/Ã²/g, "o"],
  [/Ãº/g, "u"],
  [/Ã¹/g, "u"],
  [/Ã‡/g, "C"],
  [/Ã‰/g, "E"],
  [/ÃŠ/g, "E"],
  [/Ã“/g, "O"],
  [/Ã”/g, "O"],
  [/Ãš/g, "U"],
  [/Ã�/g, "A"],
];

const replacementCharFixes: Array<[RegExp, string]> = [
  [/Configura\uFFFD+o/gi, "Configuracao"],
  [/Licita\uFFFD+o/gi, "Licitacao"],
  [/Publica\uFFFD+o/gi, "Publicacao"],
  [/Descri\uFFFD+o/gi, "Descricao"],
  [/situa\uFFFD+o/gi, "situacao"],
  [/Situa\uFFFD+o/gi, "Situacao"],
  [/habilita\uFFFD+o/gi, "habilitacao"],
  [/Habilita\uFFFD+o/gi, "Habilitacao"],
  [/homologa\uFFFD+o/gi, "homologacao"],
  [/Homologa\uFFFD+o/gi, "Homologacao"],
  [/movimenta\uFFFD+es/gi, "movimentacoes"],
  [/Movimenta\uFFFD+es/gi, "Movimentacoes"],
  [/confer\uFFFD+ncia/gi, "conferencia"],
  [/Usu\uFFFD+rio/gi, "Usuario"],
  [/Respons\uFFFD+vel/gi, "Responsavel"],
  [/\bn\uFFFD+o\b/gi, "nao"],
  [/\bN\uFFFD+o\b/g, "Nao"],
  [/invers\uFFFD+o/gi, "inversao"],
  [/crit\uFFFD+rio/gi, "criterio"],
  [/previs\uFFFD+o/gi, "previsao"],
  [/n\uFFFD+mero/gi, "numero"],
  [/\uFFFD+ltima/gi, "Ultima"],
  [/\uFFFD+ltimo/gi, "Ultimo"],
];

export function cleanDisplayText(value: string | null | undefined) {
  if (!value) return "";

  let normalized = value;

  for (const [pattern, replacement] of latin1MojibakeReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of replacementCharFixes) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}
