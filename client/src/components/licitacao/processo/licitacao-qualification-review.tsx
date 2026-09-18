import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

export interface QualificationBidder {
  id: number;
  razaoSocial: string;
  cnpj?: string | null;
  ativo: boolean;
  statusHabilitacao: string;
  observacaoHabilitacao?: string | null;
}

const statuses = {
  PENDENTE: "Pendente",
  HABILITADO: "Habilitado",
  INABILITADO: "Inabilitado",
};
const filters = [
  { value: "ALL", label: "Todos" },
  { value: "PENDENTE", label: "Pendentes" },
  { value: "HABILITADO", label: "Habilitados" },
  { value: "INABILITADO", label: "Inabilitados" },
] as const;

export function LicitacaoQualificationReview({
  bidders,
  onReview,
  registration,
}: {
  bidders: QualificationBidder[];
  onReview: (bidder: QualificationBidder) => void;
  registration: ReactNode;
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [requestedPage, setPage] = useState(1);
  const filtered = bidders.filter(
    (item) => filter === "ALL" || item.statusHabilitacao === filter,
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / 8));
  const page = Math.min(requestedPage, totalPages);
  const visible = filtered.slice((page - 1) * 8, page * 8);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Análise dos licitantes
        </h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Confira a situação documental e registre o resultado de cada
          licitante.
        </p>
      </div>
      <details className="border-b border-[var(--border-subtle)] pb-4">
        <summary className="w-fit cursor-pointer text-sm font-semibold text-[var(--color-primary-600)] focus-visible:outline focus-visible:outline-2">
          Adicionar licitante
        </summary>
        <div className="pt-4">{registration}</div>
      </details>
      <div
        role="group"
        aria-label="Filtrar situação da habilitação"
        className="flex flex-wrap gap-1"
      >
        {filters.map((item) => (
          <Button
            key={item.value}
            type="button"
            size="sm"
            variant={filter === item.value ? "secondary" : "ghost"}
            aria-pressed={filter === item.value}
            onClick={() => {
              setFilter(item.value);
              setPage(1);
            }}
          >
            {item.label}{" "}
            <span className="font-normal tabular-nums">
              {item.value === "ALL"
                ? bidders.length
                : bidders.filter(
                    (bidder) => bidder.statusHabilitacao === item.value,
                  ).length}
            </span>
          </Button>
        ))}
      </div>
      {visible.length ? (
        <>
          <div
            role="region"
            aria-label="Tabela de habilitação"
            tabIndex={0}
            className="max-w-full overflow-x-auto rounded-lg border border-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]"
          >
            <Table
              aria-label="Habilitação dos licitantes"
              className="min-w-[850px]"
            >
              <TableHead>
                <tr>
                  <TableHeaderCell>Licitante</TableHeaderCell>
                  <TableHeaderCell>Situação</TableHeaderCell>
                  <TableHeaderCell>Observação</TableHeaderCell>
                  <TableHeaderCell className="text-right">Ação</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {visible.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[320px] whitespace-normal">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {item.razaoSocial}
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        {item.cnpj ?? "CNPJ não informado"}
                        {!item.ativo ? " · Inativo" : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      {statuses[
                        item.statusHabilitacao as keyof typeof statuses
                      ] ?? item.statusHabilitacao}
                    </TableCell>
                    <TableCell className="max-w-[400px] whitespace-normal break-words text-[var(--text-secondary)]">
                      {item.observacaoHabilitacao || "Sem observação"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        aria-label={`Revisar habilitação de ${item.razaoSocial}`}
                        onClick={() => onReview(item)}
                      >
                        Revisar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-secondary)]">
                Exibindo {(page - 1) * 8 + 1}–
                {Math.min(page * 8, filtered.length)} de {filtered.length}{" "}
                licitantes
              </p>
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="border-t border-[var(--border-subtle)] py-8 text-sm text-[var(--text-secondary)]">
          {bidders.length
            ? "Nenhum licitante nesta situação."
            : "Nenhum licitante cadastrado. Adicione um fornecedor para iniciar a análise."}
        </p>
      )}
    </div>
  );
}
