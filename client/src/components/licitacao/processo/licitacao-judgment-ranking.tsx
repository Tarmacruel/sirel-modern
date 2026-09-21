import { useState } from "react";
import {
  propostaSituacaoLabels,
  propostaSituacaoOptions,
} from "@sirel/shared/const";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { formatCurrencyBRL } from "@/lib/formatters";

interface Proposal {
  id: number;
  itemId: number;
  itemCatalogoId?: number | null;
  itemNumero: number | null;
  licitanteNome: string | null;
  fornecedorId: number | null;
  classificacao: number | null;
  situacao: string;
  valorAtualUnitario: number | string;
  valorAtualTotal: number | string;
  justificativa: string | null;
}

export interface JudgmentEdit {
  propostaId: number;
  classificacao?: number;
  situacao: (typeof propostaSituacaoOptions)[number];
  justificativa: string;
}

interface Props {
  items: { id: number; numeroItem: number; descricao: string }[];
  proposals: Proposal[];
  saving: boolean;
  onSave: (edit: JudgmentEdit) => Promise<void>;
  onNewProposal: () => void;
  canCreate: boolean;
  onOpenSupplier: (id: number) => void;
  onOpenItem: (id: number) => void;
}

export function LicitacaoJudgmentRanking({
  items,
  proposals,
  saving,
  onSave,
  onNewProposal,
  canCreate,
  onOpenSupplier,
  onOpenItem,
}: Props) {
  const [itemId, setItemId] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Proposal | null>(null);
  const [rank, setRank] = useState("");
  const [situation, setSituation] =
    useState<JudgmentEdit["situacao"]>("VALIDA");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const visible = proposals
    .filter((proposal) => !itemId || proposal.itemId === Number(itemId))
    .sort(
      (a, b) =>
        (a.itemNumero ?? 0) - (b.itemNumero ?? 0) ||
        (a.classificacao ?? Infinity) - (b.classificacao ?? Infinity) ||
        a.id - b.id,
    );

  const totalPages = Math.max(1, Math.ceil(visible.length / 10));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visible.slice((currentPage - 1) * 10, currentPage * 10);

  function edit(proposal: Proposal) {
    setEditing(proposal);
    setRank(proposal.classificacao?.toString() ?? "");
    setSituation(proposal.situacao as JudgmentEdit["situacao"]);
    setReason(proposal.justificativa ?? "");
    setError(null);
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Classificação das propostas
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Confira a ordem, a situação e a justificativa de cada proposta por
            item.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 rounded-lg"
          disabled={!canCreate}
          onClick={onNewProposal}
        >
          Nova proposta
        </Button>
      </div>
      <div className="max-w-lg">
        <FormField label="Filtrar por item">
          <Select
            value={itemId}
            onChange={(event) => {
              setItemId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os itens</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                Item {item.numeroItem} — {item.descricao}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {visible.length ? (
        <div
          role="region"
          aria-label="Tabela de classificação"
          tabIndex={0}
          className="hidden max-w-full overflow-x-auto rounded-lg border border-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)] md:block"
        >
          <Table
            aria-label="Classificação das propostas"
            className="min-w-[900px]"
          >
            <TableHead>
              <tr>
                <TableHeaderCell>Item / Licitante</TableHeaderCell>
                <TableHeaderCell>Classificação</TableHeaderCell>
                <TableHeaderCell>Situação</TableHeaderCell>
                <TableHeaderCell>Valor unitário atual</TableHeaderCell>
                <TableHeaderCell>Total atual</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Ações</span>
                </TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {pageRows.map((proposal) => (
                <TableRow key={proposal.id}>
                  <TableCell className="min-w-56 max-w-80">
                    {proposal.itemCatalogoId ? (
                      <button
                        type="button"
                        className="text-xs text-[var(--color-primary-600)] hover:underline"
                        onClick={() => onOpenItem(proposal.itemCatalogoId!)}
                      >
                        Item {proposal.itemNumero}
                      </button>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">
                        Item {proposal.itemNumero}
                      </p>
                    )}
                    {proposal.fornecedorId ? (
                      <button
                        type="button"
                        onClick={() => onOpenSupplier(proposal.fornecedorId!)}
                        className="mt-1 text-left font-semibold text-[var(--color-primary-600)]"
                      >
                        {proposal.licitanteNome}
                      </button>
                    ) : (
                      <p className="mt-1 font-semibold text-[var(--text-primary)]">
                        {proposal.licitanteNome}
                      </p>
                    )}
                    {proposal.justificativa ? (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-[var(--text-secondary)]">
                          Ver justificativa
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap break-words">
                          {proposal.justificativa}
                        </p>
                      </details>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    {proposal.classificacao
                      ? `${proposal.classificacao}º lugar`
                      : "Não definida"}
                  </TableCell>
                  <TableCell>
                    {propostaSituacaoLabels[
                      proposal.situacao as keyof typeof propostaSituacaoLabels
                    ] ?? proposal.situacao}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatCurrencyBRL(proposal.valorAtualUnitario)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatCurrencyBRL(proposal.valorAtualTotal)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-lg"
                      aria-label={`Editar classificação de ${proposal.licitanteNome}, item ${proposal.itemNumero}`}
                      onClick={() => edit(proposal)}
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="border-t border-[var(--border-subtle)] py-10 text-sm text-[var(--text-secondary)]">
          {itemId
            ? "Nenhuma proposta registrada para este item."
            : "Nenhuma proposta registrada. Cadastre os licitantes e suas propostas para iniciar o julgamento."}
        </p>
      )}
      {visible.length ? (
        <ul
          aria-label="Classificação por licitante"
          className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)] md:hidden"
        >
          {pageRows.map((proposal) => (
            <li key={proposal.id} className="space-y-3 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-muted)]">
                    Item {proposal.itemNumero} ·{" "}
                    {proposal.classificacao
                      ? `${proposal.classificacao}º lugar`
                      : "Classificação não definida"}
                  </p>
                  {proposal.fornecedorId ? (
                    <button
                      type="button"
                      onClick={() => onOpenSupplier(proposal.fornecedorId!)}
                      className="mt-1 text-left font-semibold text-[var(--color-primary-600)]"
                    >
                      {proposal.licitanteNome}
                    </button>
                  ) : (
                    <p className="mt-1 font-semibold">
                      {proposal.licitanteNome}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 rounded-lg"
                  aria-label={`Editar classificação de ${proposal.licitanteNome}, item ${proposal.itemNumero}`}
                  onClick={() => edit(proposal)}
                >
                  Editar
                </Button>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                {propostaSituacaoLabels[
                  proposal.situacao as keyof typeof propostaSituacaoLabels
                ] ?? proposal.situacao}
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">
                    Unitário atual
                  </dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {formatCurrencyBRL(proposal.valorAtualUnitario)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">
                    Total atual
                  </dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {formatCurrencyBRL(proposal.valorAtualTotal)}
                  </dd>
                </div>
              </dl>
              {proposal.justificativa ? (
                <details className="text-xs text-[var(--text-secondary)]">
                  <summary className="cursor-pointer">
                    Ver justificativa
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words">
                    {proposal.justificativa}
                  </p>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {totalPages > 1 ? (
        <div className="flex justify-end">
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      ) : null}
      <Modal
        open={Boolean(editing)}
        title="Editar classificação"
        description={
          editing
            ? `Item ${editing.itemNumero} · ${editing.licitanteNome}`
            : undefined
        }
        onClose={() => {
          if (!saving) setEditing(null);
        }}
        size="md"
        actions={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="judgment-ranking-form"
              loading={saving}
              disabled={saving}
            >
              Salvar classificação
            </Button>
          </div>
        }
      >
        <form
          id="judgment-ranking-form"
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!editing) return;
            setError(null);
            try {
              await onSave({
                propostaId: editing.id,
                classificacao: rank ? Number(rank) : undefined,
                situacao: situation,
                justificativa: reason,
              });
              setEditing(null);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível salvar a classificação.",
              );
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Classificação">
              <Input
                type="number"
                min={1}
                step={1}
                value={rank}
                disabled={saving}
                onChange={(event) => setRank(event.target.value)}
                placeholder="Não definida"
              />
            </FormField>
            <FormField label="Situação">
              <Select
                value={situation}
                disabled={saving}
                onChange={(event) =>
                  setSituation(event.target.value as JudgmentEdit["situacao"])
                }
              >
                {propostaSituacaoOptions.map((value) => (
                  <option key={value} value={value}>
                    {propostaSituacaoLabels[value]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Justificativa">
            <Textarea
              rows={4}
              maxLength={2000}
              value={reason}
              disabled={saving}
              onChange={(event) => setReason(event.target.value)}
            />
          </FormField>
          {error ? (
            <p role="alert" className="text-sm text-[var(--danger-color)]">
              {error}
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
