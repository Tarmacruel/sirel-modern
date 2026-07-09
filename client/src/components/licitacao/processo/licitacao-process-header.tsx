import {
  AlertTriangle,
  ArrowLeft,
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
}

export function LicitacaoProcessHeader({
  model,
  onOpenDossie,
  onOpenDocumentos,
  onOpenHistory,
  onBackToQueue,
}: LicitacaoProcessHeaderProps) {
  const stats = [
    { label: "Fase atual", value: model.currentPhaseLabel },
    { label: "Pendencias", value: model.pendingLabel },
    { label: "Checklist", value: model.checklistProgressLabel },
    { label: "Acervo", value: model.documentsLabel },
  ];

  return (
    <section className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
            <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1">
              Licitacao
            </span>
            {model.isForaDoFluxo ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Fora do fluxo
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <h1 className="text-2xl font-black tracking-tight text-[var(--text-primary)] sm:text-3xl">
              {model.numero}
            </h1>
            <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-sm font-semibold text-[var(--text-secondary)]">
              {model.modalidade}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)]">
            <span>{model.secretaria}</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
              <UserRound className="h-4 w-4 text-[var(--accent-color)]" />
              {model.responsavel}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button type="button" variant="outline" onClick={onOpenDossie}>
            <FileCheck2 className="h-4 w-4" />
            Dossie
          </Button>
          <Button type="button" variant="outline" onClick={onOpenDocumentos}>
            <FileStack className="h-4 w-4" />
            Documentos
          </Button>
          <Button type="button" variant="outline" onClick={onOpenHistory}>
            <History className="h-4 w-4" />
            Historico
          </Button>
          <Button type="button" variant="ghost" onClick={onBackToQueue}>
            <ArrowLeft className="h-4 w-4" />
            Voltar a fila
          </Button>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3"
          >
            <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {item.label}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
