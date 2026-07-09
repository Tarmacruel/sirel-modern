import { AlertCircle, ChevronRight, FileStack, Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LicitacaoContextAssistantModel } from "@/lib/licitacao-processo-view-model";

export interface LicitacaoContextAssistantNavItem {
  key: string;
  label: string;
  active: boolean;
}

interface LicitacaoContextAssistantProps {
  model: LicitacaoContextAssistantModel;
  navItems: LicitacaoContextAssistantNavItem[];
  onSelectNavItem: (key: string) => void;
  onOpenDocuments: () => void;
}

export function LicitacaoContextAssistant({
  model,
  navItems,
  onSelectNavItem,
  onOpenDocuments,
}: LicitacaoContextAssistantProps) {
  const hasBlocks = model.legalBlocks.length > 0;

  return (
    <aside>
      <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-3 shadow-[var(--shadow-card)]">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
          Contexto da etapa
        </div>
        <h2 className="mt-1 text-base font-black text-[var(--text-primary)]">
          {model.selectedPhaseLabel}
        </h2>
        <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
          Secao ativa:{" "}
          <span className="font-semibold text-[var(--text-primary)]">
            {model.leadSectionLabel}
          </span>
        </p>

        <div className="mt-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-color)]" />
            <p className="text-sm leading-5 text-[var(--text-secondary)]">
              {model.tip}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Bloqueios
              </div>
              <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                {model.legalBlocksLabel}
              </p>
            </div>
            <AlertCircle className="h-4 w-4 text-[var(--accent-color)]" />
          </div>

          {hasBlocks ? (
            <ul className="mt-2 space-y-2 text-sm text-[var(--text-secondary)]">
              {model.legalBlocks.map((item) => (
                <li
                  key={item.category}
                  className="rounded-[12px] border border-[var(--notice-warning-border)] bg-[var(--notice-warning-bg)] px-3 py-2 text-[var(--notice-warning-text)]"
                >
                  <div className="font-semibold">{item.label}</div>
                  {item.detalhe ? (
                    <div className="mt-1 text-xs leading-5">
                      {item.detalhe}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 rounded-[12px] border border-[var(--notice-success-border)] bg-[var(--notice-success-bg)] px-3 py-2 text-sm font-semibold text-[var(--notice-success-text)]">
              Sem bloqueios abertos.
            </div>
          )}
        </div>

        <details className="mt-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Navegacao e contexto
          </summary>
          <div className="mt-3 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectNavItem(item.key)}
                className={[
                  "flex w-full items-center justify-between rounded-[12px] border px-3 py-2 text-left text-sm font-semibold transition",
                  item.active
                    ? "border-[var(--border-strong)] bg-[var(--surface-selected)] text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                <span>{item.label}</span>
                <ChevronRight className="h-4 w-4 flex-none" />
              </button>
            ))}

            <div className="grid gap-2 text-sm text-[var(--text-secondary)]">
              <div className="rounded-[12px] bg-[var(--surface-card)] px-3 py-2">
                <span className="font-bold text-[var(--text-primary)]">
                  {model.flowLabel}
                </span>{" "}
                - {model.disputeLabel}
              </div>
              {model.modalidadeHelp ? (
                <div className="rounded-[12px] bg-[var(--surface-card)] px-3 py-2 text-sm leading-5">
                  {model.modalidadeHelp}
                </div>
              ) : null}
            </div>
          </div>
        </details>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={onOpenDocuments}
        >
          <FileStack className="h-4 w-4" />
          Ver documentos
        </Button>
      </section>
    </aside>
  );
}
