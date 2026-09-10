import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  FileCheck2,
  FileStack,
  History,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LicitacaoProcessHeaderModel } from "@/lib/licitacao-processo-view-model";

interface LicitacaoProcessHeaderProps {
  model: LicitacaoProcessHeaderModel;
  onOpenDossie: () => void;
  onOpenDocumentos: () => void;
  onOpenHistory: () => void;
  onBackToQueue: () => void;
  auditAction?: ReactNode;
  compact?: boolean;
}

export function LicitacaoProcessHeader({
  model,
  onOpenDossie,
  onOpenDocumentos,
  onOpenHistory,
  onBackToQueue,
  auditAction,
  compact = false,
}: LicitacaoProcessHeaderProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !actionsRef.current?.contains(event.target)
      ) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [actionsOpen]);

  const openAction = (action: () => void) => {
    setActionsOpen(false);
    action();
  };

  const stats = [
    { label: "Fase atual", value: model.currentPhaseLabel },
    { label: "Pendencias", value: model.pendingLabel },
    { label: "Checklist", value: model.checklistProgressLabel },
    { label: "Acervo", value: model.documentsLabel },
  ];

  return (
    <section
      className={
        compact
          ? "bg-[var(--surface-panel)] px-4 py-4 sm:px-5"
          : "rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-4 py-3 shadow-[var(--shadow-card)]"
      }
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span
              className={`${compact ? "hidden sm:inline" : ""} text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]`}
            >
              {compact ? "Processo" : "Licitação"}
            </span>
            <h1
              className={`text-xl tracking-tight text-[var(--text-primary)] sm:text-2xl ${compact ? "font-bold" : "font-black"}`}
            >
              {model.numero}
            </h1>
            <span
              className={
                compact
                  ? "rounded-md bg-[var(--surface-soft)] px-2 py-1 text-xs font-semibold text-[var(--text-secondary)]"
                  : "rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]"
              }
            >
              {model.modalidade}
            </span>
          </div>

          {compact ? (
            <details className="text-xs text-[var(--text-secondary)] sm:hidden">
              <summary className="cursor-pointer py-1 focus-visible:outline focus-visible:outline-2">
                Secretaria e responsável
              </summary>
              <p className="mt-2">{model.secretaria}</p>
              <p className="mt-1">{model.responsavel}</p>
            </details>
          ) : null}
          <div
            className={`flex-wrap items-center gap-x-4 gap-y-1.5 text-[var(--text-secondary)] ${compact ? "hidden text-xs leading-5 sm:flex" : "flex text-sm"}`}
          >
            <span>{model.secretaria}</span>
            <span
              className={`inline-flex items-center gap-1.5 ${compact ? "" : "font-semibold text-[var(--text-primary)]"}`}
              title="Responsável pelo processo"
            >
              <UserRound
                aria-hidden="true"
                className={
                  compact
                    ? "h-3.5 w-3.5 shrink-0"
                    : "h-4 w-4 text-[var(--accent-color)]"
                }
              />
              <span className="sr-only">Responsável: </span>
              {model.responsavel}
            </span>
            {!compact &&
              stats.map((item) => (
                <span key={item.label} className="text-xs">
                  <span className="font-bold text-[var(--text-muted)]">
                    {item.label}:{" "}
                  </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {item.value}
                  </span>
                </span>
              ))}
          </div>
        </div>

        {compact ? (
          <div className="flex shrink-0 items-center gap-1 xl:self-start">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onBackToQueue}
              aria-label="Voltar à fila de processos"
              className="rounded-lg"
            >
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
              Processos
            </Button>
            <div
              ref={actionsRef}
              className="relative"
              onKeyDown={(event) => {
                if (event.key === "Escape" && actionsOpen) {
                  event.preventDefault();
                  setActionsOpen(false);
                  actionsTriggerRef.current?.focus();
                }
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setActionsOpen(false);
              }}
            >
              <Button
                ref={actionsTriggerRef}
                type="button"
                size="sm"
                variant="outline"
                className="rounded-lg"
                aria-expanded={actionsOpen}
                aria-controls={actionsId}
                onClick={() => setActionsOpen((open) => !open)}
              >
                Mais ações
                <ChevronDown
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${actionsOpen ? "rotate-180" : ""}`}
                />
              </Button>
              <div
                id={actionsId}
                hidden={!actionsOpen}
                className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-1.5 shadow-lg"
              >
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start rounded-lg"
                  onClick={() => openAction(onOpenDossie)}
                >
                  <FileCheck2 aria-hidden="true" className="h-4 w-4" />
                  Dossiê do processo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start rounded-lg"
                  onClick={() => openAction(onOpenDocumentos)}
                >
                  <FileStack aria-hidden="true" className="h-4 w-4" />
                  Todos os documentos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full justify-start rounded-lg"
                  onClick={() => openAction(onOpenHistory)}
                >
                  <History aria-hidden="true" className="h-4 w-4" />
                  Histórico
                </Button>
                {model.isForaDoFluxo && auditAction ? (
                  <div
                    onClick={(event) => {
                      if (
                        event.target instanceof Node &&
                        event.currentTarget.contains(event.target)
                      ) {
                        setActionsOpen(false);
                        actionsTriggerRef.current?.focus();
                      }
                    }}
                    className="mt-1 border-t border-[var(--border-subtle)] pt-1 [&>button]:w-full [&>button]:justify-start [&>button]:rounded-lg [&>button]:border-transparent [&>button]:bg-transparent"
                  >
                    {auditAction}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenDossie}
            >
              <FileCheck2 className="h-4 w-4" />
              Dossie
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenDocumentos}
            >
              <FileStack className="h-4 w-4" />
              Documentos
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenHistory}
            >
              <History className="h-4 w-4" />
              Historico
            </Button>
            {auditAction}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onBackToQueue}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar a fila
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
