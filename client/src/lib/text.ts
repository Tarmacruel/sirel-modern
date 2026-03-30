const mojibakeReplacements: Array<[RegExp, string]> = [
  [/Configura\?+o/gi, "Configuração"],
  [/configura\?+o/gi, "configuração"],
  [/Licita\?+o/gi, "Licitação"],
  [/licita\?+o/gi, "licitação"],
  [/altera\?+o/gi, "alteração"],
  [/altera\?+es/gi, "alterações"],
  [/prepara\?+o/gi, "preparação"],
  [/Publica\?+o/gi, "Publicação"],
  [/publica\?+o/gi, "publicação"],
  [/confer\?ncia/gi, "conferência"],
  [/Descri\?+o/gi, "Descrição"],
  [/descri\?+o/gi, "descrição"],
  [/situa\?+o/gi, "situação"],
  [/avalia\?+o/gi, "avaliação"],
  [/recep\?+o/gi, "recepção"],
  [/homologa\?+o/gi, "homologação"],
  [/habilita\?+o/gi, "habilitação"],
  [/movimenta\?+o/gi, "movimentação"],
  [/In\?cio/gi, "Início"],
  [/in\?cio/gi, "início"],
  [/inv\?lida/gi, "inválida"],
  [/inv\?lido/gi, "inválido"],
  [/\bn\?o\b/gi, "não"],
  [/\bgest\?o\b/gi, "gestão"],
];

export function cleanDisplayText(value: string | null | undefined) {
  if (!value) return "";

  return mojibakeReplacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}
