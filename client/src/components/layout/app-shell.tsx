import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3,
  BellRing,
  Boxes,
  ChevronDown,
  Clock3,
  Database,
  FileText,
  FolderKanban,
  FolderOpenDot,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
  Workflow,
  X,
  ShoppingCart,
  Landmark,
  Sparkles,
  LogOut,
} from "lucide-react";

import { appModules } from "@sirel/shared/const";
import type { AuthUser } from "@/lib/auth-session";
import { useRuntimeBranding } from "@/lib/branding";
import { buildGuidedTourSteps, pageSubtitleForLocation, resolveGuidedTourRoleTemplate, roleLabel } from "@/lib/entry-experience";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/layout/command-palette";
import { GuidedTour } from "@/components/layout/guided-tour";

const icons: Record<string, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  notificacoes: BellRing,
  consultas: Search,
  relatorios: BarChart3,
  prazos: Clock3,
  importacoes: RefreshCcw,
  cadastros: Database,
  processos: FolderOpenDot,
  dossie: FileText,
  itens: Boxes,
  planejamento: FolderKanban,
  compras: ShoppingCart,
  licitacao: ScrollText,
  documentos: FileText,
  contratos: Landmark,
  workflow: Workflow,
  auditoria: ShieldCheck,
  parametros: Settings2,
  usuarios: Users,
};

const navGroups = [
  { title: "Visão geral", keys: ["dashboard", "notificacoes"] },
  { title: "Ciclo principal", keys: ["planejamento", "compras", "licitacao", "contratos", "processos", "dossie", "workflow"] },
  { title: "Cadastros e base", keys: ["itens", "importacoes", "cadastros"] },
  { title: "Gestão", keys: ["consultas", "relatorios", "prazos", "auditoria", "documentos"] },
  { title: "Administração", keys: ["usuarios", "parametros"] },
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
  onToggleGroup,
  onToggleCollapse,
  onNavigate,
}: SidebarProps) {
  const moduleMap = useMemo(() => new Map(appModules.map((item) => [item.key, item])), []);

  return (
    <aside
      className={[
        "flex h-screen flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[linear-gradient(180deg,var(--sidebar-bg)_0%,color-mix(in_srgb,var(--sidebar-bg)_92%,black_8%)_100%)]",
        collapsed ? "w-[76px]" : "w-[274px]",
      ].join(" ")}
      data-tour-id="shell-sidebar"
    >
      <div className="flex h-[72px] items-center justify-between border-b border-[var(--sidebar-border)] px-4 lg:h-[102px] lg:py-4">
        {!collapsed ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--text-muted)]">Ambiente SIREL</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-[var(--text-primary)]">{systemName}</h2>
            <small className="text-[11px] text-[var(--text-secondary)]">Teixeira de Freitas</small>
          </div>
        ) : (
          <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-sm font-black tracking-[0.2em] text-[var(--accent-color)]">
            SI
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-[var(--sidebar-border)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--accent-color)]"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-gutter:stable]" style={{ scrollbarWidth: "thin" }}>
        {navGroups.map((group) => {
          const entries = group.keys.map((key) => moduleMap.get(key)).filter((item): item is NonNullable<typeof item> => Boolean(item));
          if (!entries.length) return null;
          const isExpanded = expandedGroups[group.title] ?? true;

          return (
            <section key={group.title} className="mb-4">
              {!collapsed ? (
                <button
                  type="button"
                  onClick={() => onToggleGroup(group.title)}
                  className="mb-1 flex w-full items-center justify-between rounded-[16px] px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] transition hover:bg-[var(--sidebar-hover)] hover:text-[var(--text-secondary)]"
                >
                  <span>{group.title}</span>
                  <ChevronDown className={["h-3.5 w-3.5 transition", isExpanded ? "rotate-0" : "-rotate-90"].join(" ")} />
                </button>
              ) : null}

              <div className={[
                "space-y-1 overflow-hidden transition-all",
                !collapsed && !isExpanded ? "max-h-0 opacity-0" : "max-h-[900px] opacity-100",
              ].join(" ")}>
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
                        "flex items-center rounded-[18px] border px-3 py-2.5 text-sm font-semibold transition",
                        collapsed ? "justify-center" : "gap-3",
                        active
                          ? "border-[var(--accent-color)] bg-[var(--surface-highlight)] text-[var(--accent-color)] shadow-[0_12px_24px_-20px_rgba(61,143,211,0.6)]"
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
          <div className="flex items-center gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-[18px] bg-[var(--accent-color)] text-xs font-black text-[var(--text-inverse)]">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{user.name}</div>
              <div className="truncate text-xs text-[var(--text-secondary)]">{roleLabel(user.role)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-auto border-t border-[var(--sidebar-border)] bg-[var(--bg-surface-2)] px-2 py-3">
          <div className="flex justify-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-[18px] bg-[var(--accent-color)] text-xs font-black text-[var(--text-inverse)]">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export function AppShell({ children, user, onLogout }: AppShellProps) {
  const branding = useRuntimeBranding();
  const [location, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sirel-sidebar-collapsed") === "1";
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(resolveStoredSidebarGroups);
  const [theme, setTheme] = useState<ThemeMode>(resolveStoredTheme);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [tourRestartSignal, setTourRestartSignal] = useState(0);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const notificationsSummary = trpc.notificacoes.summary.useQuery(undefined, {
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const dashboardEntryQuery = trpc.dashboard.entry.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
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
    setUserMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = mobileMenuOpen ? "hidden" : previous;
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener("mousedown", onPointerDown);
    }

    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [userMenuOpen]);

  const pageTitle = resolvePageTitle(location);
  const pageSubtitle = pageSubtitleForLocation(location);
  const headerActions = dashboardEntryQuery.data?.recommendedActions.slice(0, 2) ?? [];
  const guidedTourSteps = buildGuidedTourSteps(location, resolveGuidedTourRoleTemplate(user.role));

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
            onToggleGroup={(groupTitle) => setExpandedGroups((current) => ({ ...current, [groupTitle]: !current[groupTitle] }))}
            onToggleCollapse={() => setCollapsed((value) => !value)}
          />
        </div>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-[120] lg:hidden">
            <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-[var(--surface-overlay)]" onClick={() => setMobileMenuOpen(false)} />
            <div className="relative h-full w-[292px] bg-[var(--sidebar-bg)]">
              <Sidebar
                collapsed={false}
                expandedGroups={expandedGroups}
                location={location}
                unreadNotifications={unreadNotifications}
                systemName={branding.systemName}
                user={user}
                onToggleGroup={(groupTitle) => setExpandedGroups((current) => ({ ...current, [groupTitle]: !current[groupTitle] }))}
                onToggleCollapse={() => setCollapsed(false)}
                onNavigate={() => setMobileMenuOpen(false)}
              />
              <button
                type="button"
                className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-[var(--sidebar-border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        <main className="relative z-0 flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <header className="relative z-[90] shrink-0 border-b border-[var(--header-border)] bg-[color:var(--header-bg)]/96 px-4 py-3 backdrop-blur lg:h-[90px] lg:px-6 lg:py-4">
            <div className="flex flex-wrap items-start justify-between gap-4 lg:h-full lg:items-center">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] lg:hidden"
                  onClick={() => setMobileMenuOpen(true)}
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">Acompanhamento operacional</p>
                  <h1 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">{pageTitle}</h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{pageSubtitle}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="hidden xl:flex items-center gap-2">
                  {headerActions.map((action) => (
                    <Button
                      key={action.id}
                      variant={action.tone === "accent" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLocation(action.href)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>

                <div className="hidden md:block" data-tour-id="shell-command">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCommandPaletteOpen(true)}
                    icon={<Search className="h-4 w-4" />}
                  >
                    Busca rapida
                  </Button>
                </div>
                <div className="md:hidden" data-tour-id="shell-command">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCommandPaletteOpen(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>

                <Link
                  href="/notificacoes"
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--accent-color)]"
                  title="Notificações"
                  data-tour-id="shell-notifications"
                >
                  <BellRing className="h-4 w-4" />
                  {unreadNotifications > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[1.2rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {formatBadgeCount(unreadNotifications)}
                    </span>
                  ) : null}
                </Link>

                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((current) => !current)}
                    className="inline-flex h-10 items-center gap-2 rounded-[18px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                    data-tour-id="shell-user-menu"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-[14px] bg-[var(--accent-color)] text-[11px] font-black text-[var(--text-inverse)]">
                      {user.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="hidden sm:inline">{user.name.split(" ")[0]}</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>

                  {userMenuOpen ? (
                    <div className="absolute left-0 right-auto z-[220] mt-2 w-[min(280px,calc(100vw-1.5rem))] rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-floating)] sm:left-auto sm:right-0">
                      <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
                        <p className="font-semibold text-[var(--text-primary)]">{user.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{roleLabel(user.role)}</p>
                      </div>

                      <div className="mt-3 space-y-2">
                        <button
                          type="button"
                          onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                          className="flex w-full items-center gap-3 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 text-left text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"
                        >
                          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                          <span>{theme === "dark" ? "Usar modo claro" : "Usar modo escuro"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            setTourRestartSignal((current) => current + 1);
                          }}
                          className="flex w-full items-center gap-3 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 text-left text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"
                        >
                          <Sparkles className="h-4 w-4" />
                          <span>Reiniciar tour desta tela</span>
                        </button>
                        <button
                          type="button"
                          onClick={onLogout}
                          className="flex w-full items-center gap-3 rounded-[18px] border border-[var(--danger-color)]/30 bg-[var(--danger-bg)] px-4 py-3 text-left text-sm font-semibold text-[var(--danger-color)] transition hover:border-[var(--danger-color)]/60"
                        >
                          <LogOut className="h-4 w-4" />
                          <span>Sair do sistema</span>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]" style={{ scrollbarWidth: "thin" }}>
            <div className="w-full px-4 py-5 md:px-6 md:py-6">{children}</div>
          </div>
        </main>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        userRole={user.role}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={setLocation}
        onRestartTour={() => setTourRestartSignal((current) => current + 1)}
      />
      <GuidedTour
        steps={guidedTourSteps}
        userId={user.id}
        version={dashboardEntryQuery.data?.tour.version ?? "entry-2026-04"}
        autoStart={Boolean(dashboardEntryQuery.data?.tour.shouldAutoStart) && location === "/"}
        restartSignal={tourRestartSignal}
      />
    </div>
  );
}
