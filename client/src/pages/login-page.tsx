import { useState, type FormEvent } from "react";
import { ArrowRight, Fingerprint, LogIn, ShieldCheck, Workflow } from "lucide-react";

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

const supportItems = [
  {
    icon: ShieldCheck,
    title: "Acesso protegido",
    description: "Autenticação local segura e rastreabilidade por perfil operacional.",
  },
  {
    icon: Workflow,
    title: "Fluxo unificado",
    description: "Planejamento, licitação, contratos e documentos em um só ambiente.",
  },
] as const;

export function LoginPage({ onLogin }: LoginPageProps) {
  const branding = useRuntimeBranding();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="relative min-h-screen overflow-hidden bg-[#09111b] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(93,173,226,0.24),_transparent_38%),radial-gradient(circle_at_80%_18%,_rgba(39,174,96,0.16),_transparent_24%),linear-gradient(180deg,_rgba(9,17,27,0.92)_0%,_rgba(9,17,27,1)_100%)]" />
        <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(148,163,184,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="absolute -left-16 top-20 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl sm:h-64 sm:w-64" />
        <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl sm:h-72 sm:w-72" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid lg:grid-cols-[minmax(400px,500px)_minmax(0,1fr)] lg:items-center lg:gap-8 lg:px-8">
        <section className="order-2 flex lg:order-2 lg:items-center">
          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82)_0%,rgba(15,23,42,0.94)_100%)] shadow-[0_30px_80px_-32px_rgba(2,6,23,0.9)] backdrop-blur-xl">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
            <div className="p-5 sm:p-7 lg:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/95 px-2 py-2 shadow-[0_12px_32px_-18px_rgba(255,255,255,0.65)]">
                    {logoFailed ? (
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-sm font-black tracking-[0.22em] text-slate-950">
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
                    <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-sky-200/80">Ambiente seguro</p>
                    <h1 className="mt-1 font-[var(--font-heading)] text-[2rem] font-black tracking-[-0.04em] text-white sm:text-[2.5rem]">{branding.systemName}</h1>
                  </div>
                </div>
                <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100 sm:inline-flex">
                  Prefeitura
                </div>
              </div>

              <div className="mt-8 max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-200/70">Registro e gestão de licitações</p>
                <h2 className="mt-3 font-[var(--font-heading)] text-3xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-4xl lg:text-[3rem]">
                  Operação institucional mais clara para a rotina do município.
                </h2>
                <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300 sm:text-[15px]">
                  Entrada enxuta, leitura confortável e acesso rápido aos módulos principais do SIREL.
                </p>
              </div>

              <div className="mt-8 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2">
                {supportItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <article key={item.title} className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-4">
                      <div className="mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-sky-200">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">{item.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-300">{item.description}</p>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-5 text-xs leading-6 text-slate-400">
                <p className="font-semibold uppercase tracking-[0.22em] text-slate-300">Identidade institucional</p>
                <p>{branding.prefeituraLines[1]}</p>
                <p>{branding.prefeituraLines[2]}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="order-1 flex lg:order-1 lg:items-center">
          <div className="w-full rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,20,32,0.9)_0%,rgba(10,18,29,0.98)_100%)] shadow-[0_30px_80px_-32px_rgba(2,6,23,0.9)] backdrop-blur-xl">
            <div className="border-b border-white/8 px-5 py-5 sm:px-7 sm:py-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100">
                <Fingerprint className="h-3.5 w-3.5" />
                Login institucional
              </div>
              <h2 className="mt-4 font-[var(--font-heading)] text-2xl font-black tracking-[-0.03em] text-white sm:text-[2rem]">
                Entrar no painel operacional
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-slate-300">
                Acesse o {branding.systemName} com seu login institucional.
              </p>
            </div>

            <div className="px-5 py-5 sm:px-7 sm:py-6">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <FormField
                  label="Usuário ou e-mail"
                  description="Informe o login institucional ou e-mail cadastrado no sistema."
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
                  description="O acesso é auditado e vinculado ao seu perfil operacional."
                  className="text-slate-100"
                >
                  <Input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Digite sua senha"
                    className="h-12 rounded-[20px] border-white/10 bg-white/[0.04] px-4 text-white placeholder:text-slate-500 focus:border-sky-300/40"
                  />
                </FormField>

                {mutation.error ? <Alert variant="error">{mutation.error.message}</Alert> : null}

                <Button
                  type="submit"
                  size="lg"
                  className="mt-2 h-12 w-full rounded-[20px] bg-[linear-gradient(135deg,var(--brand-primary)_0%,#76c8ff_100%)] text-slate-950 shadow-[0_20px_40px_-24px_rgba(93,173,226,0.95)] hover:brightness-105"
                  disabled={mutation.isPending}
                >
                  <LogIn className="h-4 w-4" />
                  {mutation.isPending ? "Validando acesso..." : "Entrar no sistema"}
                </Button>
              </form>

              <div className="mt-6 flex flex-col gap-3 border-t border-white/8 pt-5 text-xs leading-6 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-sm">Todos os acessos são registrados para segurança e auditoria.</p>
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
