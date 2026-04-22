import { Alert } from "@/components/ui/alert";

type HistoricoItem = {
  id: number;
  descricao: string;
  observacao?: string | null;
  criadoEm: string | Date;
};

interface LicitacaoProcessoHistoryContentProps {
  items: HistoricoItem[];
  cleanDisplayText: (value: string | null | undefined) => string;
  formatShortDateTimeBR: (value: string | Date) => string;
}

export default function LicitacaoProcessoHistoryContent({
  items,
  cleanDisplayText,
  formatShortDateTimeBR,
}: LicitacaoProcessoHistoryContentProps) {
  return (
    <div className="space-y-3">
      {items.length ? (
        items.map((item) => (
          <article
            key={item.id}
            className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-[var(--color-primary-900)]">
                  {cleanDisplayText(item.descricao)}
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--color-neutral-500)]">
                  Registro operacional da Licitacao
                </div>
              </div>
              <span className="text-xs text-[var(--color-neutral-500)]">
                {formatShortDateTimeBR(item.criadoEm)}
              </span>
            </div>
            {item.observacao ? (
              <p className="mt-3 text-sm leading-6 text-[var(--color-neutral-600)]">
                {cleanDisplayText(item.observacao)}
              </p>
            ) : null}
          </article>
        ))
      ) : (
        <Alert variant="info">
          Ainda nao ha movimentacoes registradas para esta etapa da Licitacao.
        </Alert>
      )}
    </div>
  );
}
