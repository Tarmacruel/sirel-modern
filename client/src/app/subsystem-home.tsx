import { type ComponentType, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BellRing,
  CalendarCheck,
  ClipboardList,
  Database,
  FileText,
  FolderKanban,
  History,
  Import,
  Landmark,
  LayoutDashboard,
  PackageCheck,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Link } from "wouter";

import {
  type SubsystemDefinition,
  type SubsystemKey,
} from "@sirel/shared/subsystems";
import { ContextEmptyState } from "@/components/shared/context-empty-state";
import { PageIntro } from "@/components/shared/page-intro";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIntegerBR, formatShortDateTimeBR } from "@/lib/formatters";
import type { AuthUser } from "@/lib/auth-session";
import { cleanDisplayText } from "@/lib/text";
import { trpc } from "@/lib/trpc";
import { useSubsystem } from "@/app/subsystem-context";
import { HubPage } from "@/pages/hub-page";

type HomeUser = AuthUser;

type HomeMetric = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly description: string;
  readonly tone?: "default" | "accent" | "warning" | "danger" | "success";
  readonly icon: keyof typeof homeIcons;
};

type HomeAction = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly href: string;
  readonly icon: keyof typeof homeIcons;
};

type HomeCopy = {
  readonly title: string;
  readonly description: string;
  readonly asideTitle: string;
  readonly asideDescription: string;
};

const homeIcons = {
  Activity,
  ArrowRight,
  BellRing,
  CalendarCheck,
  ClipboardList,
  Database,
  FileText,
  FolderKanban,
  History,
  Import,
  Landmark,
  LayoutDashboard,
  PackageCheck,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Users,
  Workflow,
} satisfies Record<string, LucideIcon>;

const subsystemIconMap: Record<string, LucideIcon> = {
  ...homeIcons,
};

const homeCopyBySubsystem: Partial<Record<SubsystemKey, HomeCopy>> = {
  licitacao: {
    title: "Entrada de Licitação",
    description:
      "Resumo da fase externa com atalhos para a fila, prazos, documentos e dossiês.",
    asideTitle: "Ritmo da fase",
    asideDescription:
      "Priorize processos publicados, pendências de publicidade e recursos antes de abrir cada detalhe.",
  },
  planejamento: {
    title: "Entrada de Planejamento",
    description:
      "Fila preparatória com leitura rápida de DFD, ETP, TR e PCA antes da passagem para compras.",
    asideTitle: "Base técnica",
    asideDescription:
      "Comece pelas demandas sem documento inicial e avance para estudo, cotação e termo de referência.",
  },
  compras: {
    title: "Entrada de Compras",
    description:
      "Acompanhamento da consolidação de preços, itens, importações e passagem para licitação.",
    asideTitle: "Consolidação",
    asideDescription:
      "Use a fila para conferir valor estimado, itens e processos parados antes de liberar a etapa seguinte.",
  },
  admin: {
    title: "Entrada Administrativa",
    description:
      "Acesso direto a usuários, parâmetros, auditoria, cadastros e configurações restritas.",
    asideTitle: "Controle do ambiente",
    asideDescription:
      "Acompanhe acesso, trilha de auditoria e configurações globais em uma entrada mais curta.",
  },
};

const homeActionsBySubsystem: Partial<Record<SubsystemKey, readonly HomeAction[]>> = {
  licitacao: [
    {
      id: "fila-licitacao",
      label: "Abrir licitações",
      description: "Entrar na fila operacional da fase externa.",
      href: "/licitacao",
      icon: "ScrollText",
    },
    {
      id: "prazos-licitacao",
      label: "Ver prazos",
      description: "Conferir compromissos e vencimentos críticos.",
      href: "/prazos",
      icon: "CalendarCheck",
    },
    {
      id: "documentos-licitacao",
      label: "Documentos",
      description: "Acessar peças, anexos e modelos do processo.",
      href: "/documentos",
      icon: "FileText",
    },
    {
      id: "dossies-licitacao",
      label: "Dossiês",
      description: "Consultar rastreabilidade e contexto dos processos.",
      href: "/dossie",
      icon: "Database",
    },
  ],
  planejamento: [
    {
      id: "fila-planejamento",
      label: "Abrir planejamento",
      description: "Trabalhar DFD, ETP, cotações e TR.",
      href: "/planejamento",
      icon: "FolderKanban",
    },
    {
      id: "pca-planejamento",
      label: "Ver PCA",
      description: "Acompanhar o plano de contratações.",
      href: "/planejamento/pca",
      icon: "CalendarCheck",
    },
    {
      id: "processos-planejamento",
      label: "Processos",
      description: "Abrir painel transversal do processo.",
      href: "/processos",
      icon: "ClipboardList",
    },
    {
      id: "workflow-planejamento",
      label: "Workflow",
      description: "Ver movimentações e pendências da fase.",
      href: "/workflow",
      icon: "Workflow",
    },
  ],
  compras: [
    {
      id: "fila-compras",
      label: "Abrir compras",
      description: "Conferir processos em consolidação.",
      href: "/compras",
      icon: "ShoppingCart",
    },
    {
      id: "itens-compras",
      label: "Itens",
      description: "Revisar itens, unidades e dados contratáveis.",
      href: "/itens",
      icon: "PackageCheck",
    },
    {
      id: "importacoes-compras",
      label: "Importações",
      description: "Acompanhar cargas e bases de apoio.",
      href: "/importacoes",
      icon: "Import",
    },
    {
      id: "processos-compras",
      label: "Processos",
      description: "Abrir a visao completa dos processos.",
      href: "/processos",
      icon: "ClipboardList",
    },
  ],
  admin: [
    {
      id: "usuarios-admin",
      label: "Usuários",
      description: "Gerenciar perfis, vínculos e acessos.",
      href: "/usuarios",
      icon: "Users",
    },
    {
      id: "parametros-admin",
      label: "Parâmetros",
      description: "Ajustar configurações globais do sistema.",
      href: "/parametros",
      icon: "Settings2",
    },
    {
      id: "auditoria-admin",
      label: "Auditoria",
      description: "Consultar eventos e alterações rastreáveis.",
      href: "/auditoria",
      icon: "History",
    },
    {
      id: "cadastros-admin",
      label: "Cadastros",
      description: "Administrar bases e cadastros auxiliares.",
      href: "/cadastros",
      icon: "Database",
    },
  ],
};

function resolveIcon(icon: string): LucideIcon {
  return subsystemIconMap[icon] ?? LayoutDashboard;
}

function getHomeActions(subsystem: SubsystemDefinition): readonly HomeAction[] {
  return (
    homeActionsBySubsystem[subsystem.key] ??
    subsystem.recommendedActions.map((action) => ({
      id: action.id,
      label: action.label,
      description: "Abrir esta área do subsistema.",
      href: action.href,
      icon: "ArrowRight",
    }))
  );
}

function getHomeCopy(subsystem: SubsystemDefinition): HomeCopy {
  return (
    homeCopyBySubsystem[subsystem.key] ?? {
      title: `Entrada de ${subsystem.shortTitle}`,
      description: subsystem.description,
      asideTitle: "Atalhos do subsistema",
      asideDescription:
        "Use esta entrada para abrir as ações principais sem voltar ao painel geral.",
    }
  );
}

function MetricCard({ metric }: { metric: HomeMetric }) {
  const Icon = homeIcons[metric.icon];

  return (
    <article className="min-h-[150px] rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            {metric.label}
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[var(--text-primary)]">
            {metric.value}
          </p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] bg-[var(--surface-soft)] text-[var(--accent-color)]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
        {metric.description}
      </p>
    </article>
  );
}

function MetricGrid({
  metrics,
  loading,
}: {
  metrics: readonly HomeMetric[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[150px] rounded-[24px]" />
        ))}
      </div>
    );
  }

  if (!metrics.length) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} />
      ))}
    </div>
  );
}

function ActionGrid({ actions }: { actions: readonly HomeAction[] }) {
  if (!actions.length) return null;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {actions.map((action) => {
        const Icon = homeIcons[action.icon] ?? ArrowRight;

        return (
          <article
            key={action.id}
            className="flex min-h-[178px] flex-col rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] bg-[var(--surface-soft)] text-[var(--accent-color)]">
                <Icon className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-[var(--text-muted)]" />
            </div>
            <h3 className="mt-4 font-[var(--font-heading)] text-lg font-black tracking-tight text-[var(--text-primary)]">
              {action.label}
            </h3>
            <p className="mt-2 flex-1 text-sm leading-6 text-[var(--text-secondary)]">
              {action.description}
            </p>
            <Link
              href={action.href}
              className="mt-4"
              aria-label={`Abrir ${action.label}`}
            >
              <Button size="sm" variant="outline" className="w-full">
                Abrir
              </Button>
            </Link>
          </article>
        );
      })}
    </section>
  );
}

function SubsystemHomeFrame({
  subsystem,
  children,
}: {
  subsystem: SubsystemDefinition;
  children: ReactNode;
}) {
  const copy = getHomeCopy(subsystem);
  const actions = getHomeActions(subsystem);
  const primaryActions = actions.slice(0, 2);
  const SubsystemIcon = resolveIcon(subsystem.icon);

  return (
    <div className="space-y-5">
      <PageIntro
        eyebrow={`Início ${subsystem.shortTitle}`}
        title={copy.title}
        description={copy.description}
        actions={
          primaryActions.length ? (
            <div className="flex flex-wrap gap-3">
              {primaryActions.map((action, index) => (
                <Link key={action.id} href={action.href}>
                  <Button variant={index === 0 ? "default" : "secondary"}>
                    {action.label}
                  </Button>
                </Link>
              ))}
            </div>
          ) : null
        }
        aside={
          <div className="rounded-[24px] border border-white/12 bg-white/[0.08] p-4 text-white backdrop-blur-sm xl:max-w-[340px]">
            <span
              className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] text-white"
              style={{ backgroundColor: subsystem.accent ?? undefined }}
            >
              <SubsystemIcon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.22em] text-sky-100/70">
              {copy.asideTitle}
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-200">
              {copy.asideDescription}
            </p>
          </div>
        }
      />

      {children}

      <div className="space-y-3">
        <div>
          <h2 className="font-[var(--font-heading)] text-xl font-black tracking-tight text-[var(--text-primary)]">
            Ações principais
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Atalhos reais para continuar o trabalho neste subsistema.
          </p>
        </div>
        <ActionGrid actions={actions} />
      </div>
    </div>
  );
}

function RecentProcessList({
  title,
  description,
  items,
  getHref,
  emptyTitle,
  emptyDescription,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  items: ReadonlyArray<{
    id?: number;
    processoId?: number;
    numeroSirel?: string | null;
    objeto?: string | null;
    etapaAtual?: string | null;
    secretaria?: string | null;
  }>;
  getHref: (item: {
    id?: number;
    processoId?: number;
    numeroSirel?: string | null;
    objeto?: string | null;
    etapaAtual?: string | null;
    secretaria?: string | null;
  }) => string;
  emptyTitle: string;
  emptyDescription: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <section className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-[var(--font-heading)] text-xl font-black tracking-tight text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            {description}
          </p>
        </div>
        <Link href={actionHref}>
          <Button variant="outline" size="sm">
            {actionLabel}
          </Button>
        </Link>
      </div>

      {items.length ? (
        <div className="mt-4 divide-y divide-[var(--border-subtle)]">
          {items.slice(0, 5).map((item) => (
            <Link
              key={item.processoId ?? item.id ?? item.numeroSirel}
              href={getHref(item)}
              className="flex items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                  {cleanDisplayText(item.numeroSirel) || "Processo sem número"}
                </p>
                <p className="mt-1 line-clamp-1 text-sm text-[var(--text-secondary)]">
                  {cleanDisplayText(item.objeto) || cleanDisplayText(item.secretaria) || "Sem descrição cadastrada"}
                </p>
              </div>
              <span className="hidden rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] sm:inline-flex">
                {cleanDisplayText(item.etapaAtual) || "Abrir"}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <ContextEmptyState
            title={emptyTitle}
            description={emptyDescription}
            actionHref={actionHref}
            actionLabel={actionLabel}
          />
        </div>
      )}
    </section>
  );
}

function LicitacaoHome({ subsystem }: { subsystem: SubsystemDefinition }) {
  const summaryQuery = trpc.licitacao.summary.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });
  const data = summaryQuery.data;

  const metrics: HomeMetric[] = data
    ? [
        {
          id: "total",
          label: "Em licitação",
          value: formatIntegerBR(data.total),
          description: "Processos atualmente na fase externa.",
          icon: "ScrollText",
        },
        {
          id: "publicados",
          label: "Publicados",
          value: formatIntegerBR(data.publicados),
          description: "Processos com publicidade registrada.",
          icon: "FileText",
          tone: "success",
        },
        {
          id: "aguardando",
          label: "Aguardando",
          value: formatIntegerBR(data.aguardandoPublicacao),
          description: "Processos sem publicação registrada.",
          icon: "BellRing",
          tone: "warning",
        },
        {
          id: "recursos",
          label: "Recursos",
          value: formatIntegerBR(data.recursosPendentes),
          description: "Recursos pendentes de tratamento.",
          icon: "Activity",
          tone: "danger",
        },
      ]
    : [];

  return (
    <SubsystemHomeFrame subsystem={subsystem}>
      <MetricGrid metrics={metrics} loading={summaryQuery.isLoading} />
      {data && data.total === 0 ? (
        <ContextEmptyState
          title="Sem processos em licitação"
          description="Quando houver processos na fase externa, os indicadores desta entrada aparecem aqui."
          actionHref="/licitacao"
          actionLabel="Abrir licitações"
        />
      ) : null}
    </SubsystemHomeFrame>
  );
}

function PlanejamentoHome({ subsystem }: { subsystem: SubsystemDefinition }) {
  const listQuery = trpc.planejamento.list.useQuery({}, { retry: false });
  const rows = listQuery.data ?? [];
  const metrics: HomeMetric[] = listQuery.data
    ? [
        {
          id: "fila",
          label: "Na fila",
          value: formatIntegerBR(rows.length),
          description: "Processos atualmente em planejamento.",
          icon: "FolderKanban",
        },
        {
          id: "sem-dfd",
          label: "Sem DFD",
          value: formatIntegerBR(rows.filter((item) => !item.dfdId).length),
          description: "Demandas sem documento inicial.",
          icon: "ClipboardList",
          tone: "warning",
        },
        {
          id: "sem-etp",
          label: "Sem ETP",
          value: formatIntegerBR(rows.filter((item) => !item.etpId).length),
          description: "Processos sem estudo técnico.",
          icon: "Search",
        },
        {
          id: "sem-tr",
          label: "Sem TR",
          value: formatIntegerBR(rows.filter((item) => !item.trId).length),
          description: "Processos sem termo de referência.",
          icon: "FileText",
        },
      ]
    : [];

  return (
    <SubsystemHomeFrame subsystem={subsystem}>
      <MetricGrid metrics={metrics} loading={listQuery.isLoading} />
      {!listQuery.isLoading ? (
        <RecentProcessList
          title="Próximos planejamentos"
          description="Atalhos para continuar a primeira pendência documental de cada processo."
          items={rows}
          getHref={(item) => {
            const processoId = item.processoId ?? 0;
            const row = rows.find((current) => current.processoId === processoId);
            if (row && !row.dfdId) return `/planejamento/dfd/${processoId}`;
            if (row && !row.etpId) return `/planejamento/etp/${processoId}`;
            if (row && !row.trId) return `/planejamento/tr/${processoId}`;
            return `/processos/${processoId}`;
          }}
          emptyTitle="Sem processos em planejamento"
          emptyDescription="Quando a fila preparatória receber processos, eles aparecem aqui com o próximo atalho útil."
          actionHref="/planejamento"
          actionLabel="Abrir planejamento"
        />
      ) : null}
    </SubsystemHomeFrame>
  );
}

function ComprasHome({ subsystem }: { subsystem: SubsystemDefinition }) {
  const listQuery = trpc.processos.list.useQuery(
    { page: 1, pageSize: 6, moduloAtual: "COMPRAS", ativo: true },
    { retry: false, placeholderData: (previous) => previous },
  );
  const stuckQuery = trpc.processos.list.useQuery(
    {
      page: 1,
      pageSize: 1,
      moduloAtual: "COMPRAS",
      ativo: true,
      paradosHaMaisDeSeteDias: true,
    },
    { retry: false, placeholderData: (previous) => previous },
  );
  const rows = listQuery.data?.items ?? [];

  const metrics: HomeMetric[] =
    listQuery.data && stuckQuery.data
      ? [
          {
            id: "em-compras",
            label: "Em compras",
            value: formatIntegerBR(listQuery.data.total),
            description: "Processos ativos na etapa de compras.",
            icon: "ShoppingCart",
          },
          {
          id: "parados",
          label: "Parados 7+ dias",
          value: formatIntegerBR(stuckQuery.data.total),
            description: "Processos em compras sem avanço recente.",
            icon: "BellRing",
            tone: "warning",
          },
        ]
      : [];

  return (
    <SubsystemHomeFrame subsystem={subsystem}>
      <MetricGrid
        metrics={metrics}
        loading={listQuery.isLoading || stuckQuery.isLoading}
      />
      {!listQuery.isLoading ? (
        <RecentProcessList
          title="Processos em compras"
          description="Primeiros processos da fila ativa para conferir consolidação e pendências."
          items={rows}
          getHref={(item) => `/processos/${item.id ?? 0}`}
          emptyTitle="Sem processos em compras"
          emptyDescription="Quando houver processos nesta etapa, a fila de compras aparece aqui."
          actionHref="/compras"
          actionLabel="Abrir compras"
        />
      ) : null}
    </SubsystemHomeFrame>
  );
}

function AdminHome({ subsystem }: { subsystem: SubsystemDefinition }) {
  const usersQuery = trpc.usuarios.list.useQuery(undefined, { retry: false });
  const auditQuery = trpc.auditoria.summary.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });
  const paramsQuery = trpc.parametros.listar.useQuery(
    { apenasAtivos: true },
    { retry: false },
  );
  const users = usersQuery.data ?? [];
  const audit = auditQuery.data;
  const params = paramsQuery.data ?? [];

  const metrics: HomeMetric[] =
    usersQuery.data && audit && paramsQuery.data
      ? [
          {
          id: "usuarios",
            label: "Usuários",
            value: formatIntegerBR(users.length),
            description: "Usuários cadastrados no ambiente.",
            icon: "Users",
          },
          {
          id: "ativos",
          label: "Ativos",
          value: formatIntegerBR(users.filter((item) => item.ativo).length),
            description: "Usuários ativos neste momento.",
            icon: "ShieldCheck",
            tone: "success",
          },
          {
            id: "eventos-hoje",
            label: "Eventos hoje",
            value: formatIntegerBR(audit.hoje),
            description: "Registros de auditoria criados hoje.",
            icon: "History",
          },
          {
          id: "parametros",
            label: "Parâmetros",
            value: formatIntegerBR(params.length),
            description: "Parâmetros ativos retornados pela consulta.",
            icon: "Settings2",
          },
        ]
      : [];

  return (
    <SubsystemHomeFrame subsystem={subsystem}>
      <MetricGrid
        metrics={metrics}
        loading={usersQuery.isLoading || auditQuery.isLoading || paramsQuery.isLoading}
      />

      <section className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-[var(--font-heading)] text-xl font-black tracking-tight text-[var(--text-primary)]">
              Auditoria recente
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              Últimas alterações rastreáveis retornadas pela consulta de auditoria.
            </p>
          </div>
          <Link href="/auditoria">
            <Button variant="outline" size="sm">
              Abrir auditoria
            </Button>
          </Link>
        </div>

        {auditQuery.isLoading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-[20px]" />
            ))}
          </div>
        ) : audit?.recent.length ? (
          <div className="mt-4 divide-y divide-[var(--border-subtle)]">
            {audit.recent.map((item) => (
              <div key={item.id} className="py-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {cleanDisplayText(item.descricao) || item.tabela}
                  </p>
                  <span className="text-xs font-semibold text-[var(--text-muted)]">
                    {formatShortDateTimeBR(item.criadoEm)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {item.usuarioNome ?? "Usuário não identificado"} - {item.acao}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <ContextEmptyState
              title="Sem eventos recentes"
              description="A trilha de auditoria recente será exibida assim que houver alterações rastreáveis."
              actionHref="/auditoria"
              actionLabel="Abrir auditoria"
            />
          </div>
        )}
      </section>
    </SubsystemHomeFrame>
  );
}

function GenericSubsystemHome({
  subsystem,
}: {
  subsystem: SubsystemDefinition;
}) {
  const summaryQuery = trpc.dashboard.summary.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });

  const metrics: HomeMetric[] = summaryQuery.data
    ? [
        {
          id: "processos",
          label: "Processos ativos",
          value: formatIntegerBR(summaryQuery.data.processosAtivos),
          description: "Visão geral reaproveitada do dashboard.",
          icon: "ClipboardList",
        },
        {
          id: "contratos",
          label: "Contratos",
          value: formatIntegerBR(summaryQuery.data.contratosVigentes),
          description: "Contratos vigentes no panorama geral.",
          icon: "Landmark",
        },
        {
          id: "prazos-hoje",
          label: "Prazos hoje",
          value: formatIntegerBR(summaryQuery.data.prazosHoje),
          description: "Compromissos previstos para hoje.",
          icon: "CalendarCheck",
        },
      ]
    : [];

  return (
    <SubsystemHomeFrame subsystem={subsystem}>
      <MetricGrid metrics={metrics} loading={summaryQuery.isLoading} />
      {!summaryQuery.isLoading && !metrics.length ? (
        <ContextEmptyState
          title={`Sem resumo para ${subsystem.shortTitle}`}
          description="Esta entrada usa atalhos reais do subsistema enquanto uma leitura operacional própria não for necessária."
          actionHref={subsystem.recommendedActions[0]?.href ?? "/"}
          actionLabel={subsystem.recommendedActions[0]?.label ?? "Voltar ao início"}
        />
      ) : null}
    </SubsystemHomeFrame>
  );
}

const homeComponents: Partial<
  Record<SubsystemKey, ComponentType<{ subsystem: SubsystemDefinition }>>
> = {
  licitacao: LicitacaoHome,
  planejamento: PlanejamentoHome,
  compras: ComprasHome,
  admin: AdminHome,
};

export function SubsystemHome({ user }: { user: HomeUser }) {
  const subsystem = useSubsystem();

  if (subsystem.key === "hub") {
    return <HubPage user={user} />;
  }

  const HomeComponent = homeComponents[subsystem.key] ?? GenericSubsystemHome;

  return <HomeComponent subsystem={subsystem} />;
}
