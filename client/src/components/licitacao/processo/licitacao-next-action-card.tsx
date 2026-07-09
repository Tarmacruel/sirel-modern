import { AlertCircle, ArrowRight, CheckCircle2, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  LicitacaoNextActionModel,
  LicitacaoPreparationModel,
} from "@/lib/licitacao-processo-view-model";

interface LicitacaoNextActionCardProps {
  model: LicitacaoNextActionModel;
  preparation: LicitacaoPreparationModel;
  onPrimaryAction: () => void;
  onOpenLeadSection: () => void;
}

export function LicitacaoNextActionCard({
  model,
  preparation,
  onPrimaryAction,
  onOpenLeadSection,
}: LicitacaoNextActionCardProps) {
  const hasBlock = Boolean(model.blockedReason);

  return (
    <section className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-primary-600)]">
            <Target className="h-3.5 w-3.5" />
            Proxima acao
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-[var(--text-primary)]">
            {model.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {model.objective}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button type="button" variant="outline" onClick={onOpenLeadSection}>
            Ir para secao ativa
          </Button>
          <Button
            type="button"
            onClick={onPrimaryAction}
            disabled={model.primaryDisabled}
          >
            {model.primaryLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        {hasBlock ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <div className="text-sm font-semibold text-amber-950">
                  Bloqueio operacional
                </div>
                <p className="mt-1 text-sm leading-6 text-amber-900">
                  {model.blockedReason}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <div>
                <div className="text-sm font-semibold text-emerald-950">
                  Etapa pronta para seguir
                </div>
                <p className="mt-1 text-sm leading-6 text-emerald-900">
                  Nenhum bloqueio principal aberto para esta acao.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Checklist interno
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {preparation.progressLabel}
              </div>
            </div>
            <div className="text-2xl font-black text-[var(--text-primary)]">
              {preparation.progressPercent}%
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-card)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary-500)]"
              style={{ width: `${preparation.progressPercent}%` }}
            />
          </div>
          <div className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
            Proximo ato: {preparation.nextPendingLabel}
          </div>
        </div>
      </div>

      {model.pendingItems.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {model.pendingItems.map((item) => (
            <span
              key={item.category}
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800"
            >
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
