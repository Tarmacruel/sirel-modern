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
  return (
    <aside className="space-y-4">
      <section className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)]">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
          Assistente da etapa
        </div>
        <h2 className="mt-2 text-lg font-black text-[var(--text-primary)]">
          {model.selectedPhaseLabel}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Secao ativa:{" "}
          <span className="font-semibold text-[var(--text-primary)]">
            {model.leadSectionLabel}
          </span>
        </p>

        <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-color)]" />
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              {model.tip}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)]">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
          Navegacao da fase
        </div>
        <div className="mt-3 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectNavItem(item.key)}
              className={[
                "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition",
                item.active
                  ? "border-[var(--border-strong)] bg-[var(--surface-highlight)] text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
              ].join(" ")}
            >
              <span>{item.label}</span>
              <ChevronRight className="h-4 w-4 flex-none" />
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
              Bloqueios legais
            </div>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              {model.legalBlocksLabel}
            </p>
          </div>
          <AlertCircle className="h-4 w-4 text-[var(--accent-color)]" />
        </div>

        {model.legalBlocks.length ? (
          <ul className="mt-3 space-y-3 text-sm text-[var(--text-secondary)]">
            {model.legalBlocks.map((item) => (
              <li
                key={item.category}
                className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3"
              >
                <div className="font-semibold text-[var(--text-primary)]">
                  {item.label}
                </div>
                {item.detalhe ? (
                  <div className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                    {item.detalhe}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700">
            Sem bloqueios abertos para a etapa selecionada.
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)]">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-600)]">
          Contexto
        </div>
        <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
          <div className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Fluxo
            </div>
            <div className="mt-1 font-bold text-[var(--text-primary)]">
              {model.flowLabel}
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Disputa
            </div>
            <div className="mt-1 font-bold text-[var(--text-primary)]">
              {model.disputeLabel}
            </div>
          </div>
          {model.modalidadeHelp ? (
            <div className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3 text-sm leading-6 text-[var(--text-secondary)]">
              {model.modalidadeHelp}
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full"
          onClick={onOpenDocuments}
        >
          <FileStack className="h-4 w-4" />
          Ver documentos
        </Button>
      </section>
    </aside>
  );
}
