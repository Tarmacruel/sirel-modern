import { useState, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  ArrowRightLeft,
  Archive,
  BadgeDollarSign,
  BellRing,
  CalendarCheck,
  CalendarClock,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Database,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  FolderKanban,
  FolderSearch,
  History,
  Landmark,
  LayoutDashboard,
  LogIn,
  PackageCheck,
  PenLine,
  ScrollText,
  Search,
  SearchCheck,
  Settings2,
  ShieldCheck,
  Sparkles,
  ShoppingCart,
  Upload,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { useSubsystem } from "@/app/subsystem-context";
import type { AuthSession } from "@/lib/auth-session";
import { trpc } from "@/lib/trpc";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useRuntimeBranding } from "@/lib/branding";

interface LoginPageProps {
  onLogin: (session: AuthSession) => void;
}

const iconMap: Record<string, LucideIcon> = {
  Activity,
  ArrowRightLeft,
  Archive,
  BadgeDollarSign,
  BellRing,
  CalendarCheck,
  CalendarClock,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Database,
  FileCheck2,
  FileText,
  FolderKanban,
  FolderSearch,
  History,
  Landmark,
  LayoutDashboard,
  PackageCheck,
  PenLine,
  ScrollText,
  Search,
  SearchCheck,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Upload,
  Users,
  Workflow,
};

function resolveIcon(icon: string) {
  return iconMap[icon] ?? Sparkles;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const branding = useRuntimeBranding();
  const subsystem = useSubsystem();
  const SubsystemIcon = resolveIcon(subsystem.icon);
  const accentColor = subsystem.accent ?? "#5dade2";
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const mutation = trpc.auth.login.useMutation({
    onSuccess: (session) => {
      onLogin(session);
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutation.mutateAsync({ login, password });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#08111d] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(93,173,226,0.26),transparent_34%),radial-gradient(circle_at_78%_14%,rgba(56,189,248,0.15),transparent_22%),linear-gradient(180deg,rgba(8,17,29,0.94)_0%,rgba(8,17,29,1)_100%)]" />
        <div className="absolute inset-0 opacity-[0.15] [background-image:linear-gradient(rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:34px_34px]" />
        <div className="absolute -left-24 top-10 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-300/12 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,460px)] lg:items-stretch lg:gap-8 lg:px-8">
        <section className="order-2 lg:order-1">
          <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,20,33,0.84)_0%,rgba(12,20,33,0.96)_100%)] px-5 py-5 shadow-[0_32px_90px_-34px_rgba(2,6,23,0.92)] backdrop-blur-xl sm:px-7 sm:py-7 lg:px-9 lg:py-9">
            <div
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent"
              style={{ backgroundColor: accentColor }}
            />

            <div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/10 bg-white/95 px-2 py-2 shadow-[0_18px_44px_-26px_rgba(255,255,255,0.66)]">
                    {logoFailed ? (
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] bg-[var(--brand-primary)] text-sm font-black tracking-[0.22em] text-slate-950">
                        TF
                      </span>
                    ) : (
                      <img
                        src={branding.prefeituraLogoUrl}
                        alt="Prefeitura Municipal de Teixeira de Freitas"
                        className="max-h-full w-auto object-contain"
                        onError={() => setLogoFailed(true)}
                      />
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-sky-200/78">
                      {branding.systemName}
                    </p>
                    <h1 className="mt-1 font-[var(--font-heading)] text-[2rem] font-black tracking-[-0.04em] sm:text-[2.4rem]">
                      {subsystem.title}
                    </h1>
                  </div>
                </div>

                <div
                  className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100 sm:inline-flex"
                  style={{ color: accentColor }}
                >
                  <SubsystemIcon className="h-3.5 w-3.5" />
                  {subsystem.shortTitle}
                </div>
              </div>

              <div className="mt-10 max-w-3xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-sky-200/70">
                  Entrada por subsistema
                </p>
                <h2 className="mt-3 font-[var(--font-heading)] text-4xl font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-[3.3rem]">
                  {subsystem.loginTitle}
                </h2>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-[15px]">
                  {subsystem.description}
                </p>
              </div>

              <div className="mt-8 grid gap-4 lg:grid-cols-3">
                {subsystem.loginHighlights.map((item) => {
                  const Icon = resolveIcon(item.icon);
                  return (
                    <article key={item.title} className="rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4">
                      <div
                        className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.05]"
                        style={{ color: accentColor }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <h3 className="mt-4 text-sm font-bold text-white">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 border-t border-white/10 pt-5 text-xs leading-6 text-slate-400">
              <p className="font-semibold uppercase tracking-[0.22em] text-slate-300">Identidade institucional</p>
              <p className="mt-2">{branding.prefeituraLines[1]}</p>
              <p>{branding.prefeituraLines[2]}</p>
              <p>{branding.prefeituraLines[3]}</p>
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <div className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,19,31,0.92)_0%,rgba(10,17,28,0.98)_100%)] shadow-[0_32px_90px_-34px_rgba(2,6,23,0.92)] backdrop-blur-xl">
            <div className="border-b border-white/8 px-5 py-5 sm:px-7 sm:py-6">
              <div
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100"
                style={{ color: accentColor }}
              >
                <SubsystemIcon className="h-3.5 w-3.5" />
                Login {subsystem.shortTitle}
              </div>
              <h2 className="mt-4 font-[var(--font-heading)] text-[2rem] font-black tracking-[-0.04em] text-white">
                {subsystem.loginTitle}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-slate-300">
                {subsystem.loginSubtitle}
              </p>
            </div>

            <div className="px-5 py-5 sm:px-7 sm:py-6">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <FormField
                  label="Usuário"
                  description={`Use seu login institucional para acessar ${subsystem.shortTitle}.`}
                  className="text-slate-100"
                >
                  <Input
                    required
                    autoFocus
                    autoComplete="username"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    placeholder="seu.usuario"
                    className="h-12 rounded-[20px] border-white/10 bg-white/[0.04] px-4 text-white placeholder:text-slate-500 focus:border-sky-300/40"
                  />
                </FormField>

                <FormField
                  label="Senha"
                  description="Seu acesso fica vinculado ao perfil operacional e à trilha de auditoria."
                  className="text-slate-100"
                >
                  <div className="relative">
                    <Input
                      required
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Digite sua senha"
                      className="h-12 rounded-[20px] border-white/10 bg-white/[0.04] px-4 pr-12 text-white placeholder:text-slate-500 focus:border-sky-300/40"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.04] text-slate-300 transition hover:text-white"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormField>

                {mutation.error ? (
                  <Alert variant="error" title="Falha no acesso">
                    {mutation.error.message}
                  </Alert>
                ) : null}

                <Button
                  type="submit"
                  size="lg"
                  className="mt-2 h-12 w-full rounded-[20px] bg-[linear-gradient(135deg,var(--brand-primary)_0%,#82d5ff_100%)] text-slate-950 shadow-[0_20px_44px_-24px_rgba(93,173,226,0.95)] hover:brightness-105"
                  style={{
                    background: `linear-gradient(135deg, ${accentColor} 0%, #82d5ff 100%)`,
                  }}
                  disabled={mutation.isPending}
                >
                  <LogIn className="h-4 w-4" />
                  {mutation.isPending ? "Preparando acesso..." : `Entrar em ${subsystem.shortTitle}`}
                </Button>
              </form>

              <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm leading-6 text-slate-300">
                <p className="font-semibold text-white">Antes de entrar</p>
                <p className="mt-2">
                  Este ambiente abre uma visão focada em {subsystem.shortTitle}, mantendo a mesma autenticação e a sessão auditada do SIREL.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t border-white/8 pt-5 text-xs leading-6 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-sm">Todos os acessos são registrados para segurança e auditoria institucional.</p>
                <div className="inline-flex items-center gap-2 text-sky-100/80">
                  <span>Ambiente autenticado</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
