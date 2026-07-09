import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LicitacaoEvidenceEditor, type LicitacaoEvidenceUploadState } from "./licitacao-evidence-editor";
import {
  LicitacaoEvidenceRow,
  type LicitacaoEvidenceItem,
} from "./licitacao-evidence-row";

type EvidenceFilter = "pending" | "completed" | "all";

interface LicitacaoEvidenceQueueProps {
  items: LicitacaoEvidenceItem[];
  activeCategory: string | null;
  uploadStates: Record<string, LicitacaoEvidenceUploadState | undefined>;
  resolveDocumentUrl: (url: string | null) => string | null;
  onActiveCategoryChange: (category: string | null) => void;
  onTitleChange: (category: string, value: string) => void;
  onDescriptionChange: (category: string, value: string) => void;
  onFileSelect: (category: string, file: File | null, suggestedTitle: string) => void;
  onUpload: (item: LicitacaoEvidenceItem) => void;
}

function getLatestDocument(item: LicitacaoEvidenceItem) {
  return (
    item.documentos
      .slice()
      .sort(
        (left, right) =>
          new Date(right.criadoEm).getTime() -
          new Date(left.criadoEm).getTime(),
      )[0] ?? null
  );
}

function getVisibleItems(items: LicitacaoEvidenceItem[], filter: EvidenceFilter) {
  const ordered = [...items].sort((left, right) => {
    if (left.concluido !== right.concluido) return left.concluido ? 1 : -1;
    if (left.obrigatorio !== right.obrigatorio) return left.obrigatorio ? -1 : 1;
    return left.label.localeCompare(right.label);
  });

  if (filter === "pending") return ordered.filter((item) => !item.concluido);
  if (filter === "completed") return ordered.filter((item) => item.concluido);
  return ordered;
}

export function LicitacaoEvidenceQueue({
  items,
  activeCategory,
  uploadStates,
  resolveDocumentUrl,
  onActiveCategoryChange,
  onTitleChange,
  onDescriptionChange,
  onFileSelect,
  onUpload,
}: LicitacaoEvidenceQueueProps) {
  const [filter, setFilter] = useState<EvidenceFilter>("pending");
  const orderedItems = useMemo(() => getVisibleItems(items, "all"), [items]);
  const visibleItems = useMemo(() => getVisibleItems(items, filter), [filter, items]);
  const pendingItems = orderedItems.filter((item) => !item.concluido);
  const completedItems = orderedItems.filter((item) => item.concluido);
  const activeItem =
    orderedItems.find((item) => item.category === activeCategory) ?? null;
  const activeIndex = activeItem
    ? orderedItems.findIndex((item) => item.category === activeItem.category)
    : -1;

  function openNextPending() {
    const pendingAfterActive =
      activeIndex >= 0
        ? orderedItems
            .slice(activeIndex + 1)
            .find((item) => !item.concluido)
        : null;
    const next = pendingAfterActive ?? pendingItems[0] ?? orderedItems[0] ?? null;

    onActiveCategoryChange(next?.category ?? null);
    setFilter(next?.concluido ? "all" : "pending");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-3 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
            <ListChecks className="h-4 w-4" />
            Fila de evidencias
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Pendentes primeiro. Abra uma linha para editar e anexar a evidencia.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ["pending", `Pendentes ${pendingItems.length}`],
            ["completed", `Concluidos ${completedItems.length}`],
            ["all", `Todos ${orderedItems.length}`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key as EvidenceFilter)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]",
                filter === key
                  ? "border-[var(--border-strong)] bg-[var(--surface-selected)] text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
          <Button type="button" size="sm" onClick={openNextPending}>
            Resolver proxima pendencia
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {visibleItems.length ? (
          visibleItems.map((item) => {
            const latestDocument = getLatestDocument(item);
            const active = activeCategory === item.category;

            return (
              <div key={item.category} className="space-y-2">
                <LicitacaoEvidenceRow
                  item={item}
                  active={active}
                  latestDocument={latestDocument}
                  onOpen={() => onActiveCategoryChange(active ? null : item.category)}
                />
                {active ? (
                  <LicitacaoEvidenceEditor
                    item={item}
                    uploadState={
                      uploadStates[item.category] ?? {
                        titulo: "",
                        descricao: "",
                        arquivo: null,
                      }
                    }
                    latestDocument={latestDocument}
                    index={activeIndex}
                    total={orderedItems.length}
                    canGoPrevious={activeIndex > 0}
                    canGoNext={activeIndex > -1 && activeIndex < orderedItems.length - 1}
                    resolveDocumentUrl={resolveDocumentUrl}
                    onTitleChange={(value) => onTitleChange(item.category, value)}
                    onDescriptionChange={(value) =>
                      onDescriptionChange(item.category, value)
                    }
                    onFileSelect={(file) =>
                      onFileSelect(item.category, file, item.label)
                    }
                    onUpload={() => onUpload(item)}
                    onPrevious={() =>
                      onActiveCategoryChange(orderedItems[activeIndex - 1]?.category ?? null)
                    }
                    onNext={() =>
                      onActiveCategoryChange(orderedItems[activeIndex + 1]?.category ?? null)
                    }
                  />
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-5 text-sm font-semibold text-[var(--text-secondary)]">
            Nenhuma evidencia neste filtro.
          </div>
        )}
      </div>
    </div>
  );
}
