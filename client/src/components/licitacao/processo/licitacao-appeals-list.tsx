import { useState } from "react";
import { recursoResultadoLabels } from "@sirel/shared/const";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { formatShortDateBR } from "@/lib/formatters";

export interface AppealRecord {
  id: number;
  licitanteId: number;
  licitanteNome: string | null;
  dataInterposicao: string | Date | null;
  dataJulgamento: string | Date | null;
  resultado: string;
  descricao: string;
  decisao: string | null;
}

export function LicitacaoAppealsList({
  items,
  canCreate,
  onCreate,
  onEdit,
}: {
  items: AppealRecord[];
  canCreate: boolean;
  onCreate: () => void;
  onEdit: (item: AppealRecord) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pending = items.filter((item) => item.resultado === "PENDENTE").length;
  const filtered = items.filter(
    (item) =>
      filter === "all" ||
      (filter === "pending"
        ? item.resultado === "PENDENTE"
        : item.resultado !== "PENDENTE"),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, totalPages);
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Recursos e decisões</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {pending
              ? `${pending} ${pending === 1 ? "recurso aguardando" : "recursos aguardando"} decisão.`
              : "Nenhum recurso aguardando decisão."}{" "}
            Abra um registro para conferir ou atualizar o resultado.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 rounded-lg"
          disabled={!canCreate}
          onClick={onCreate}
        >
          Registrar recurso
        </Button>
      </div>
      {!canCreate ? (
        <p className="text-sm text-[var(--text-secondary)]">
          Cadastre um licitante na fase de disputa para registrar um recurso.
        </p>
      ) : null}
      <div
        role="group"
        aria-label="Filtrar recursos"
        className="flex flex-wrap gap-2"
      >
        {[
          ["all", `Todos (${items.length})`],
          ["pending", `Pendentes (${pending})`],
          ["decided", `Decididos (${items.length - pending})`],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 ${filter === value ? "bg-[var(--surface-selected)] text-[var(--color-primary-600)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {filtered.length ? (
        <ul
          aria-label="Recursos registrados"
          className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]"
        >
          {filtered
            .slice((currentPage - 1) * 8, currentPage * 8)
            .map((item) => (
              <li key={item.id} className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="break-words font-semibold">
                      {item.licitanteNome ?? "Licitante"}
                    </h4>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Interposição: {formatShortDateBR(item.dataInterposicao)} ·{" "}
                      {recursoResultadoLabels[
                        item.resultado as keyof typeof recursoResultadoLabels
                      ] ?? item.resultado}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-lg"
                    aria-label={`Revisar recurso de ${item.licitanteNome ?? "licitante"}`}
                    onClick={() => onEdit(item)}
                  >
                    Revisar
                  </Button>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">
                  {item.descricao}
                </p>
                {item.decisao || item.dataJulgamento ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-semibold text-[var(--color-primary-600)]">
                      Ver decisão
                    </summary>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Julgamento: {formatShortDateBR(item.dataJulgamento)}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {item.decisao || "Decisão não informada."}
                    </p>
                  </details>
                ) : null}
              </li>
            ))}
        </ul>
      ) : (
        <p className="border-t border-[var(--border-subtle)] py-8 text-sm text-[var(--text-secondary)]">
          {items.length
            ? "Nenhum recurso neste filtro."
            : "Nenhum recurso registrado. Os documentos ou o registro de ausência podem ser incluídos na aba Documentos."}
        </p>
      )}
      {totalPages > 1 ? (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
