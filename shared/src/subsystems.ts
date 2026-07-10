import type { UserRole } from "./types.js";

export const subsystemKeyValues = [
  "hub",
  "planejamento",
  "compras",
  "licitacao",
  "contratos",
  "documentos",
  "workflow",
  "consultas",
  "admin",
] as const;

export type SubsystemKey = (typeof subsystemKeyValues)[number];

export const subsystemAccessLevelValues = [
  "VIEWER",
  "OPERATOR",
  "MANAGER",
  "ADMIN",
] as const;

export type SubsystemAccessLevel =
  (typeof subsystemAccessLevelValues)[number];

export const subsystemAccessLevelLabels = {
  VIEWER: "Consulta",
  OPERATOR: "Operacao",
  MANAGER: "Gestao",
  ADMIN: "Administracao",
} as const satisfies Record<SubsystemAccessLevel, string>;

export const subsystemAccessLevelRank = {
  VIEWER: 1,
  OPERATOR: 2,
  MANAGER: 3,
  ADMIN: 4,
} as const satisfies Record<SubsystemAccessLevel, number>;

export type SubsystemRoutePolicy = {
  readonly primaryRoutes: readonly string[];
  readonly crossRoutes: readonly string[];
  readonly deniedRedirect?: string;
};

export type SubsystemRecommendedActionTone =
  | "primary"
  | "neutral"
  | "warning";

export type SubsystemRecommendedAction = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly tone?: SubsystemRecommendedActionTone;
};

export type SubsystemLoginHighlight = {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
};

export type SubsystemDefinition = {
  readonly key: SubsystemKey;
  readonly hostnames: readonly string[];
  readonly localHostAliases: readonly string[];
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
  readonly loginTitle: string;
  readonly loginSubtitle: string;
  readonly icon: string;
  readonly accent?: string;
  readonly allowedRoles: readonly UserRole[];
  readonly loginHighlights: readonly SubsystemLoginHighlight[];
  readonly routePolicy: SubsystemRoutePolicy;
  readonly navigationKeys: readonly string[];
  readonly commandPaletteKeys: readonly string[];
  readonly recommendedActions: readonly SubsystemRecommendedAction[];
};

const allRoles = ["admin", "gestor", "operador", "auditor", "user"] as const;
const operationalRoles = ["admin", "gestor", "operador", "auditor"] as const;
const managementRoles = ["admin", "gestor", "auditor"] as const;
const adminRoles = ["admin"] as const;

export const subsystemDefinitions = [
  {
    key: "hub",
    hostnames: ["www.sirel.com.br", "app.sirel.com.br", "sirel.com.br"],
    localHostAliases: [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "hub.localhost",
      "app.localhost",
      "www.localhost",
      "hub.127.0.0.1.nip.io",
      "app.127.0.0.1.nip.io",
      "www.127.0.0.1.nip.io",
    ],
    title: "SIREL",
    shortTitle: "Hub",
    description:
      "Portal inicial para acompanhar processos, alertas, módulos e visão geral do ciclo de contratação.",
    loginTitle: "Entrar no SIREL",
    loginSubtitle:
      "Acesse o painel geral, acompanhe processos e navegue entre os ambientes operacionais.",
    icon: "LayoutDashboard",
    accent: "#2563eb",
    allowedRoles: allRoles,
    loginHighlights: [
      {
        icon: "LayoutDashboard",
        title: "Visão geral",
        description:
          "Processos, alertas e módulos reunidos para começar pelo panorama certo.",
      },
      {
        icon: "BellRing",
        title: "Prioridades",
        description:
          "Notificações e prazos ajudam a retomar o que exige atenção imediata.",
      },
      {
        icon: "Search",
        title: "Pesquisa transversal",
        description:
          "Consultas rápidas conectam processos, documentos e rastreabilidade.",
      },
    ],
    routePolicy: {
      primaryRoutes: [
        "/",
        "/notificacoes",
        "/processos",
        "/processos/:processoId",
        "/consultas",
        "/relatorios",
        "/cadastros",
      ],
      crossRoutes: [
        "/planejamento",
        "/compras",
        "/licitacao",
        "/contratos",
        "/documentos",
        "/workflow",
        "/dossie",
        "/prazos",
      ],
      deniedRedirect: "/",
    },
    navigationKeys: [
      "dashboard",
      "notificacoes",
      "processos",
      "consultas",
      "relatorios",
      "cadastros",
      "prazos",
    ],
    commandPaletteKeys: [
      "dashboard",
      "notificacoes",
      "processos",
      "consultas",
      "relatorios",
      "cadastros",
      "prazos",
    ],
    recommendedActions: [
      {
        id: "abrir-processos",
        label: "Abrir processos",
        href: "/processos",
        tone: "primary",
      },
      { id: "ver-alertas", label: "Ver alertas", href: "/notificacoes" },
      { id: "consultar", label: "Consultar", href: "/consultas" },
    ],
  },
  {
    key: "planejamento",
    hostnames: ["planejamento.sirel.com.br"],
    localHostAliases: [
      "planejamento.localhost",
      "planejamento.127.0.0.1.nip.io",
    ],
    title: "SIREL Planejamento",
    shortTitle: "Planejamento",
    description:
      "DFD, ETP, cotações preliminares, termo de referência, PCA e preparação da contratação.",
    loginTitle: "Entrar no ambiente de Planejamento",
    loginSubtitle:
      "Acesse DFDs, ETPs, cotações, termos de referência e o plano de contratações.",
    icon: "FolderKanban",
    accent: "#0f766e",
    allowedRoles: operationalRoles,
    loginHighlights: [
      {
        icon: "ClipboardList",
        title: "DFD e ETP",
        description:
          "Estruture a demanda, o estudo técnico e as decisões da fase preparatória.",
      },
      {
        icon: "Calculator",
        title: "Cotações",
        description:
          "Organize referências de preço antes da consolidação do termo de referência.",
      },
      {
        icon: "CalendarCheck",
        title: "PCA",
        description:
          "Acompanhe o plano de contratações e mantenha a preparação alinhada.",
      },
    ],
    routePolicy: {
      primaryRoutes: [
        "/",
        "/planejamento",
        "/planejamento/dfd/:processoId",
        "/planejamento/etp/:processoId",
        "/planejamento/cotacoes/:processoId",
        "/planejamento/tr/:processoId",
        "/planejamento/pca",
        "/processos",
        "/processos/:processoId",
        "/cadastros",
        "/relatorios",
      ],
      crossRoutes: ["/documentos", "/dossie/:processoId", "/workflow"],
      deniedRedirect: "/",
    },
    navigationKeys: [
      "dashboard",
      "planejamento",
      "pca",
      "processos",
      "documentos",
      "cadastros",
      "relatorios",
      "workflow",
    ],
    commandPaletteKeys: [
      "planejamento",
      "pca",
      "processos",
      "documentos",
      "cadastros",
      "relatorios",
      "workflow",
    ],
    recommendedActions: [
      {
        id: "abrir-planejamento",
        label: "Abrir planejamento",
        href: "/planejamento",
        tone: "primary",
      },
      { id: "ver-pca", label: "Ver PCA", href: "/planejamento/pca" },
      { id: "abrir-processos", label: "Processos", href: "/processos" },
    ],
  },
  {
    key: "compras",
    hostnames: ["compras.sirel.com.br"],
    localHostAliases: ["compras.localhost", "compras.127.0.0.1.nip.io"],
    title: "SIREL Compras",
    shortTitle: "Compras",
    description:
      "Compras, mapa comparativo, pesquisa de preços, itens e importações pertinentes.",
    loginTitle: "Entrar no ambiente de Compras",
    loginSubtitle:
      "Acompanhe pesquisas de preço, itens, mapas comparativos e compras em andamento.",
    icon: "ShoppingCart",
    accent: "#ca8a04",
    allowedRoles: operationalRoles,
    loginHighlights: [
      {
        icon: "SearchCheck",
        title: "Pesquisa de preços",
        description:
          "Acesse referências, fontes e análises para compor o valor estimado.",
      },
      {
        icon: "BadgeDollarSign",
        title: "Mapa comparativo",
        description:
          "Compare propostas e itens com foco na decisão de compra.",
      },
      {
        icon: "PackageCheck",
        title: "Itens saneados",
        description:
          "Controle descrições, unidades e dados necessários para comprar com segurança.",
      },
    ],
    routePolicy: {
      primaryRoutes: [
        "/",
        "/compras",
        "/itens",
        "/importacoes",
        "/processos",
        "/processos/:processoId",
        "/cadastros",
        "/relatorios",
      ],
      crossRoutes: [
        "/planejamento",
        "/planejamento/cotacoes/:processoId",
        "/documentos",
        "/dossie/:processoId",
      ],
      deniedRedirect: "/",
    },
    navigationKeys: [
      "dashboard",
      "compras",
      "itens",
      "importacoes",
      "processos",
      "documentos",
      "cadastros",
      "relatorios",
    ],
    commandPaletteKeys: [
      "compras",
      "itens",
      "importacoes",
      "processos",
      "documentos",
      "cadastros",
      "relatorios",
    ],
    recommendedActions: [
      {
        id: "abrir-compras",
        label: "Abrir compras",
        href: "/compras",
        tone: "primary",
      },
      { id: "ver-itens", label: "Ver itens", href: "/itens" },
      {
        id: "importacoes",
        label: "Importações",
        href: "/importacoes",
      },
    ],
  },
  {
    key: "licitacao",
    hostnames: ["licitacao.sirel.com.br"],
    localHostAliases: ["licitacao.localhost", "licitacao.127.0.0.1.nip.io"],
    title: "SIREL Licitação",
    shortTitle: "Licitação",
    description:
      "Fase externa, julgamento, habilitação, recursos, publicações e homologação.",
    loginTitle: "Entrar no ambiente de Licitação",
    loginSubtitle:
      "Acesse processos em disputa, julgamentos, habilitações, recursos e publicações.",
    icon: "ScrollText",
    accent: "#7c3aed",
    allowedRoles: operationalRoles,
    loginHighlights: [
      {
        icon: "ScrollText",
        title: "Fase externa",
        description:
          "Publicações, disputa, julgamento e habilitação em um fluxo direcionado.",
      },
      {
        icon: "Clock3",
        title: "Prazos críticos",
        description:
          "Controle impugnações, recursos e homologação sem perder vencimentos.",
      },
      {
        icon: "FileCheck2",
        title: "Atos e documentos",
        description:
          "Acesse atas, avisos, diligências e peças do processo licitatório.",
      },
    ],
    routePolicy: {
      primaryRoutes: [
        "/",
        "/licitacao",
        "/licitacao/:processoId",
        "/importacoes",
        "/documentos",
        "/dossie",
        "/dossie/:processoId",
        "/prazos",
        "/cadastros",
        "/relatorios",
      ],
      crossRoutes: [
        "/processos",
        "/processos/:processoId",
        "/consultas",
        "/workflow",
      ],
      deniedRedirect: "/",
    },
    navigationKeys: [
      "dashboard",
      "licitacao",
      "processos",
      "importacoes",
      "documentos",
      "prazos",
      "dossie",
      "consultas",
      "cadastros",
      "relatorios",
    ],
    commandPaletteKeys: [
      "licitacao",
      "processos",
      "importacoes",
      "documentos",
      "prazos",
      "dossie",
      "consultas",
      "cadastros",
      "relatorios",
    ],
    recommendedActions: [
      {
        id: "abrir-licitacoes",
        label: "Abrir licitações",
        href: "/licitacao",
        tone: "primary",
      },
      { id: "criar-processo", label: "Criar processo", href: "/processos" },
      { id: "ver-prazos", label: "Ver prazos", href: "/prazos" },
      { id: "documentos", label: "Documentos", href: "/documentos" },
    ],
  },
  {
    key: "contratos",
    hostnames: ["contratos.sirel.com.br"],
    localHostAliases: ["contratos.localhost", "contratos.127.0.0.1.nip.io"],
    title: "SIREL Contratos",
    shortTitle: "Contratos",
    description:
      "Contratos, vigências, aditivos, saldos, itens contratados e fiscalizações.",
    loginTitle: "Entrar no ambiente de Contratos",
    loginSubtitle:
      "Acompanhe contratos vigentes, saldos, aditivos, prazos e fiscalizações.",
    icon: "Landmark",
    accent: "#16a34a",
    allowedRoles: managementRoles,
    loginHighlights: [
      {
        icon: "CalendarClock",
        title: "Vigências",
        description:
          "Monitore prazos contratuais, renovações e alertas de encerramento.",
      },
      {
        icon: "PenLine",
        title: "Aditivos",
        description:
          "Acompanhe alterações, termos e registros vinculados ao contrato.",
      },
      {
        icon: "ShieldCheck",
        title: "Fiscalização",
        description:
          "Mantenha saldos, responsáveis e evidências sob controle operacional.",
      },
    ],
    routePolicy: {
      primaryRoutes: [
        "/",
        "/contratos",
        "/itens",
        "/prazos",
        "/documentos",
        "/processos",
        "/processos/:processoId",
        "/cadastros",
        "/relatorios",
      ],
      crossRoutes: ["/dossie/:processoId", "/consultas", "/workflow"],
      deniedRedirect: "/",
    },
    navigationKeys: [
      "dashboard",
      "contratos",
      "itens",
      "prazos",
      "documentos",
      "consultas",
      "cadastros",
      "relatorios",
    ],
    commandPaletteKeys: [
      "contratos",
      "itens",
      "prazos",
      "documentos",
      "consultas",
      "cadastros",
      "relatorios",
    ],
    recommendedActions: [
      {
        id: "abrir-contratos",
        label: "Abrir contratos",
        href: "/contratos",
        tone: "primary",
      },
      { id: "ver-saldos", label: "Ver saldos", href: "/itens" },
      { id: "ver-prazos", label: "Prazos", href: "/prazos" },
    ],
  },
  {
    key: "documentos",
    hostnames: ["documentos.sirel.com.br"],
    localHostAliases: ["documentos.localhost", "documentos.127.0.0.1.nip.io"],
    title: "SIREL Documentos",
    shortTitle: "Documentos",
    description:
      "Geração, processamento, modelos, anexos, atas e relatórios documentais.",
    loginTitle: "Entrar no ambiente de Documentos",
    loginSubtitle:
      "Organize modelos, anexos, atas, evidências e documentos dos processos.",
    icon: "FileText",
    accent: "#0891b2",
    allowedRoles: operationalRoles,
    loginHighlights: [
      {
        icon: "FileText",
        title: "Modelos",
        description:
          "Use documentos padronizados para reduzir retrabalho e inconsistências.",
      },
      {
        icon: "Upload",
        title: "Anexos",
        description:
          "Centralize evidências, arquivos externos e peças de apoio dos processos.",
      },
      {
        icon: "Archive",
        title: "Dossiês",
        description:
          "Organize documentos e relatórios para consulta e prestação de contas.",
      },
    ],
    routePolicy: {
      primaryRoutes: [
        "/",
        "/documentos",
        "/dossie",
        "/dossie/:processoId",
        "/relatorios",
        "/cadastros",
      ],
      crossRoutes: [
        "/processos/:processoId",
        "/planejamento/dfd/:processoId",
        "/planejamento/etp/:processoId",
        "/planejamento/tr/:processoId",
        "/licitacao/:processoId",
      ],
      deniedRedirect: "/",
    },
    navigationKeys: [
      "dashboard",
      "documentos",
      "dossie",
      "processos",
      "relatorios",
      "cadastros",
    ],
    commandPaletteKeys: [
      "documentos",
      "dossie",
      "processos",
      "relatorios",
      "cadastros",
    ],
    recommendedActions: [
      {
        id: "abrir-documentos",
        label: "Abrir documentos",
        href: "/documentos",
        tone: "primary",
      },
      { id: "ver-dossies", label: "Dossiês", href: "/dossie" },
      { id: "relatorios", label: "Relatórios", href: "/relatorios" },
    ],
  },
  {
    key: "workflow",
    hostnames: ["workflow.sirel.com.br"],
    localHostAliases: ["workflow.localhost", "workflow.127.0.0.1.nip.io"],
    title: "SIREL Workflow",
    shortTitle: "Workflow",
    description:
      "Tramitação entre setores, pendências, movimentações e andamento operacional.",
    loginTitle: "Entrar no ambiente de Workflow",
    loginSubtitle:
      "Acompanhe tramitações, pendências, movimentações e passagens entre setores.",
    icon: "Workflow",
    accent: "#4f46e5",
    allowedRoles: operationalRoles,
    loginHighlights: [
      {
        icon: "ArrowRightLeft",
        title: "Tramitação",
        description:
          "Visualize passagens entre setores e mantenha o processo em movimento.",
      },
      {
        icon: "Clock3",
        title: "Pendências",
        description:
          "Identifique bloqueios e aguardos antes que virem atraso operacional.",
      },
      {
        icon: "CheckCircle2",
        title: "Movimentações",
        description:
          "Registre conclusões e acompanhe o histórico de cada etapa.",
      },
    ],
    routePolicy: {
      primaryRoutes: [
        "/",
        "/workflow",
        "/notificacoes",
        "/processos",
        "/processos/:processoId",
        "/prazos",
        "/cadastros",
        "/relatorios",
      ],
      crossRoutes: [
        "/planejamento",
        "/compras",
        "/licitacao",
        "/contratos",
        "/documentos",
        "/dossie/:processoId",
      ],
      deniedRedirect: "/",
    },
    navigationKeys: [
      "dashboard",
      "workflow",
      "notificacoes",
      "processos",
      "prazos",
      "documentos",
      "cadastros",
      "relatorios",
    ],
    commandPaletteKeys: [
      "workflow",
      "notificacoes",
      "processos",
      "prazos",
      "documentos",
      "cadastros",
      "relatorios",
    ],
    recommendedActions: [
      {
        id: "abrir-workflow",
        label: "Abrir workflow",
        href: "/workflow",
        tone: "primary",
      },
      { id: "pendencias", label: "Pendências", href: "/notificacoes" },
      { id: "prazos", label: "Prazos", href: "/prazos" },
    ],
  },
  {
    key: "consultas",
    hostnames: ["consultas.sirel.com.br"],
    localHostAliases: ["consultas.localhost", "consultas.127.0.0.1.nip.io"],
    title: "SIREL Consultas",
    shortTitle: "Consultas",
    description:
      "Consultas, dossiês, rastreabilidade, relatórios e pesquisa transversal.",
    loginTitle: "Entrar no ambiente de Consultas",
    loginSubtitle:
      "Pesquise processos, documentos, dossiês, relatórios e rastros operacionais.",
    icon: "Search",
    accent: "#475569",
    allowedRoles: allRoles,
    loginHighlights: [
      {
        icon: "FolderSearch",
        title: "Dossiês",
        description:
          "Localize processos, fornecedores, itens e documentos por contexto.",
      },
      {
        icon: "History",
        title: "Rastreabilidade",
        description:
          "Consulte histórico, movimentações e evidências de forma transversal.",
      },
      {
        icon: "Database",
        title: "Base integrada",
        description:
          "Pesquise dados do SIREL sem navegar por todos os módulos operacionais.",
      },
    ],
    routePolicy: {
      primaryRoutes: [
        "/",
        "/consultas",
        "/dossie",
        "/dossie/:processoId",
        "/relatorios",
        "/cadastros",
        "/processos",
        "/processos/:processoId",
      ],
      crossRoutes: [
        "/planejamento",
        "/compras",
        "/licitacao",
        "/contratos",
        "/documentos",
        "/workflow",
        "/prazos",
      ],
      deniedRedirect: "/",
    },
    navigationKeys: [
      "dashboard",
      "consultas",
      "dossie",
      "processos",
      "relatorios",
      "cadastros",
      "prazos",
    ],
    commandPaletteKeys: [
      "consultas",
      "dossie",
      "processos",
      "relatorios",
      "cadastros",
      "prazos",
    ],
    recommendedActions: [
      {
        id: "abrir-consultas",
        label: "Abrir consultas",
        href: "/consultas",
        tone: "primary",
      },
      { id: "ver-dossies", label: "Dossiês", href: "/dossie" },
      { id: "relatorios", label: "Relatórios", href: "/relatorios" },
    ],
  },
  {
    key: "admin",
    hostnames: ["admin.sirel.com.br"],
    localHostAliases: ["admin.localhost", "admin.127.0.0.1.nip.io"],
    title: "SIREL Administração",
    shortTitle: "Admin",
    description:
      "Usuários, parâmetros, auditoria, cadastros, importações administrativas e configurações restritas.",
    loginTitle: "Entrar na Administração SIREL",
    loginSubtitle:
      "Gerencie usuários, parâmetros, auditoria, cadastros e configurações globais.",
    icon: "ShieldCheck",
    accent: "#dc2626",
    allowedRoles: adminRoles,
    loginHighlights: [
      {
        icon: "Users",
        title: "Usuários",
        description:
          "Gerencie perfis, vínculos e acessos aos ambientes operacionais.",
      },
      {
        icon: "Settings2",
        title: "Parâmetros",
        description:
          "Ajuste configurações globais sem misturar rotina administrativa e operação.",
      },
      {
        icon: "Activity",
        title: "Auditoria",
        description:
          "Acompanhe registros, eventos e evidências de uso do sistema.",
      },
    ],
    routePolicy: {
      primaryRoutes: [
        "/",
        "/usuarios",
        "/parametros",
        "/auditoria",
        "/cadastros",
        "/importacoes",
        "/relatorios",
      ],
      crossRoutes: [
        "/processos",
        "/processos/:processoId",
        "/consultas",
        "/documentos",
      ],
      deniedRedirect: "/",
    },
    navigationKeys: [
      "dashboard",
      "usuarios",
      "parametros",
      "auditoria",
      "cadastros",
      "importacoes",
      "relatorios",
    ],
    commandPaletteKeys: [
      "usuarios",
      "parametros",
      "auditoria",
      "cadastros",
      "importacoes",
      "relatorios",
    ],
    recommendedActions: [
      {
        id: "gerenciar-usuarios",
        label: "Usuários",
        href: "/usuarios",
        tone: "primary",
      },
      { id: "parametros", label: "Parâmetros", href: "/parametros" },
      { id: "auditoria", label: "Auditoria", href: "/auditoria" },
    ],
  },
] as const satisfies readonly SubsystemDefinition[];

export function getSubsystemByKey(
  key: SubsystemKey,
): SubsystemDefinition | undefined {
  return subsystemDefinitions.find((item) => item.key === key);
}

export function getDefaultSubsystem(): SubsystemDefinition {
  return subsystemDefinitions[0];
}

function normalizeHostname(hostname: string) {
  const trimmed = hostname.trim().toLowerCase();

  if (!trimmed) {
    return "";
  }

  const firstForwardedHost = trimmed.split(",")[0]?.trim() ?? "";
  const withoutProtocol = firstForwardedHost.replace(/^[a-z][a-z\d+.-]*:\/\//, "");
  const withoutPath = withoutProtocol.split("/")[0] ?? "";

  if (withoutPath.startsWith("[") && withoutPath.includes("]")) {
    return withoutPath.slice(1, withoutPath.indexOf("]"));
  }

  return withoutPath.split(":")[0] ?? "";
}

export function resolveSubsystemByHost(hostname: string): SubsystemDefinition {
  const normalized = normalizeHostname(hostname);

  return (
    subsystemDefinitions.find((item) =>
      [...item.hostnames, ...item.localHostAliases].some(
        (host) => host === normalized,
      ),
    ) ?? getDefaultSubsystem()
  );
}
