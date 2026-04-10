import { Suspense, lazy, useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";

import { AppShell } from "@/components/layout/app-shell";
import { SectionSkeleton } from "@/components/shared/section-skeleton";
import {
  clearStoredSession,
  loadStoredSession,
  saveStoredSession,
  type AuthSession,
} from "@/lib/auth-session";
import { queryClient } from "@/lib/query-client";
import { trpc, trpcClient } from "@/lib/trpc";

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
const DashboardPage = lazy(() =>
  import("@/pages/dashboard-page").then((module) => ({
    default: module.DashboardPage,
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
const LoginPage = lazy(() =>
  import("@/pages/login-page").then((module) => ({
    default: module.LoginPage,
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
const NotFoundPage = lazy(() =>
  import("@/pages/not-found-page").then((module) => ({
    default: module.NotFoundPage,
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

function RouteFallback() {
  return (
    <div className="space-y-4">
      <SectionSkeleton hero cards={3} rows={3} />
    </div>
  );
}

function PreparingSessionScreen({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-[var(--surface-base)] px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-[32px] border border-[var(--border-soft-contrast)] bg-[var(--surface-hero)] px-6 py-7 text-white shadow-[var(--shadow-floating)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-sky-100/72">Entrada segura</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-black tracking-[-0.05em]">Preparando seu painel</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">{label}</p>
        </div>
        <SectionSkeleton hero cards={4} rows={4} />
      </div>
    </div>
  );
}

function AuthenticatedApp({
  session,
  onLogout,
}: {
  session: AuthSession;
  onLogout: () => void;
}) {
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });
  const dashboardEntryQuery = trpc.dashboard.entry.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });
  const dashboardSummaryQuery = trpc.dashboard.summary.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });
  const notificationsSummaryQuery = trpc.notificacoes.summary.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (meQuery.error) {
      onLogout();
    }
  }, [meQuery.error, onLogout]);

  if (
    meQuery.isLoading ||
    dashboardEntryQuery.isLoading ||
    dashboardSummaryQuery.isLoading ||
    notificationsSummaryQuery.isLoading
  ) {
    return (
      <PreparingSessionScreen label="Validando sessão, sincronizando notificações e carregando os dados centrais da sua entrada operacional." />
    );
  }

  const user = meQuery.data?.user ?? session.user;

  return (
    <AppShell user={user} onLogout={onLogout}>
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/dossie/item/:itemId">
            {(params) => <DossieItemPage itemId={Number(params.itemId)} />}
          </Route>
          <Route path="/dossie/item">{() => <DossieItemPage />}</Route>
          <Route path="/dossie/fornecedor/:fornecedorId">
            {(params) => (
              <DossieFornecedorPage
                fornecedorId={Number(params.fornecedorId)}
              />
            )}
          </Route>
          <Route path="/dossie/fornecedor">
            {() => <DossieFornecedorPage />}
          </Route>
          <Route path="/dossie/:processoId">
            {(params) => <DossiePage processoId={Number(params.processoId)} />}
          </Route>
          <Route path="/dossie">{() => <DossiePage />}</Route>
          <Route path="/notificacoes" component={NotificacoesPage} />
          <Route path="/consultas" component={ConsultasPage} />
          <Route path="/relatorios" component={RelatoriosPage} />
          <Route path="/prazos" component={PrazosPage} />
          <Route path="/importacoes" component={ImportacoesPage} />
          <Route path="/cadastros" component={CadastrosPage} />
          <Route path="/planejamento/dfd/:processoId">
            {(params) => (
              <PlanejamentoDfdPage processoId={Number(params.processoId)} />
            )}
          </Route>
          <Route path="/planejamento/etp/:processoId">
            {(params) => (
              <PlanejamentoEtpPage processoId={Number(params.processoId)} />
            )}
          </Route>
          <Route path="/planejamento/cotacoes/:processoId">
            {(params) => (
              <PlanejamentoCotacoesPage
                processoId={Number(params.processoId)}
              />
            )}
          </Route>
          <Route path="/planejamento/tr/:processoId">
            {(params) => (
              <PlanejamentoTrPage processoId={Number(params.processoId)} />
            )}
          </Route>
          <Route path="/itens" component={ItensPage} />
          <Route path="/planejamento" component={PlanejamentoPage} />
          <Route path="/compras" component={ComprasPage} />
          <Route path="/processos/:processoId">
            {(params) => (
              <ProcessosPage processoId={Number(params.processoId)} />
            )}
          </Route>
          <Route path="/processos">{() => <ProcessosPage />}</Route>
          <Route path="/licitacao/:processoId">
            {(params) => (
              <LicitacaoProcessoPage processoId={Number(params.processoId)} />
            )}
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
  const [session, setSession] = useState<AuthSession | null>(() =>
    loadStoredSession(),
  );
  const [preparingLogin, setPreparingLogin] = useState(false);

  function handleLogin(nextSession: AuthSession) {
    saveStoredSession(nextSession);
    setPreparingLogin(true);
    setSession(nextSession);
  }

  function handleLogout() {
    clearStoredSession();
    queryClient.clear();
    setPreparingLogin(false);
    setSession(null);
  }

  useEffect(() => {
    if (session) {
      setPreparingLogin(false);
    }
  }, [session]);

  if (!session) {
    if (preparingLogin) {
      return (
        <PreparingSessionScreen label="Autenticando e organizando seu ambiente inicial antes de liberar o acesso ao SIREL." />
      );
    }
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
