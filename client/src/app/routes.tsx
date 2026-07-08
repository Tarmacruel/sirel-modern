import { lazy, useMemo, type ReactNode } from "react";

import {
  getDefaultSubsystem,
  subsystemDefinitions,
  type SubsystemDefinition,
  type SubsystemKey,
} from "@sirel/shared/subsystems";
import type { UserRole } from "@sirel/shared/types";
import { ContextEmptyState } from "@/components/shared/context-empty-state";
import type { AuthUser } from "@/lib/auth-session";
import { SubsystemHome } from "@/app/subsystem-home";
import { useSubsystem } from "@/app/subsystem-context";

const AuditoriaPage = lazy(() =>
  import("@/pages/auditoria-page").then((module) => ({
    default: module.AuditoriaPage,
  })),
);
const CadastrosPage = lazy(() =>
  import("@/pages/cadastros-page").then((module) => ({
    default: module.CadastrosPage,
  })),
);
const ComprasPage = lazy(() =>
  import("@/pages/compras-page").then((module) => ({
    default: module.ComprasPage,
  })),
);
const ContratosPage = lazy(() =>
  import("@/pages/contratos-page").then((module) => ({
    default: module.ContratosPage,
  })),
);
const ConsultasPage = lazy(() =>
  import("@/pages/consultas-page").then((module) => ({
    default: module.ConsultasPage,
  })),
);
const DossiePage = lazy(() =>
  import("@/pages/dossie-page").then((module) => ({
    default: module.DossiePage,
  })),
);
const DossieItemPage = lazy(() =>
  import("@/pages/dossie-item-page").then((module) => ({
    default: module.DossieItemPage,
  })),
);
const DossieFornecedorPage = lazy(() =>
  import("@/pages/dossie-fornecedor-page").then((module) => ({
    default: module.DossieFornecedorPage,
  })),
);
const DocumentosPage = lazy(() =>
  import("@/pages/documentos-page").then((module) => ({
    default: module.DocumentosPage,
  })),
);
const ImportacoesPage = lazy(() =>
  import("@/pages/importacoes-page").then((module) => ({
    default: module.ImportacoesPage,
  })),
);
const ItensPage = lazy(() =>
  import("@/pages/itens-page").then((module) => ({
    default: module.ItensPage,
  })),
);
const LicitacaoPage = lazy(() =>
  import("@/pages/licitacao-page").then((module) => ({
    default: module.LicitacaoPage,
  })),
);
const LicitacaoProcessoPage = lazy(() =>
  import("@/pages/licitacao-processo-page").then((module) => ({
    default: module.LicitacaoProcessoPage,
  })),
);
const NotificacoesPage = lazy(() =>
  import("@/pages/notificacoes-page").then((module) => ({
    default: module.NotificacoesPage,
  })),
);
const ParametrosPage = lazy(() =>
  import("@/pages/parametros-page").then((module) => ({
    default: module.ParametrosPage,
  })),
);
const PlanejamentoCotacoesPage = lazy(() =>
  import("@/pages/planejamento-cotacoes-page").then((module) => ({
    default: module.PlanejamentoCotacoesPage,
  })),
);
const PlanejamentoDfdPage = lazy(() =>
  import("@/pages/planejamento-dfd-page").then((module) => ({
    default: module.PlanejamentoDfdPage,
  })),
);
const PlanejamentoEtpPage = lazy(() =>
  import("@/pages/planejamento-etp-page").then((module) => ({
    default: module.PlanejamentoEtpPage,
  })),
);
const PlanejamentoTrPage = lazy(() =>
  import("@/pages/planejamento-tr-page").then((module) => ({
    default: module.PlanejamentoTrPage,
  })),
);
const PlanejamentoPage = lazy(() =>
  import("@/pages/planejamento-page").then((module) => ({
    default: module.PlanejamentoPage,
  })),
);
const PlanejamentoPcaPage = lazy(() =>
  import("@/pages/planejamento-pca-page").then((module) => ({
    default: module.PlanejamentoPcaPage,
  })),
);
const PrazosPage = lazy(() =>
  import("@/pages/prazos-page").then((module) => ({
    default: module.PrazosPage,
  })),
);
const ProcessosPage = lazy(() =>
  import("@/pages/processos-page").then((module) => ({
    default: module.ProcessosPage,
  })),
);
const RelatoriosPage = lazy(() =>
  import("@/pages/relatorios-page").then((module) => ({
    default: module.RelatoriosPage,
  })),
);
const UsuariosPage = lazy(() =>
  import("@/pages/usuarios-page").then((module) => ({
    default: module.UsuariosPage,
  })),
);
const WorkflowPage = lazy(() =>
  import("@/pages/workflow-page").then((module) => ({
    default: module.WorkflowPage,
  })),
);

export type AppRouteParams = Record<string, string | undefined>;
export type AppRouteRenderContext = {
  readonly user: Pick<AuthUser, "role">;
};

export type AppRouteDefinition = {
  readonly id: string;
  readonly path: string;
  readonly subsystemKeys: readonly SubsystemKey[];
  readonly requiredRoles?: readonly UserRole[];
  readonly render: (
    params: AppRouteParams,
    context: AppRouteRenderContext,
  ) => ReactNode;
};

const userRoles = [
  "user",
  "admin",
  "gestor",
  "operador",
  "auditor",
] as const satisfies readonly UserRole[];

const allSubsystemKeys: readonly SubsystemKey[] = subsystemDefinitions.map(
  (item) => item.key,
);
const adminOnly = ["admin"] as const satisfies readonly UserRole[];

function allSubsystemsExcept(
  ...blockedKeys: readonly SubsystemKey[]
): readonly SubsystemKey[] {
  return allSubsystemKeys.filter((key) => !blockedKeys.includes(key));
}

function isKnownUserRole(role: string): role is UserRole {
  return userRoles.includes(role as UserRole);
}

function normalizeUserRole(role: string): UserRole {
  return isKnownUserRole(role) ? role : "user";
}

function hasRoleAccess(
  allowedRoles: readonly UserRole[] | undefined,
  role: UserRole,
) {
  return !allowedRoles || allowedRoles.includes(role);
}

function normalizeRoutePath(path: string) {
  const cleanPath = path.trim().split("?")[0]?.replace(/\/+$/, "") ?? "";

  return cleanPath || "/";
}

function routePathMatchesPolicy(routePath: string, policyPath: string) {
  const route = normalizeRoutePath(routePath);
  const policy = normalizeRoutePath(policyPath);

  if (route === policy) {
    return true;
  }

  if (!policy.includes(":") && policy !== "/" && route.startsWith(`${policy}/`)) {
    return true;
  }

  const routeSegments = route.split("/").filter(Boolean);
  const policySegments = policy.split("/").filter(Boolean);

  if (routeSegments.length !== policySegments.length) {
    return false;
  }

  return policySegments.every((segment, index) => {
    const routeSegment = routeSegments[index];

    return (
      segment.startsWith(":") ||
      routeSegment?.startsWith(":") ||
      segment === routeSegment
    );
  });
}

function isPathInRoutePolicy(
  path: string,
  subsystem: SubsystemDefinition,
) {
  return [
    ...subsystem.routePolicy.primaryRoutes,
    ...subsystem.routePolicy.crossRoutes,
  ].some((policyPath) => routePathMatchesPolicy(path, policyPath));
}

function resolveSubsystemForUser(
  subsystem: SubsystemDefinition,
  role: UserRole,
) {
  return subsystem.allowedRoles.includes(role) ? subsystem : getDefaultSubsystem();
}

export const appRoutes: readonly AppRouteDefinition[] = [
  {
    id: "dashboard",
    path: "/",
    subsystemKeys: allSubsystemKeys,
    render: (_params, context) => <SubsystemHome user={context.user} />,
  },
  {
    id: "dossie-item-detail",
    path: "/dossie/item/:itemId",
    subsystemKeys: [
      "hub",
      "licitacao",
      "documentos",
      "consultas",
    ] as const,
    render: (params) => <DossieItemPage itemId={Number(params.itemId)} />,
  },
  {
    id: "dossie-item",
    path: "/dossie/item",
    subsystemKeys: [
      "hub",
      "licitacao",
      "documentos",
      "consultas",
    ] as const,
    render: () => <DossieItemPage />,
  },
  {
    id: "dossie-fornecedor-detail",
    path: "/dossie/fornecedor/:fornecedorId",
    subsystemKeys: [
      "hub",
      "licitacao",
      "documentos",
      "consultas",
    ] as const,
    render: (params) => (
      <DossieFornecedorPage fornecedorId={Number(params.fornecedorId)} />
    ),
  },
  {
    id: "dossie-fornecedor",
    path: "/dossie/fornecedor",
    subsystemKeys: [
      "hub",
      "licitacao",
      "documentos",
      "consultas",
    ] as const,
    render: () => <DossieFornecedorPage />,
  },
  {
    id: "dossie-processo-detail",
    path: "/dossie/:processoId",
    subsystemKeys: allSubsystemKeys,
    render: (params) => <DossiePage processoId={Number(params.processoId)} />,
  },
  {
    id: "dossie",
    path: "/dossie",
    subsystemKeys: allSubsystemKeys,
    render: () => <DossiePage />,
  },
  {
    id: "notificacoes",
    path: "/notificacoes",
    subsystemKeys: allSubsystemsExcept("admin"),
    render: () => <NotificacoesPage />,
  },
  {
    id: "consultas",
    path: "/consultas",
    subsystemKeys: allSubsystemKeys,
    render: () => <ConsultasPage />,
  },
  {
    id: "relatorios",
    path: "/relatorios",
    subsystemKeys: allSubsystemKeys,
    render: () => <RelatoriosPage />,
  },
  {
    id: "prazos",
    path: "/prazos",
    subsystemKeys: allSubsystemsExcept("admin"),
    render: () => <PrazosPage />,
  },
  {
    id: "importacoes",
    path: "/importacoes",
    subsystemKeys: ["hub", "compras", "licitacao", "admin"] as const,
    render: () => <ImportacoesPage />,
  },
  {
    id: "cadastros",
    path: "/cadastros",
    subsystemKeys: allSubsystemKeys,
    render: () => <CadastrosPage />,
  },
  {
    id: "planejamento-dfd-detail",
    path: "/planejamento/dfd/:processoId",
    subsystemKeys: ["hub", "planejamento", "documentos"] as const,
    render: (params) => (
      <PlanejamentoDfdPage processoId={Number(params.processoId)} />
    ),
  },
  {
    id: "planejamento-etp-detail",
    path: "/planejamento/etp/:processoId",
    subsystemKeys: ["hub", "planejamento", "documentos"] as const,
    render: (params) => (
      <PlanejamentoEtpPage processoId={Number(params.processoId)} />
    ),
  },
  {
    id: "planejamento-cotacoes-detail",
    path: "/planejamento/cotacoes/:processoId",
    subsystemKeys: ["hub", "planejamento", "compras"] as const,
    render: (params) => (
      <PlanejamentoCotacoesPage processoId={Number(params.processoId)} />
    ),
  },
  {
    id: "planejamento-tr-detail",
    path: "/planejamento/tr/:processoId",
    subsystemKeys: ["hub", "planejamento", "documentos"] as const,
    render: (params) => (
      <PlanejamentoTrPage processoId={Number(params.processoId)} />
    ),
  },
  {
    id: "planejamento-pca",
    path: "/planejamento/pca",
    subsystemKeys: ["hub", "planejamento"] as const,
    render: () => <PlanejamentoPcaPage />,
  },
  {
    id: "itens",
    path: "/itens",
    subsystemKeys: ["compras", "contratos"] as const,
    render: () => <ItensPage />,
  },
  {
    id: "planejamento",
    path: "/planejamento",
    subsystemKeys: [
      "hub",
      "planejamento",
      "compras",
      "workflow",
      "consultas",
    ] as const,
    render: () => <PlanejamentoPage />,
  },
  {
    id: "compras",
    path: "/compras",
    subsystemKeys: ["hub", "compras", "workflow", "consultas"] as const,
    render: () => <ComprasPage />,
  },
  {
    id: "processos-detail",
    path: "/processos/:processoId",
    subsystemKeys: allSubsystemKeys,
    render: (params) => <ProcessosPage processoId={Number(params.processoId)} />,
  },
  {
    id: "processos",
    path: "/processos",
    subsystemKeys: allSubsystemKeys,
    render: () => <ProcessosPage />,
  },
  {
    id: "licitacao-detail",
    path: "/licitacao/:processoId",
    subsystemKeys: [
      "hub",
      "licitacao",
      "documentos",
      "workflow",
      "consultas",
    ] as const,
    render: (params) => (
      <LicitacaoProcessoPage processoId={Number(params.processoId)} />
    ),
  },
  {
    id: "licitacao",
    path: "/licitacao",
    subsystemKeys: ["hub", "licitacao", "workflow", "consultas"] as const,
    render: () => <LicitacaoPage />,
  },
  {
    id: "documentos",
    path: "/documentos",
    subsystemKeys: allSubsystemKeys,
    render: () => <DocumentosPage />,
  },
  {
    id: "contratos",
    path: "/contratos",
    subsystemKeys: ["hub", "contratos", "workflow", "consultas"] as const,
    render: () => <ContratosPage />,
  },
  {
    id: "workflow",
    path: "/workflow",
    subsystemKeys: allSubsystemsExcept("admin"),
    render: () => <WorkflowPage />,
  },
  {
    id: "auditoria",
    path: "/auditoria",
    subsystemKeys: ["admin"] as const,
    requiredRoles: adminOnly,
    render: () => <AuditoriaPage />,
  },
  {
    id: "parametros",
    path: "/parametros",
    subsystemKeys: ["admin"] as const,
    requiredRoles: adminOnly,
    render: () => <ParametrosPage />,
  },
  {
    id: "usuarios",
    path: "/usuarios",
    subsystemKeys: ["admin"] as const,
    requiredRoles: adminOnly,
    render: () => <UsuariosPage />,
  },
];

export function getAllowedRoutes({
  subsystem,
  user,
}: {
  subsystem: SubsystemDefinition;
  user: Pick<AuthUser, "role">;
}): readonly AppRouteDefinition[] {
  const role = normalizeUserRole(user.role);
  const accessibleSubsystem = resolveSubsystemForUser(subsystem, role);

  return appRoutes.filter((route) => {
    if (!hasRoleAccess(route.requiredRoles, role)) {
      return false;
    }

    if (!accessibleSubsystem.allowedRoles.includes(role)) {
      return false;
    }

    if (!route.subsystemKeys.includes(accessibleSubsystem.key)) {
      return false;
    }

    return isPathInRoutePolicy(route.path, accessibleSubsystem);
  });
}

export function useAllowedRoutes({
  subsystem,
  user,
}: {
  subsystem?: SubsystemDefinition;
  user: Pick<AuthUser, "role">;
}) {
  const currentSubsystem = useSubsystem();
  const selectedSubsystem = subsystem ?? currentSubsystem;

  return useMemo(
    () => getAllowedRoutes({ subsystem: selectedSubsystem, user }),
    [selectedSubsystem, user.role],
  );
}

export function renderAppRoute(
  route: AppRouteDefinition,
  params: AppRouteParams,
  context: AppRouteRenderContext,
) {
  return route.render(params, context);
}

export function NotFoundOrDeniedPage() {
  const subsystem = useSubsystem();

  return (
    <div className="min-h-[50vh]">
      <ContextEmptyState
        title="Rota indisponível"
        description={`Esta tela não está disponível no ambiente ${subsystem.shortTitle} ou seu perfil não tem permissão para acessá-la.`}
        actionLabel="Voltar ao dashboard"
        actionHref={subsystem.routePolicy.deniedRedirect ?? "/"}
      />
    </div>
  );
}
