import type { ReactNode } from "react";
import { ArrowLeft, FileCheck2, FileStack, History, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LicitacaoProcessHeaderModel } from "@/lib/licitacao-processo-view-model";

interface LicitacaoProcessHeaderProps {
  model: LicitacaoProcessHeaderModel;
  onOpenDossie: () => void;
  onOpenDocumentos: () => void;
  onOpenHistory: () => void;
  onBackToQueue: () => void;
  auditAction?: ReactNode;
}

export function LicitacaoProcessHeader({
  model,
  onOpenDossie,
  onOpenDocumentos,
  onOpenHistory,
  onBackToQueue,
  auditAction,
}: LicitacaoProcessHeaderProps) {
  const stats = [
    { label: "Fase atual", value: model.currentPhaseLabel },
    { label: "Pendencias", value: model.pendingLabel },
    { label: "Checklist", value: model.checklistProgressLabel },
    { label: "Acervo", value: model.documentsLabel },
  ];

  return (
    <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-4 py-3 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
              Licitacao
            </span>
            <h1 className="text-xl font-black tracking-tight text-[var(--text-primary)] sm:text-2xl">
              {model.numero}
            </h1>
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]">
              {model.modalidade}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--text-secondary)]">
            <span>{model.secretaria}</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
              <UserRound className="h-4 w-4 text-[var(--accent-color)]" />
              {model.responsavel}
            </span>
            {stats.map((item) => (
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

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button type="button" size="sm" variant="outline" onClick={onOpenDossie}>
            <FileCheck2 className="h-4 w-4" />
            Dossie
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onOpenDocumentos}>
            <FileStack className="h-4 w-4" />
            Documentos
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onOpenHistory}>
            <History className="h-4 w-4" />
            Historico
          </Button>
          {auditAction}
          <Button type="button" size="sm" variant="ghost" onClick={onBackToQueue}>
            <ArrowLeft className="h-4 w-4" />
            Voltar a fila
          </Button>
        </div>
      </div>
    </section>
  );
}
