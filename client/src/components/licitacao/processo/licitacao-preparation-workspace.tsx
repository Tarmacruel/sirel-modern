import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  FileText,
  Package,
  Settings2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PreparationWorkspaceItem {
  category: string;
  label: string;
  description?: string;
  concluido: boolean;
  statusLabel: string;
  institutional?: boolean;
}

export interface LicitacaoPreparationWorkspaceProps {
  items: PreparationWorkspaceItem[];
  activeCategory: string | null;
  onSelectCategory: (category: string) => void;
  editor: ReactNode;
  itemsContent: ReactNode;
  configurationContent: ReactNode;
  objectDescription?: string;
  progressCount?: number;
  totalCount?: number;
  canAdvance: boolean;
  advanceHint?: string;
  onAdvance: () => void;
  isAdvancing?: boolean;
}

type WorkspaceTab = "documents" | "items" | "people" | "configuration";
type ObjectTab = "documents" | "people";
type ObjectFilter = "all" | "pending" | "completed";

const tabs = [
  { value: "documents", label: "Documentos", icon: FileText },
  { value: "items", label: "Itens", icon: Package },
  { value: "people", label: "Responsáveis", icon: Users },
  { value: "configuration", label: "Configuração", icon: Settings2 },
] as const;

const filters: { value: ObjectFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "completed", label: "Concluídos" },
];

function preferredItem(items: PreparationWorkspaceItem[]) {
  return items.find((item) => !item.concluido) ?? items[0];
}

export function LicitacaoPreparationWorkspace({
  items,
  activeCategory,
  onSelectCategory,
  editor,
  itemsContent,
  configurationContent,
  objectDescription,
  progressCount = items.filter((item) => item.concluido).length,
  totalCount = items.length,
  canAdvance,
  advanceHint,
  onAdvance,
  isAdvancing = false,
}: LicitacaoPreparationWorkspaceProps) {
  const id = useId();
  const initiallyInstitutional = items.find(
    (item) => item.category === activeCategory,
  )?.institutional;
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    initiallyInstitutional ? "people" : "documents",
  );
  const [objectTab, setObjectTab] = useState<ObjectTab>(
    initiallyInstitutional ? "people" : "documents",
  );
  const [filter, setFilter] = useState<ObjectFilter>("all");
  const [mobileDetail, setMobileDetail] = useState(false);
  const tabRefs = useRef<
    Partial<Record<WorkspaceTab, HTMLButtonElement | null>>
  >({});
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const detailRef = useRef<HTMLDivElement>(null);
  const requestedDetailFocus = useRef(false);

  const documentItems = useMemo(
    () => items.filter((item) => !item.institutional),
    [items],
  );
  const peopleItems = useMemo(
    () => items.filter((item) => item.institutional),
    [items],
  );
  const objectItems = objectTab === "people" ? peopleItems : documentItems;
  const activeItem = objectItems.find(
    (item) => item.category === activeCategory,
  );
  const visibleItems = objectItems.filter(
    (item) =>
      filter === "all" ||
      (filter === "completed" ? item.concluido : !item.concluido),
  );
  const selectionVisible = visibleItems.some(
    (item) => item.category === activeCategory,
  );
  const objectPanelVisible =
    activeTab === "documents" || activeTab === "people";
  const progress =
    totalCount > 0
      ? Math.min(100, Math.max(0, (progressCount / totalCount) * 100))
      : 0;

  // Keep selection meaningful when requirements arrive or their applicability changes.
  // Merely refreshing a document must not move the user's focus or scroll position.
  useEffect(() => {
    if (!objectPanelVisible || activeItem || !objectItems.length) return;
    const next = preferredItem(objectItems);
    if (next) onSelectCategory(next.category);
  }, [activeItem, objectItems, objectPanelVisible, onSelectCategory]);

  useEffect(() => {
    if (!mobileDetail || !requestedDetailFocus.current) return;
    requestedDetailFocus.current = false;
    if (!window.matchMedia?.("(max-width: 767px)").matches) return;
    detailRef.current?.focus({ preventScroll: true });
    detailRef.current?.scrollIntoView?.({ block: "start" });
  }, [activeCategory, mobileDetail]);

  function selectTab(nextTab: WorkspaceTab) {
    setActiveTab(nextTab);
    setMobileDetail(false);
    if (nextTab !== "documents" && nextTab !== "people") return;
    setObjectTab(nextTab);
    setFilter("all");
    const nextItems = nextTab === "people" ? peopleItems : documentItems;
    const nextItem =
      nextItems.find((item) => item.category === activeCategory) ??
      preferredItem(nextItems);
    if (nextItem && nextItem.category !== activeCategory)
      onSelectCategory(nextItem.category);
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[nextIndex].value;
    selectTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  function openItem(category: string) {
    requestedDetailFocus.current = true;
    onSelectCategory(category);
    setMobileDetail(true);
  }

  function returnToList() {
    setMobileDetail(false);
    requestAnimationFrame(() => {
      if (activeCategory)
        itemRefs.current[activeCategory]?.focus({ preventScroll: true });
    });
  }

  function selectFilter(nextFilter: ObjectFilter) {
    setFilter(nextFilter);
    setMobileDetail(false);
    const nextItems = objectItems.filter(
      (item) =>
        nextFilter === "all" ||
        (nextFilter === "completed" ? item.concluido : !item.concluido),
    );
    if (!nextItems.some((item) => item.category === activeCategory)) {
      const next = preferredItem(nextItems);
      if (next) onSelectCategory(next.category);
    }
  }

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"
    >
      <header className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0 max-w-3xl">
          <h2
            id={`${id}-heading`}
            className="text-xl font-bold tracking-tight text-[var(--text-primary)]"
          >
            Preparação
          </h2>
          {objectDescription ? (
            objectDescription.length > 180 ? (
              <details className="group mt-1">
                <summary className="cursor-pointer list-none rounded text-sm text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] [&::-webkit-details-marker]:hidden">
                  <span className="sr-only">Objeto da contratação: </span>
                  <span className="line-clamp-2 break-words group-open:line-clamp-none">
                    {objectDescription}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-[var(--color-primary-600)] group-open:hidden">
                    Ver objeto completo
                  </span>
                  <span className="mt-1 hidden text-xs font-semibold text-[var(--color-primary-600)] group-open:block">
                    Recolher objeto
                  </span>
                </summary>
              </details>
            ) : (
              <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
                <span className="sr-only">Objeto da contratação: </span>
                {objectDescription}
              </p>
            )
          ) : (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Organize os documentos, os itens e os responsáveis.
            </p>
          )}
        </div>
        <div className="w-full shrink-0 sm:w-44">
          <p
            id={`${id}-progress-label`}
            className="mb-2 text-xs font-medium text-[var(--text-secondary)]"
          >
            <span className="font-bold tabular-nums text-[var(--text-primary)]">
              {progressCount} de {totalCount}
            </span>{" "}
            requisitos concluídos
          </p>
          <div
            role="progressbar"
            aria-labelledby={`${id}-progress-label`}
            aria-valuemin={0}
            aria-valuemax={Math.max(totalCount, 1)}
            aria-valuenow={Math.min(progressCount, Math.max(totalCount, 1))}
            className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"
          >
            <div
              className="h-full rounded-full bg-[var(--color-primary-500)] transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Objetos da preparação"
        className="grid grid-cols-2 border-b border-[var(--border-subtle)] px-3 sm:flex sm:px-6"
      >
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              ref={(element) => {
                tabRefs.current[tab.value] = element;
              }}
              id={`${id}-tab-${tab.value}`}
              role="tab"
              type="button"
              aria-selected={activeTab === tab.value}
              aria-controls={`${id}-${tab.value === "documents" || tab.value === "people" ? "objects" : tab.value}-panel`}
              tabIndex={activeTab === tab.value ? 0 : -1}
              onClick={() => selectTab(tab.value)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={cn(
                "relative flex min-h-12 min-w-0 items-center justify-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary-500)] motion-reduce:transition-none sm:mr-5 sm:justify-start sm:px-0",
                activeTab === tab.value
                  ? "border-[var(--color-primary-500)] text-[var(--color-primary-600)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {tab.label}
              {tab.value === "documents" ? (
                <span className="text-xs font-normal tabular-nums text-[var(--text-muted)]">
                  {documentItems.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        id={`${id}-objects-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${objectTab}`}
        hidden={!objectPanelVisible}
      >
        <div className="grid min-w-0 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div
            className={cn(
              "min-w-0 border-[var(--border-subtle)] md:border-r",
              mobileDetail ? "hidden md:block" : "block",
            )}
          >
            <div
              role="group"
              aria-label={
                objectTab === "people"
                  ? "Filtrar responsáveis"
                  : "Filtrar documentos"
              }
              className="flex flex-wrap gap-1 border-b border-[var(--border-subtle)] px-3 py-3 sm:px-4"
            >
              {filters.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => selectFilter(option.value)}
                  className={cn(
                    "min-h-9 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] motion-reduce:transition-none",
                    filter === option.value
                      ? "bg-[var(--surface-selected)] text-[var(--color-primary-600)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {visibleItems.length ? (
              <ul
                aria-label={
                  objectTab === "people"
                    ? "Responsáveis da preparação"
                    : "Documentos da preparação"
                }
                className="divide-y divide-[var(--border-subtle)]"
              >
                {visibleItems.map((item) => (
                  <li key={item.category}>
                    <button
                      ref={(element) => {
                        itemRefs.current[item.category] = element;
                      }}
                      type="button"
                      aria-current={
                        item.category === activeCategory ? "true" : undefined
                      }
                      aria-controls={`${id}-detail`}
                      onClick={() => openItem(item.category)}
                      className={cn(
                        "group flex min-h-[76px] w-full min-w-0 items-center gap-3 border-l-[3px] px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary-500)] motion-reduce:transition-none",
                        item.category === activeCategory
                          ? "border-[var(--color-primary-500)] bg-[var(--surface-selected)]"
                          : "border-transparent hover:bg-[var(--surface-soft)]",
                      )}
                    >
                      {item.concluido ? (
                        <Check
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-[var(--color-primary-600)]"
                        />
                      ) : (
                        <Circle
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-semibold leading-5 text-[var(--text-primary)]">
                          {item.label}
                        </span>
                        <span className="mt-1 block text-xs leading-4 text-[var(--text-secondary)]">
                          {item.statusLabel}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          "h-4 w-4 shrink-0",
                          item.category === activeCategory
                            ? "text-[var(--color-primary-600)]"
                            : "text-[var(--text-muted)]",
                        )}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                role="status"
                className="px-5 py-8 text-sm text-[var(--text-secondary)]"
              >
                {filter === "pending"
                  ? "Tudo concluído por aqui."
                  : filter === "completed"
                    ? "Nenhum requisito concluído ainda."
                    : objectTab === "people"
                      ? "Nenhum responsável a definir nesta etapa."
                      : "Nenhum documento exigido nesta etapa."}
              </p>
            )}
          </div>
          <div
            id={`${id}-detail`}
            ref={detailRef}
            tabIndex={-1}
            aria-label={
              activeItem
                ? `Detalhes: ${activeItem.label}`
                : "Detalhes do requisito"
            }
            className={cn(
              "min-w-0 px-5 py-5 outline-none sm:px-6 sm:py-6",
              mobileDetail ? "block" : "hidden md:block",
            )}
          >
            <button
              type="button"
              onClick={returnToList}
              className="mb-5 inline-flex min-h-9 items-center gap-2 rounded text-sm font-semibold text-[var(--color-primary-600)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] md:hidden"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {objectTab === "people"
                ? "Voltar aos responsáveis"
                : "Voltar aos documentos"}
            </button>
            {activeItem ? (
              <div key={activeItem.category} hidden={!selectionVisible}>
                {editor}
              </div>
            ) : null}
            {!activeItem || !selectionVisible ? (
              <p className="py-8 text-sm text-[var(--text-secondary)]">
                {visibleItems.length
                  ? "Selecione um requisito para ver os detalhes."
                  : "Nenhum requisito neste filtro."}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div
        id={`${id}-items-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-items`}
        hidden={activeTab !== "items"}
        className="min-w-0 px-5 py-5 sm:px-6 sm:py-6"
      >
        {itemsContent}
      </div>
      <div
        id={`${id}-configuration-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-configuration`}
        hidden={activeTab !== "configuration"}
        className="min-w-0 px-5 py-5 sm:px-6 sm:py-6"
      >
        {configurationContent}
      </div>

      <footer className="flex flex-col gap-3 border-t border-[var(--border-subtle)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p
          id={`${id}-advance-hint`}
          className="max-w-xl text-sm text-[var(--text-secondary)]"
        >
          {advanceHint}
        </p>
        <Button
          onClick={onAdvance}
          disabled={!canAdvance}
          loading={isAdvancing}
          aria-describedby={advanceHint ? `${id}-advance-hint` : undefined}
          className="w-full shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] focus-visible:ring-offset-2 sm:w-auto"
        >
          Avançar para publicação
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </footer>
    </section>
  );
}
