import { Alert } from "@/components/ui/alert";
import { useState } from "react";
import { Pagination } from "@/components/ui/pagination";

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
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / 10));
  const currentPage = Math.min(page, totalPages);
  return (
    <div className="divide-y divide-[var(--border-subtle)]">
      {items.length ? (
        items.slice((currentPage - 1) * 10, currentPage * 10).map((item) => (
          <article key={item.id} className="py-4 first:pt-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div>
                <div className="break-words font-semibold text-[var(--text-primary)]">
                  {cleanDisplayText(item.descricao)}
                </div>
              </div>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">
                {formatShortDateTimeBR(item.criadoEm)}
              </span>
            </div>
            {item.observacao ? (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-secondary)]">
                {cleanDisplayText(item.observacao)}
              </p>
            ) : null}
          </article>
        ))
      ) : (
        <Alert variant="info">
          Ainda não há movimentações registradas para esta etapa da Licitação.
        </Alert>
      )}
      {totalPages > 1 ? (
        <div className="pt-4">
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : null}
    </div>
  );
}
