import {
  ArrowRight,
  FileText,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  Search,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { ContextEmptyState } from "@/components/shared/context-empty-state";
import { SectionCard } from "@/components/shared/section-card";
import type { AuthUser } from "@/lib/auth-session";
import {
  buildSubsystemHref,
  getAuthorizedSubsystemsForUser,
  getSubsystemAccessLabel,
} from "@/lib/subsystem-navigation";

const icons: Record<string, LucideIcon> = {
  LayoutDashboard,
  FolderKanban,
  ShoppingCart,
  ScrollText,
  Landmark,
  FileText,
  Workflow,
  Search,
  ShieldCheck,
  Settings2,
};

function resolveIcon(icon: string) {
  return icons[icon] ?? LayoutDashboard;
}

export function HubPage({ user }: { user: AuthUser }) {
  const subsystems = getAuthorizedSubsystemsForUser(user).filter(
    (subsystem) => subsystem.key !== "hub",
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-5 shadow-[var(--shadow-soft)] md:px-7 md:py-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
          Hub de subsistemas
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="font-[var(--font-heading)] text-3xl font-black tracking-[-0.04em] text-[var(--text-primary)]">
              Escolha seu ambiente de trabalho
            </h1>
            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
              Olá, {user.name}. Estes são os subsistemas liberados para o seu
              perfil e matriz de acesso.
            </p>
          </div>
          <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">
              {subsystems.length}
            </span>{" "}
            ambiente{subsystems.length === 1 ? "" : "s"} autorizado
            {subsystems.length === 0 ? "" : "s"}
          </div>
        </div>
      </section>

      {!subsystems.length ? (
        <ContextEmptyState
          title="Nenhum subsistema operacional liberado"
          description="Seu acesso autenticado ao Hub está ativo, mas ainda não há ambientes operacionais associados ao seu usuário."
          actionHref="/"
          actionLabel="Permanecer no Hub"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subsystems.map((subsystem) => {
            const Icon = resolveIcon(subsystem.icon);

            return (
              <SectionCard
                key={subsystem.key}
                title={subsystem.shortTitle}
                description={subsystem.description}
                action={
                  <span className="inline-flex rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    {getSubsystemAccessLabel(subsystem.accessLevel)}
                  </span>
                }
              >
                <div className="space-y-4">
                  <div
                    className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-soft)]"
                    style={{ color: subsystem.accent }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <a
                    href={buildSubsystemHref(subsystem.key, "/")}
                    className="inline-flex h-11 w-full items-center justify-between rounded-2xl px-4 text-sm font-semibold text-white transition hover:brightness-105"
                    style={
                      subsystem.accent
                        ? { backgroundColor: subsystem.accent }
                        : undefined
                    }
                  >
                    Acessar {subsystem.shortTitle}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
