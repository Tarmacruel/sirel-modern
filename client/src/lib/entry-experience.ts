export type EntryActionTone = "default" | "accent" | "warning" | "danger" | "success";
export type EntryActionIconKey =
  | "dashboard"
  | "processos"
  | "consultas"
  | "prazos"
  | "planejamento"
  | "pca"
  | "compras"
  | "licitacao"
  | "contratos"
  | "relatorios"
  | "usuarios"
  | "parametros"
  | "auditoria"
  | "notificacoes"
  | "dossie"
  | "workflow"
  | "importacoes"
  | "cadastros";

export type EntryActionCard = {
  id: string;
  label: string;
  description: string;
  href: string;
  iconKey: EntryActionIconKey;
  tone?: EntryActionTone;
  badge?: string | null;
};

export type CommandPaletteItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  iconKey: EntryActionIconKey;
  group: string;
  keywords?: string[];
  badge?: string | null;
};

export type GuidedTourStep = {
  id: string;
  targetId: string;
  title: string;
  description: string;
};

export type GuidedTourRoleTemplate = "operador" | "gestor" | "admin-auditor" | "user";

export const guidedTourVersion = "entry-2026-04";

export function resolveGuidedTourRoleTemplate(role: string): GuidedTourRoleTemplate {
  if (role === "admin" || role === "auditor") {
    return "admin-auditor";
  }
  if (role === "gestor") {
    return "gestor";
  }
  if (role === "operador") {
    return "operador";
  }
  return "user";
}

export function buildTourStorageKey(userId: number, version = guidedTourVersion) {
  return `sirel-tour:${version}:${userId}`;
}

export function roleLabel(role: string) {
  switch (role) {
    case "admin":
      return "Administrador";
    case "gestor":
      return "Gestor";
    case "operador":
      return "Operador";
    case "auditor":
      return "Auditor";
    default:
      return "Usuário";
  }
}

export function pageSubtitleForLocation(location: string) {
  if (location === "/") {
    return "Entrada operacional com prioridades do dia, retomadas e atalhos do ciclo.";
  }
  if (location.startsWith("/planejamento")) {
    return "Estruture a demanda, feche a base técnica e prepare a transição do processo.";
  }
  if (location.startsWith("/compras")) {
    return "Consolide preços, valide base estimada e libere o processo para licitação.";
  }
  if (location.startsWith("/licitacao")) {
    return "Acompanhe a disputa, prazos legais e decisões críticas da fase licitatória.";
  }
  if (location.startsWith("/contratos")) {
    return "Formalize, acompanhe vigência e conecte contratos aos processos do SIREL.";
  }
  if (location.startsWith("/processos")) {
    return "Visão transversal do processo com marcos, documentos e rastreabilidade.";
  }
  if (location.startsWith("/consultas")) {
    return "Busca central para localizar processos, fornecedores e dossiês rapidamente.";
  }
  return "Operação institucional centralizada, auditável e orientada por contexto.";
}

export function buildGuidedTourSteps(location: string, roleTemplate: GuidedTourRoleTemplate): GuidedTourStep[] {
  if (location === "/") {
    if (roleTemplate === "gestor") {
      return [
        {
          id: "dashboard-critical",
          targetId: "dashboard-critical",
          title: "Prioridades visíveis logo na entrada",
          description: "A abertura do painel destaca o que exige decisão hoje, sem depender de leitura longa ou rolagem inicial.",
        },
        {
          id: "dashboard-actions",
          targetId: "dashboard-actions",
          title: "Ações sugeridas por perfil",
          description: "O SIREL organiza atalhos conforme o seu papel para reduzir o tempo até a próxima ação útil.",
        },
        {
          id: "dashboard-filters",
          targetId: "dashboard-filters",
          title: "Leitura gerencial com filtros rápidos",
          description: "Use os filtros para recortar o painel sem perder o contexto operacional do restante do sistema.",
        },
        {
          id: "shell-command",
          targetId: "shell-command",
          title: "Busca e navegação com Ctrl+K",
          description: "A palette leva você para processos e módulos sem precisar percorrer todo o menu lateral.",
        },
      ];
    }

    if (roleTemplate === "admin-auditor") {
      return [
        {
          id: "shell-sidebar",
          targetId: "shell-sidebar",
          title: "Navegação institucional agrupada",
          description: "Os módulos foram reorganizados para leitura mais rápida entre operação, gestão e administração.",
        },
        {
          id: "dashboard-critical",
          targetId: "dashboard-critical",
          title: "Panorama crítico da operação",
          description: "A entrada consolida urgências, notificações e processos que merecem intervenção mais imediata.",
        },
        {
          id: "shell-user-menu",
          targetId: "shell-user-menu",
          title: "Menu do usuário",
          description: "Aqui ficam tema, reinício do tour e saída segura do ambiente autenticado.",
        },
        {
          id: "shell-command",
          targetId: "shell-command",
          title: "Palette de comando",
          description: "Abra com Ctrl+K para navegar por módulos e localizar processos sem sair do teclado.",
        },
      ];
    }

    if (roleTemplate === "user") {
      return [
        {
          id: "dashboard-entry-intro",
          targetId: "dashboard-entry-intro",
          title: "Bem-vindo ao painel inicial",
          description: "A primeira faixa resume contexto, pendências e próximos passos acessíveis para o seu perfil.",
        },
        {
          id: "dashboard-continue",
          targetId: "dashboard-continue",
          title: "Continue de onde parou",
          description: "O sistema destaca processos recentes para reduzir o tempo de retomada entre sessões.",
        },
        {
          id: "shell-notifications",
          targetId: "shell-notifications",
          title: "Central de notificações",
          description: "Use este atalho para acompanhar eventos pendentes e mensagens operacionais do sistema.",
        },
      ];
    }

    return [
      {
        id: "shell-sidebar",
        targetId: "shell-sidebar",
        title: "Menu lateral reorganizado",
        description: "Os grupos principais ajudam a navegar entre planejamento, compras, licitação e gestão sem ruído visual.",
      },
      {
        id: "dashboard-critical",
        targetId: "dashboard-critical",
        title: "Urgências primeiro",
        description: "A primeira dobra foi pensada para mostrar o que exige ação imediata na operação do dia.",
      },
      {
        id: "dashboard-actions",
        targetId: "dashboard-actions",
        title: "Atalhos recomendados",
        description: "Os cards desta área levam direto aos próximos passos mais prováveis para o seu papel no sistema.",
      },
      {
        id: "dashboard-continue",
        targetId: "dashboard-continue",
        title: "Retomada rápida",
        description: "Use esta faixa para voltar aos processos mais recentes sem refazer toda a navegação.",
      },
      {
        id: "shell-command",
        targetId: "shell-command",
        title: "Acesso rápido com teclado",
        description: "Ctrl+K abre a busca global e encurta o caminho até módulos, processos e ações frequentes.",
      },
    ];
  }

  if (location.startsWith("/planejamento")) {
    return [
      {
        id: "planejamento-intro",
        targetId: "planejamento-intro",
        title: "Visão inicial do Planejamento",
        description: "A abertura destaca a fila, pendências de base e o que falta para o processo avançar com segurança.",
      },
      {
        id: "planejamento-list",
        targetId: "planejamento-list",
        title: "Fila operacional",
        description: "Aqui você acompanha o status de DFD, ETP, TR e cotações preliminares por processo.",
      },
    ];
  }

  if (location.startsWith("/compras")) {
    return [
      {
        id: "compras-intro",
        targetId: "compras-intro",
        title: "Consolidação em Compras",
        description: "O topo desta página resume maturidade da fila, itens travados e risco de atraso na passagem para licitação.",
      },
      {
        id: "compras-list",
        targetId: "compras-list",
        title: "Base de processos em compras",
        description: "Selecione um processo para ver contexto e siga com mapa comparativo, documentos e avanço de macrofase.",
      },
    ];
  }

  if (location.startsWith("/licitacao")) {
    return [
      {
        id: "licitacao-intro",
        targetId: "licitacao-intro",
        title: "Leitura rápida da fase licitatória",
        description: "A entrada do módulo destaca publicações, recursos pendentes e próximos compromissos da disputa.",
      },
      {
        id: "licitacao-list",
        targetId: "licitacao-list",
        title: "Grade operacional",
        description: "A grade central foi pensada para combinar busca, filtros e abertura rápida do processo licitatório.",
      },
    ];
  }

  if (location.startsWith("/contratos")) {
    return [
      {
        id: "contratos-intro",
        targetId: "contratos-intro",
        title: "Panorama de formalização contratual",
        description: "O topo agora resume volume, vencimentos próximos e processos que dependem de ação contratual.",
      },
      {
        id: "contratos-list",
        targetId: "contratos-list",
        title: "Base contratual conectada ao processo",
        description: "A listagem combina contrato, processo e fornecedor para leitura mais direta e menos fragmentada.",
      },
    ];
  }

  return [];
}
