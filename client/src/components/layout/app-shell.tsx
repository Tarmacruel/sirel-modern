import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  Bell,
  BellRing,
  Boxes,
  ChevronDown,
  Clock3,
  Database,
  FileText,
  FolderKanban,
  FolderOpenDot,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sun,
  RefreshCcw,
  Users,
  Workflow,
  X,
} from "lucide-react";

import { appModules } from "@sirel/shared/const";
import type { AuthUser } from "@/lib/auth-session";
import { useRuntimeBranding } from "@/lib/branding";
import { trpc } from "@/lib/trpc";

const icons: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  notificacoes: BellRing,
  consultas: Search,
  relatorios: BarChart3,
  prazos: Clock3,
  importacoes: RefreshCcw,
  cadastros: Database,
  processos: FolderOpenDot,
  itens: Boxes,
  planejamento: FolderKanban,
  compras: ListTodo,
  licitacao: ScrollText,
  documentos: FileText,
  contratos: Bell,
  workflow: Workflow,
  auditoria: ShieldCheck,
  parametros: Settings2,
  usuarios: Users,
};

const navGroups = [
  { title: "Visão Geral", keys: ["dashboard", "notificacoes"] },
  { title: "Operacional", keys: ["planejamento", "compras", "licitacao", "contratos", "processos", "workflow"] },
  { title: "Cadastros", keys: ["itens", "importacoes", "cadastros"] },
  { title: "Gestão", keys: ["consultas", "relatorios", "prazos", "auditoria", "documentos"] },
  { title: "Admin", keys: ["usuarios", "parametros"] },
] as const;

type ThemeMode = "light" | "dark";
const themeStorageKey = "sirel-theme";
const sidebarGroupsStorageKey = "sirel-sidebar-groups";

interface AppShellProps extends PropsWithChildren {
  user: AuthUser;
  onLogout: () => void;
}

interface SidebarProps {
  collapsed: boolean;
  expandedGroups: Record<string, boolean>;
  location: string;
  unreadNotifications: number;
  systemName: string;
  user: AuthUser;
  onLogout: () => void;
  onToggleGroup: (groupTitle: string) => void;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
}

function formatBadgeCount(value: number) {
  if (value > 99) return "99+";
  return String(value);
}

function resolveStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(themeStorageKey);
  if (saved === "dark" || saved === "light") {
    return saved;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function buildDefaultGroupState() {
  return Object.fromEntries(navGroups.map((group) => [group.title, true])) as Record<string, boolean>;
}

function resolveStoredSidebarGroups() {
  if (typeof window === "undefined") return buildDefaultGroupState();
  const saved = window.localStorage.getItem(sidebarGroupsStorageKey);
  if (!saved) return buildDefaultGroupState();

  try {
    const parsed = JSON.parse(saved) as Record<string, boolean>;
    return { ...buildDefaultGroupState(), ...parsed };
  } catch {
    return buildDefaultGroupState();
  }
}

function resolvePageTitle(location: string) {
  const current = appModules.find((item) => {
    if (item.href === "/") return location === "/";
    return location === item.href || location.startsWith(`${item.href}/`);
  });

  return current?.label ?? "SIREL";
}

function Sidebar({
  collapsed,
  expandedGroups,
  location,
  unreadNotifications,
  systemName,
  user,
  onLogout,
  onToggleGroup,
  onToggleCollapse,
  onNavigate,
}: SidebarProps) {
  const moduleMap = useMemo(() => new Map(appModules.map((item) => [item.key, item])), []);

  return (
    <aside
      className={[
        "flex h-screen flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]",
        collapsed ? "w-[70px]" : "w-[260px]",
      ].join(" ")}
    >
      <div className="flex h-[60px] items-center justify-between border-b border-[var(--sidebar-border)] px-4">
        {!collapsed ? (
          <div>
            <h2 className="m-0 text-lg font-bold tracking-tight text-[var(--text-primary)]">{systemName}</h2>
            <small className="text-[11px] text-[var(--text-secondary)]">Teixeira de Freitas</small>
          </div>
        ) : (
          <div className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-color)] text-sm font-bold text-[var(--text-inverse)]">
            SI
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--sidebar-border)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)]"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-gutter:stable]"
        style={{ scrollbarWidth: "thin" }}
      >
        {navGroups.map((group) => {
          const entries = group.keys
            .map((key) => moduleMap.get(key))
            .filter((item): item is NonNullable<typeof item> => Boolean(item));

          if (!entries.length) return null;
          const isExpanded = expandedGroups[group.title] ?? true;

          return (
            <section key={group.title} className="mb-4">
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => onToggleGroup(group.title)}
                  className="mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] transition hover:bg-[var(--sidebar-hover)] hover:text-[var(--text-secondary)]"
                >
                  <span>{group.title}</span>
                  <ChevronDown className={["h-3 w-3 transition", isExpanded ? "rotate-0" : "-rotate-90"].join(" ")} />
                </button>
              ) : null}

              <div className={["space-y-1 overflow-hidden transition-all", !collapsed && !isExpanded ? "max-h-0 opacity-0" : "max-h-[800px] opacity-100"].join(" ")}>
                {entries.map((entry) => {
                  const Icon = icons[entry.key] ?? LayoutDashboard;
                  const active = entry.href === "/" ? location === "/" : location === entry.href || location.startsWith(`${entry.href}/`);
                  const isNotification = entry.key === "notificacoes" && unreadNotifications > 0;

                  return (
                    <Link
                      key={entry.key}
                      href={entry.href}
                      onClick={onNavigate}
                      className={[
                        "flex items-center rounded-lg border px-3 py-2 text-sm font-semibold transition",
                        collapsed ? "justify-center" : "gap-2",
                        active
                          ? "border-[var(--accent-color)] bg-[var(--sidebar-active)] text-[var(--accent-color)]"
                          : "border-transparent text-[var(--text-primary)] hover:border-[var(--border-color)] hover:bg-[var(--sidebar-hover)]",
                      ].join(" ")}
                      title={collapsed ? entry.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed ? <span className="flex-1">{entry.label}</span> : null}
                      {isNotification ? (
                        <span className="inline-flex min-w-[1.3rem] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {formatBadgeCount(unreadNotifications)}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {!collapsed ? (
        <div className="mt-auto border-t border-[var(--sidebar-border)] bg-[var(--bg-surface-2)] p-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-color)] text-xs font-bold text-[var(--text-inverse)]">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{user.name}</div>
              <div className="truncate text-xs text-[var(--text-secondary)]">{user.role.toLowerCase()}</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--sidebar-border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:text-[var(--danger-color)]"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-auto border-t border-[var(--sidebar-border)] bg-[var(--bg-surface-2)] px-2 py-3">
          <div className="flex flex-col items-center gap-2">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-color)] text-xs font-bold text-[var(--text-inverse)]">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--sidebar-border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:text-[var(--danger-color)]"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

export function AppShell({ children, user, onLogout }: AppShellProps) {
  const branding = useRuntimeBranding();
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sirel-sidebar-collapsed") === "1";
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(resolveStoredSidebarGroups);
  const [theme, setTheme] = useState<ThemeMode>(resolveStoredTheme);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const notificationsSummary = trpc.notificacoes.summary.useQuery(undefined, {
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const unreadNotifications = notificationsSummary.data?.unread ?? 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sirel-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(sidebarGroupsStorageKey, JSON.stringify(expandedGroups));
  }, [expandedGroups]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(themeStorageKey, theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      const saved = window.localStorage.getItem(themeStorageKey);
      if (saved === "dark" || saved === "light") return;
      setTheme(event.matches ? "dark" : "light");
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = mobileMenuOpen ? "hidden" : previous;
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMenuOpen]);

  const pageTitle = resolvePageTitle(location);

  return (
    <div className="h-screen overflow-hidden bg-[var(--bg-body)] text-[var(--text-primary)]">
      <div className="flex h-screen w-full overflow-hidden">
        <div className="hidden h-screen shrink-0 lg:sticky lg:top-0 lg:block">
          <Sidebar
            collapsed={collapsed}
            expandedGroups={expandedGroups}
            location={location}
            unreadNotifications={unreadNotifications}
            systemName={branding.systemName}
            user={user}
            onLogout={onLogout}
            onToggleGroup={(groupTitle) => setExpandedGroups((current) => ({ ...current, [groupTitle]: !current[groupTitle] }))}
            onToggleCollapse={() => setCollapsed((value) => !value)}
          />
        </div>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-[120] lg:hidden">
            <button
              type="button"
              aria-label="Fechar menu"
              className="absolute inset-0 bg-[var(--surface-overlay)]"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative h-full w-[280px] bg-[var(--sidebar-bg)]">
              <Sidebar
                collapsed={false}
                expandedGroups={expandedGroups}
                location={location}
                unreadNotifications={unreadNotifications}
                systemName={branding.systemName}
                user={user}
                onLogout={onLogout}
                onToggleGroup={(groupTitle) => setExpandedGroups((current) => ({ ...current, [groupTitle]: !current[groupTitle] }))}
                onToggleCollapse={() => setCollapsed(false)}
                onNavigate={() => setMobileMenuOpen(false)}
              />
              <button
                type="button"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--sidebar-border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-[var(--header-border)] bg-[var(--header-bg)] px-4 lg:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] lg:hidden"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <h1 className="m-0 text-base font-bold text-[var(--text-primary)]">{pageTitle}</h1>
                <span className="text-xs text-[var(--text-secondary)]">{branding.systemName} · acompanhamento operacional</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="hidden items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 md:flex">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <input
                  type="search"
                  placeholder="Buscar processo, objeto ou secretaria"
                  className="w-[300px] border-none bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                />
              </label>

              <Link
                href="/notificacoes"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)]"
                title="Notificações"
              >
                <BellRing className="h-4 w-4" />
                {unreadNotifications > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-[1.2rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {formatBadgeCount(unreadNotifications)}
                  </span>
                ) : null}
              </Link>

              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:text-[var(--accent-color)]"
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                title={theme === "dark" ? "Modo Escuro (clique para Claro)" : "Modo Claro (clique para Escuro)"}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </header>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
            style={{ scrollbarWidth: "thin" }}
          >
            <div className="w-full px-4 py-5 md:px-6 md:py-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
