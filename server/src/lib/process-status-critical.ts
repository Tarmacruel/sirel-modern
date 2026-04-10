export interface ProcessoStatusInfo {
  id: number;
  codigo: string | null;
  nome: string | null;
}

export type CriticalStatusKind =
  | "HOMOLOGACAO"
  | "FRACASSADO"
  | "SUSPENSAO"
  | "REVOGACAO"
  | "ANULACAO"
  | "DESERTO";

function normalizeStatusToken(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function buildStatusFingerprint(status: {
  codigo?: string | null;
  nome?: string | null;
}) {
  return normalizeStatusToken([status.codigo, status.nome].filter(Boolean).join(" "));
}

function hasAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function getCriticalStatusKind(
  status: { codigo?: string | null; nome?: string | null } | null | undefined,
): CriticalStatusKind | null {
  if (!status) return null;
  const fingerprint = buildStatusFingerprint(status);
  if (!fingerprint) return null;

  if (hasAnyKeyword(fingerprint, ["HOMOLOG"])) return "HOMOLOGACAO";
  if (hasAnyKeyword(fingerprint, ["FRACASS"])) return "FRACASSADO";
  if (hasAnyKeyword(fingerprint, ["SUSPENS"])) return "SUSPENSAO";
  if (hasAnyKeyword(fingerprint, ["REVOG"])) return "REVOGACAO";
  if (hasAnyKeyword(fingerprint, ["ANUL"])) return "ANULACAO";
  if (hasAnyKeyword(fingerprint, ["DESERT"])) return "DESERTO";

  return null;
}

export function isCriticalStatus(
  status: { codigo?: string | null; nome?: string | null } | null | undefined,
) {
  return getCriticalStatusKind(status) !== null;
}

export function isHomologationCriticalStatus(
  status: { codigo?: string | null; nome?: string | null } | null | undefined,
) {
  return getCriticalStatusKind(status) === "HOMOLOGACAO";
}

export function getCriticalStatusKindLabel(kind: CriticalStatusKind) {
  switch (kind) {
    case "HOMOLOGACAO":
      return "homologação";
    case "FRACASSADO":
      return "fracassado";
    case "SUSPENSAO":
      return "suspensão";
    case "REVOGACAO":
      return "revogação";
    case "ANULACAO":
      return "anulação";
    case "DESERTO":
      return "deserto";
    default:
      return "status crítico";
  }
}
