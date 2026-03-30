import { Suspense, lazy, useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";

import { AppShell } from "@/components/layout/app-shell";
import { clearStoredSession, loadStoredSession, saveStoredSession, type AuthSession } from "@/lib/auth-session";
import { queryClient } from "@/lib/query-client";
import { trpc, trpcClient } from "@/lib/trpc";

const AuditoriaPage = lazy(() => import("@/pages/auditoria-page").then((module) => ({ default: module.AuditoriaPage })));
const CadastrosPage = lazy(() => import("@/pages/cadastros-page").then((module) => ({ default: module.CadastrosPage })));
const ContratosPage = lazy(() => import("@/pages/contratos-page").then((module) => ({ default: module.ContratosPage })));
const ConsultasPage = lazy(() => import("@/pages/consultas-page").then((module) => ({ default: module.ConsultasPage })));
const DashboardPage = lazy(() => import("@/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })));
const DocumentosPage = lazy(() => import("@/pages/documentos-page").then((module) => ({ default: module.DocumentosPage })));
const ImportacoesPage = lazy(() => import("@/pages/importacoes-page").then((module) => ({ default: module.ImportacoesPage })));
const ItensPage = lazy(() => import("@/pages/itens-page").then((module) => ({ default: module.ItensPage })));
const LoginPage = lazy(() => import("@/pages/login-page").then((module) => ({ default: module.LoginPage })));
const LicitacaoPage = lazy(() => import("@/pages/licitacao-page").then((module) => ({ default: module.LicitacaoPage })));
const LicitacaoProcessoPage = lazy(() =>
  import("@/pages/licitacao-processo-page").then((module) => ({ default: module.LicitacaoProcessoPage })),
);
const NotificacoesPage = lazy(() =>
  import("@/pages/notificacoes-page").then((module) => ({ default: module.NotificacoesPage })),
);
const NotFoundPage = lazy(() => import("@/pages/not-found-page").then((module) => ({ default: module.NotFoundPage })));
const ParametrosPage = lazy(() => import("@/pages/parametros-page").then((module) => ({ default: module.ParametrosPage })));
const PlanejamentoCotacoesPage = lazy(() =>
  import("@/pages/planejamento-cotacoes-page").then((module) => ({ default: module.PlanejamentoCotacoesPage })),
);
const PlanejamentoDfdPage = lazy(() =>
  import("@/pages/planejamento-dfd-page").then((module) => ({ default: module.PlanejamentoDfdPage })),
);
const PlanejamentoEtpPage = lazy(() =>
  import("@/pages/planejamento-etp-page").then((module) => ({ default: module.PlanejamentoEtpPage })),
);
const PlanejamentoTrPage = lazy(() =>
  import("@/pages/planejamento-tr-page").then((module) => ({ default: module.PlanejamentoTrPage })),
);
const PlanejamentoPage = lazy(() => import("@/pages/planejamento-page").then((module) => ({ default: module.PlanejamentoPage })));
const PrazosPage = lazy(() => import("@/pages/prazos-page").then((module) => ({ default: module.PrazosPage })));
const ProcessosPage = lazy(() => import("@/pages/processos-page").then((module) => ({ default: module.ProcessosPage })));
const RelatoriosPage = lazy(() => import("@/pages/relatorios-page").then((module) => ({ default: module.RelatoriosPage })));
const UsuariosPage = lazy(() => import("@/pages/usuarios-page").then((module) => ({ default: module.UsuariosPage })));
const WorkflowPage = lazy(() => import("@/pages/workflow-page").then((module) => ({ default: module.WorkflowPage })));

function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-soft)] px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">Em estruturação</p>
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-black tracking-tight text-[var(--text-primary)]">{title}</h2>
      </div>
      <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="space-y-4">
          <p className="max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
            Este módulo entra na próxima rodada de detalhamento visual do SIREL. Mantivemos a navegação, o shell operacional
            e a identidade nova prontos para a continuidade sem quebrar o restante do sistema.
          </p>
          <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">O que já está garantido</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
              <li>Shell responsivo com sidebar fixa e conteúdo rolando separadamente.</li>
              <li>Tema claro/escuro consistente com a nova identidade institucional.</li>
              <li>Base pronta para receber filtros, KPIs, tabelas e painéis específicos do módulo.</li>
            </ul>
          </div>
        </div>
        <aside className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Próxima etapa</p>
          <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
            Estruturar a superfície operacional de {title.toLowerCase()} com visão executiva, filtros rápidos, lista principal
            e ações contextuais integradas ao restante da jornada.
          </p>
        </aside>
      </div>
    </section>
  );
}

function RouteFallback() {
  return (
    <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 text-sm text-[var(--color-neutral-600)] shadow-[var(--shadow-card)]">
      Carregando módulo...
    </div>
  );
}

function AuthenticatedApp({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (meQuery.error) {
      onLogout();
    }
  }, [meQuery.error, onLogout]);

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-base)]">
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-6 py-5 text-sm text-[var(--color-neutral-600)] shadow-[var(--shadow-card)]">
          Validando sessão...
        </div>
      </div>
    );
  }

  const user = meQuery.data?.user ?? session.user;

  return (
    <AppShell user={user} onLogout={onLogout}>
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/notificacoes" component={NotificacoesPage} />
          <Route path="/consultas" component={ConsultasPage} />
          <Route path="/relatorios" component={RelatoriosPage} />
          <Route path="/prazos" component={PrazosPage} />
          <Route path="/importacoes" component={ImportacoesPage} />
          <Route path="/cadastros" component={CadastrosPage} />
          <Route path="/planejamento/dfd/:processoId">
            {(params) => <PlanejamentoDfdPage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/planejamento/etp/:processoId">
            {(params) => <PlanejamentoEtpPage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/planejamento/cotacoes/:processoId">
            {(params) => <PlanejamentoCotacoesPage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/planejamento/tr/:processoId">
            {(params) => <PlanejamentoTrPage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/itens" component={ItensPage} />
          <Route path="/planejamento" component={PlanejamentoPage} />
          <Route path="/compras">{() => <PlaceholderPage title="Módulo de Compras" />}</Route>
          <Route path="/processos/:processoId">
            {(params) => <ProcessosPage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/processos">{() => <ProcessosPage />}</Route>
          <Route path="/licitacao/:processoId">
            {(params) => <LicitacaoProcessoPage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/licitacao" component={LicitacaoPage} />
          <Route path="/documentos" component={DocumentosPage} />
          <Route path="/contratos" component={ContratosPage} />
          <Route path="/workflow" component={WorkflowPage} />
          <Route path="/auditoria" component={AuditoriaPage} />
          <Route path="/parametros" component={ParametrosPage} />
          <Route path="/usuarios" component={UsuariosPage} />
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    </AppShell>
  );
}

function AppContent() {
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());

  function handleLogin(nextSession: AuthSession) {
    saveStoredSession(nextSession);
    setSession(nextSession);
  }

  function handleLogout() {
    clearStoredSession();
    queryClient.clear();
    setSession(null);
  }

  if (!session) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <LoginPage onLogin={handleLogin} />
      </Suspense>
    );
  }

  return <AuthenticatedApp session={session} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

