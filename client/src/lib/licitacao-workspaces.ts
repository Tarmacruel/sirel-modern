import { modalidadeGrupoOptions } from "@sirel/shared/const";

export type LicitacaoWorkspaceKey =
  | "credenciamentos"
  | "dispensas"
  | "inexigibilidades"
  | "pregoes"
  | "concorrencias"
  | "atas-adesoes"
  | "todos";

export type LicitacaoWorkspaceIcon =
  | "badge-check"
  | "file-minus"
  | "file-key"
  | "gavel"
  | "scale"
  | "file-symlink"
  | "list-checks";

export type LicitacaoModalidadeGrupo = (typeof modalidadeGrupoOptions)[number];

export type LicitacaoWorkspaceCustomFilter = "ATAS_ADESOES";

export interface LicitacaoWorkspaceDefinition {
  key: LicitacaoWorkspaceKey;
  title: string;
  shortTitle: string;
  subtitle: string;
  icon: LicitacaoWorkspaceIcon;
  modalidadeGrupo?: LicitacaoModalidadeGrupo;
  customFilter?: LicitacaoWorkspaceCustomFilter;
}

export interface LicitacaoWorkspaceRouteState {
  showHub: boolean;
  workspace: LicitacaoWorkspaceDefinition | null;
}

export const licitacaoWorkspaces = [
  {
    key: "credenciamentos",
    title: "Credenciamentos",
    shortTitle: "Credenciamentos",
    subtitle: "Habilitacao previa",
    icon: "badge-check",
    modalidadeGrupo: "CREDENCIAMENTO",
  },
  {
    key: "dispensas",
    title: "Dispensas",
    shortTitle: "Dispensas",
    subtitle: "Contratacao direta",
    icon: "file-minus",
    modalidadeGrupo: "DISPENSA",
  },
  {
    key: "inexigibilidades",
    title: "Inexigibilidades",
    shortTitle: "Inexigibilidades",
    subtitle: "Fornecedor exclusivo",
    icon: "file-key",
    modalidadeGrupo: "INEXIGIBILIDADE",
  },
  {
    key: "pregoes",
    title: "Pregoes",
    shortTitle: "Pregoes",
    subtitle: "Disputa competitiva",
    icon: "gavel",
    modalidadeGrupo: "PREGAO",
  },
  {
    key: "concorrencias",
    title: "Concorrencias",
    shortTitle: "Concorrencias",
    subtitle: "Obras e servicos",
    icon: "scale",
    modalidadeGrupo: "CONCORRENCIA",
  },
  {
    key: "atas-adesoes",
    title: "Atas e adesoes",
    shortTitle: "Atas e adesoes",
    subtitle: "Registro externo",
    icon: "file-symlink",
    customFilter: "ATAS_ADESOES",
  },
  {
    key: "todos",
    title: "Todos os processos",
    shortTitle: "Todos",
    subtitle: "Consulta geral",
    icon: "list-checks",
  },
] as const satisfies readonly LicitacaoWorkspaceDefinition[];

const workspaceByKey = new Map<
  LicitacaoWorkspaceKey,
  LicitacaoWorkspaceDefinition
>(licitacaoWorkspaces.map((workspace) => [workspace.key, workspace]));

export function getLicitacaoWorkspaceByKey(
  key: string | null | undefined,
): LicitacaoWorkspaceDefinition | undefined {
  return key ? workspaceByKey.get(key as LicitacaoWorkspaceKey) : undefined;
}

export function buildLicitacaoWorkspaceHref(key: LicitacaoWorkspaceKey) {
  return `/licitacao?hub=0&workspace=${encodeURIComponent(key)}`;
}

export function buildLicitacaoHubHref() {
  return "/licitacao";
}

export function resolveLicitacaoWorkspaceRoute(
  search: string | URLSearchParams,
): LicitacaoWorkspaceRouteState {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const workspace = getLicitacaoWorkspaceByKey(params.get("workspace"));
  const hubParam = params.get("hub");

  if (
    workspace &&
    (hubParam === "0" || (!hubParam && workspace.key === "todos"))
  ) {
    return { showHub: false, workspace };
  }

  return { showHub: true, workspace: null };
}

export function getLicitacaoWorkspaceModalidadeGrupo(
  workspace: LicitacaoWorkspaceDefinition | null,
): LicitacaoModalidadeGrupo | undefined {
  return workspace?.modalidadeGrupo;
}

export function isLicitacaoWorkspaceFilterSupported(
  workspace: LicitacaoWorkspaceDefinition | null,
) {
  return workspace?.customFilter !== "ATAS_ADESOES";
}

export function getLicitacaoWorkspaceUnsupportedMessage(
  workspace: LicitacaoWorkspaceDefinition | null,
) {
  if (workspace?.customFilter !== "ATAS_ADESOES") return undefined;

  return "Atas e adesoes ainda dependem de classificacao propria no modelo de dados. O card foi isolado para receber o filtro real sem misturar outras modalidades.";
}
