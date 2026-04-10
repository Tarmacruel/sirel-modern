import {
  BarChart3,
  BellRing,
  Boxes,
  Database,
  FileText,
  FolderKanban,
  FolderOpenDot,
  LayoutDashboard,
  RefreshCcw,
  ScrollText,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  Workflow,
  Clock3,
  ShoppingCart,
  Landmark,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type { CommandPaletteItem, EntryActionIconKey } from "@/lib/entry-experience";
import { roleLabel } from "@/lib/entry-experience";
import { Modal } from "@/components/shared/modal";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

const iconMap: Record<EntryActionIconKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  processos: FolderOpenDot,
  consultas: Search,
  prazos: Clock3,
  planejamento: FolderKanban,
  compras: ShoppingCart,
  licitacao: ScrollText,
  contratos: Landmark,
  relatorios: BarChart3,
  usuarios: Users,
  parametros: Settings2,
  auditoria: ShieldCheck,
  notificacoes: BellRing,
  dossie: FileText,
  workflow: Workflow,
  importacoes: RefreshCcw,
  cadastros: Database,
};

interface CommandPaletteProps {
  open: boolean;
  userRole: string;
  onClose: () => void;
  onNavigate: (href: string) => void;
  onRestartTour: () => void;
}

function buildStaticItems(userRole: string): CommandPaletteItem[] {
  const common: CommandPaletteItem[] = [
    {
      id: "module-dashboard",
      label: "Dashboard",
      description: "Voltar para a entrada operacional do sistema.",
      href: "/",
      iconKey: "dashboard",
      group: "Módulos",
      keywords: ["home", "inicio", "painel"],
    },
    {
      id: "module-processos",
      label: "Processos",
      description: "Abrir a base transversal de processos do SIREL.",
      href: "/processos",
      iconKey: "processos",
      group: "Módulos",
      keywords: ["sirel", "numero", "objeto"],
    },
    {
      id: "module-consultas",
      label: "Consultas",
      description: "Busca central por processo, fornecedor ou edital.",
      href: "/consultas",
      iconKey: "consultas",
      group: "Módulos",
      keywords: ["buscar", "pesquisa"],
    },
    {
      id: "module-notificacoes",
      label: "Notificações",
      description: "Abrir a central de notificações e pendências.",
      href: "/notificacoes",
      iconKey: "notificacoes",
      group: "Módulos",
      keywords: ["alertas", "mensagens"],
    },
  ];

  const byRole: Record<string, CommandPaletteItem[]> = {
    operador: [
      {
        id: "module-planejamento",
        label: "Planejamento",
        description: "Retomar DFD, ETP, cotação preliminar e TR.",
        href: "/planejamento",
        iconKey: "planejamento",
        group: "Ações rápidas",
        keywords: ["dfd", "etp", "tr"],
      },
      {
        id: "module-compras",
        label: "Compras",
        description: "Consolidar mapa comparativo e base estimada.",
        href: "/compras",
        iconKey: "compras",
        group: "Ações rápidas",
      },
      {
        id: "module-licitacao",
        label: "Licitação",
        description: "Acompanhar disputa, recursos e homologação.",
        href: "/licitacao",
        iconKey: "licitacao",
        group: "Ações rápidas",
      },
      {
        id: "module-prazos",
        label: "Prazos",
        description: "Ir direto para a fila de urgências e prazos críticos.",
        href: "/prazos",
        iconKey: "prazos",
        group: "Ações rápidas",
      },
    ],
    gestor: [
      {
        id: "module-relatorios",
        label: "Relatórios",
        description: "Conferir visão gerencial e recortes executivos.",
        href: "/relatorios",
        iconKey: "relatorios",
        group: "Ações rápidas",
      },
      {
        id: "module-contratos",
        label: "Contratos",
        description: "Abrir vigências, formalização e contratos ativos.",
        href: "/contratos",
        iconKey: "contratos",
        group: "Ações rápidas",
      },
      {
        id: "module-prazos-gestor",
        label: "Prazos críticos",
        description: "Acessar a janela de urgência operacional do dia.",
        href: "/prazos",
        iconKey: "prazos",
        group: "Ações rápidas",
      },
    ],
    admin: [
      {
        id: "module-usuarios",
        label: "Usuários",
        description: "Gerenciar perfis, acessos e segurança básica.",
        href: "/usuarios",
        iconKey: "usuarios",
        group: "Ações rápidas",
      },
      {
        id: "module-parametros",
        label: "Parâmetros",
        description: "Ajustar comportamento sistêmico e branding institucional.",
        href: "/parametros",
        iconKey: "parametros",
        group: "Ações rápidas",
      },
      {
        id: "module-importacoes",
        label: "Importações",
        description: "Revisar integrações, reconciliações e filas de base.",
        href: "/importacoes",
        iconKey: "importacoes",
        group: "Ações rápidas",
      },
    ],
    auditor: [
      {
        id: "module-auditoria",
        label: "Auditoria",
        description: "Consultar trilhas sensíveis e eventos operacionais.",
        href: "/auditoria",
        iconKey: "auditoria",
        group: "Ações rápidas",
      },
      {
        id: "module-dossie",
        label: "Dossiê",
        description: "Ir para a central de dossiês e análise histórica.",
        href: "/dossie",
        iconKey: "dossie",
        group: "Ações rápidas",
      },
    ],
    user: [
      {
        id: "module-workflow",
        label: "Workflow",
        description: "Acompanhar a movimentação recente do fluxo.",
        href: "/workflow",
        iconKey: "workflow",
        group: "Ações rápidas",
      },
      {
        id: "module-cadastros",
        label: "Cadastros",
        description: "Consultar bases de itens, pessoas e fornecedores.",
        href: "/cadastros",
        iconKey: "cadastros",
        group: "Ações rápidas",
      },
    ],
  };

  return [...(byRole[userRole] ?? byRole.user), ...common];
}

export function CommandPalette({ open, userRole, onClose, onNavigate, onRestartTour }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const staticItems = useMemo(() => buildStaticItems(userRole), [userRole]);

  const searchQuery = trpc.consultas.search.useQuery(
    {
      termo: deferredSearch || undefined,
      pagina: 1,
      limite: 6,
    },
    {
      enabled: open && deferredSearch.length >= 2,
      retry: false,
      placeholderData: (previous) => previous,
    },
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  const filteredStaticItems = useMemo(() => {
    if (!deferredSearch) {
      return staticItems;
    }

    const pattern = deferredSearch.toLowerCase();
    return staticItems.filter((item) => {
      const haystack = [item.label, item.description, ...(item.keywords ?? [])].join(" ").toLowerCase();
      return haystack.includes(pattern);
    });
  }, [deferredSearch, staticItems]);

  const groupedStaticItems = useMemo(() => {
    return filteredStaticItems.reduce<Record<string, CommandPaletteItem[]>>((acc, item) => {
      acc[item.group] = [...(acc[item.group] ?? []), item];
      return acc;
    }, {});
  }, [filteredStaticItems]);

  const processResults = searchQuery.data?.dados ?? [];

  const handleSelect = (href: string) => {
    onClose();
    onNavigate(href);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Palette de comando"
      description={`Navegue mais rápido pelo SIREL. Use Ctrl+K para abrir e pesquise processos, módulos e atalhos do perfil ${roleLabel(userRole).toLowerCase()}.`}
    >
      <div className="space-y-5">
        <div data-tour-id="shell-command">
          <Input
            ref={inputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar processo, módulo, edital, objeto ou fornecedor"
            className="h-12 rounded-[22px]"
          />
        </div>

        <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-[var(--text-primary)]">Atalho do teclado</p>
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]">
              Ctrl + K
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onRestartTour();
              }}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              Reiniciar tour desta tela
            </button>
          </div>
        </div>

        {deferredSearch.length >= 2 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-[var(--font-heading)] text-lg font-black tracking-tight text-[var(--text-primary)]">Processos encontrados</h4>
              {searchQuery.isFetching ? <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Buscando...</span> : null}
            </div>
            <div className="space-y-2">
              {processResults.map((item) => (
                <button
                  key={`process-${item.id}`}
                  type="button"
                  onClick={() => handleSelect(item.moduloAtual === "LICITACAO" ? `/licitacao/${item.id}` : `/processos/${item.id}`)}
                  className="flex w-full items-start gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-soft)]"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--accent-color)]">
                    <FolderOpenDot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-[var(--text-primary)]">{item.numeroSirel}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{item.objetoResumo}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{item.moduloAtual} • {item.secretariaNome}</p>
                  </div>
                </button>
              ))}
              {!searchQuery.isFetching && !processResults.length ? (
                <div className="rounded-[22px] border border-dashed border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                  Nenhum processo encontrado com esse termo. Tente buscar por número SIREL, edital, fornecedor ou objeto.
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {Object.entries(groupedStaticItems).map(([group, items]) => (
          <section key={group} className="space-y-3">
            <h4 className="font-[var(--font-heading)] text-lg font-black tracking-tight text-[var(--text-primary)]">{group}</h4>
            <div className="space-y-2">
              {items.map((item) => {
                const Icon = iconMap[item.iconKey] ?? LayoutDashboard;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.href)}
                    className="flex w-full items-start gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-soft)]"
                  >
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--accent-color)]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-[var(--text-primary)]">{item.label}</p>
                        {item.badge ? <span className="rounded-full bg-[var(--surface-highlight)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-primary)]">{item.badge}</span> : null}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{item.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
