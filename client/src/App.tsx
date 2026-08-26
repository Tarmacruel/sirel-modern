import { Suspense, lazy, useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";

import {
  NotFoundOrDeniedPage,
  renderAppRoute,
  useAllowedRoutes,
} from "@/app/routes";
import { SubsystemProvider } from "@/app/subsystem-context";
import { IdentityProfileCompletionModal } from "@/components/auth/identity-profile-completion-modal";
import { AppShell } from "@/components/layout/app-shell";
import { SectionSkeleton } from "@/components/shared/section-skeleton";
import {
  clearStoredSession,
  loadStoredSession,
  normalizeAuthSession,
  saveStoredSession,
  type AuthSession,
} from "@/lib/auth-session";
import { queryClient } from "@/lib/query-client";
import { trpc, trpcClient } from "@/lib/trpc";

const LoginPage = lazy(() =>
  import("@/pages/login-page").then((module) => ({
    default: module.LoginPage,
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
  onSessionUpdate,
}: {
  session: AuthSession;
  onLogout: () => void;
  onSessionUpdate: (session: AuthSession) => void;
}) {
  const utils = trpc.useUtils();
  const [identityDismissed, setIdentityDismissed] = useState(false);
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
  const user = meQuery.data?.user
    ? normalizeAuthSession({ user: meQuery.data.user }).user
    : session.user;
  const allowedRoutes = useAllowedRoutes({ user });
  const showIdentityModal =
    Boolean(user.requiresIdentityCompletion) &&
    (user.identityCompletionMode === "REQUIRED" || !identityDismissed);

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

  return (
    <>
      <AppShell user={user} onLogout={onLogout}>
        <Suspense fallback={<RouteFallback />}>
          <Switch>
            {allowedRoutes.map((route) => (
              <Route key={route.id} path={route.path}>
                {(params) => renderAppRoute(route, params, { user })}
              </Route>
            ))}
            <Route component={NotFoundOrDeniedPage} />
          </Switch>
        </Suspense>
      </AppShell>
      <IdentityProfileCompletionModal
        open={showIdentityModal}
        user={user}
        onDismiss={() => setIdentityDismissed(true)}
        onLogout={onLogout}
        onCompleted={(nextUser) => {
          const nextSession = normalizeAuthSession({ ...session, user: nextUser });
          saveStoredSession(nextSession);
          onSessionUpdate(nextSession);
          setIdentityDismissed(false);
          void utils.auth.me.invalidate();
        }}
      />
    </>
  );
}

function AppContent() {
  const [session, setSession] = useState<AuthSession | null>(() =>
    loadStoredSession(),
  );
  const [preparingLogin, setPreparingLogin] = useState(false);
  const cookieSessionQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !session,
    retry: false,
    staleTime: 60_000,
  });
  const logoutMutation = trpc.auth.logout.useMutation();

  function handleLogin(nextSession: AuthSession) {
    saveStoredSession(normalizeAuthSession(nextSession));
    setPreparingLogin(true);
    setSession(normalizeAuthSession(nextSession));
  }

  async function handleLogout() {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // A limpeza local continua mesmo se a chamada remota falhar.
    }
    clearStoredSession();
    queryClient.clear();
    setPreparingLogin(false);
    setSession(null);
  }

  useEffect(() => {
    if (session || !cookieSessionQuery.data?.user) return;

    const nextSession = normalizeAuthSession({ user: cookieSessionQuery.data.user });
    saveStoredSession(nextSession);
    setSession(nextSession);
  }, [cookieSessionQuery.data, session]);

  useEffect(() => {
    if (session) {
      setPreparingLogin(false);
    }
  }, [session]);

  if (!session) {
    if (preparingLogin || cookieSessionQuery.isLoading) {
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

  return <AuthenticatedApp session={session} onLogout={handleLogout} onSessionUpdate={setSession} />;
}

export default function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SubsystemProvider>
          <AppContent />
        </SubsystemProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
