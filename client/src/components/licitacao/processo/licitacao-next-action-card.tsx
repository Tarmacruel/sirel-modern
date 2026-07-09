import { AlertCircle, ArrowRight, Target } from "lucide-react";

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
  const statusTone = hasBlock
    ? "border-[var(--notice-warning-border)] bg-[var(--notice-warning-bg)] text-[var(--notice-warning-text)]"
    : "border-[var(--notice-success-border)] bg-[var(--notice-success-bg)] text-[var(--notice-success-text)]";

  return (
    <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-3 py-2.5 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={[
              "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border",
              statusTone,
            ].join(" ")}
          >
            {hasBlock ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : (
              <Target className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-primary-600)]">
              {hasBlock ? "Proxima acao bloqueada" : "Proxima acao"}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-base font-black tracking-tight text-[var(--text-primary)]">
                {model.title}
              </h2>
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                Checklist {preparation.progressPercent}%
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">
              {hasBlock ? model.blockedReason : model.objective}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="hidden min-w-[170px] rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2 xl:block">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Checklist
              </span>
              <span className="font-black text-[var(--text-primary)]">
                {preparation.progressPercent}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-card)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary-500)]"
                style={{ width: `${preparation.progressPercent}%` }}
              />
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onOpenLeadSection}>
            Abrir secao
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onPrimaryAction}
            disabled={model.primaryDisabled}
          >
            {model.primaryLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {model.pendingItems.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {model.pendingItems.map((item) => (
            <span
              key={item.category}
              className="rounded-full border border-[var(--notice-warning-border)] bg-[var(--notice-warning-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--notice-warning-text)]"
            >
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
