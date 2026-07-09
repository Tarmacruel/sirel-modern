import { Link } from "wouter";
import { ArrowRight, CalendarClock, FileText, Search, X } from "lucide-react";

import {
  licitacaoStatusLabels,
  licitacaoStatusOptions,
  modalidadeGrupoLabels,
  modalidadeGrupoOptions,
} from "@sirel/shared/const";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { cleanDisplayText } from "@/lib/text";
import type { LicitacaoModalidadeGrupo } from "@/lib/licitacao-workspaces";

export type LicitacaoStatusFilter =
  | ""
  | (typeof licitacaoStatusOptions)[number];

export type LicitacaoModalidadeGrupoFilter = "" | LicitacaoModalidadeGrupo;

export type OverlayIntensity = "soft" | "default" | "strong";

export interface LicitacaoProcessListRow {
  processoId: number;
  numeroSirel: string;
  dataEntradaLicitacao: string | Date | null;
  numeroEdital?: string | null;
  objeto?: string | null;
  secretaria: string;
  modalidade?: string | null;
  modalidadeCodigo?: string | null;
  etapaAtual?: string | null;
  atualizadoEm: string | Date;
  statusLicitacao: (typeof licitacaoStatusOptions)[number];
  condutorNome?: string | null;
  dataPublicacaoEdital?: string | Date | null;
  dataRecebimentoPropostasFim?: string | Date | null;
  dataInicioLances?: string | Date | null;
  proximaEtapa?: string | null;
  proximaData?: string | Date | null;
}

interface LicitacaoProcessListProps {
  title: string;
  subtitle: string;
  activeChip: string;
  total: number;
  rows: LicitacaoProcessListRow[];
  isLoading: boolean;
  hasError: boolean;
  unsupportedMessage?: string;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onBackToHub: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: LicitacaoStatusFilter;
  onStatusFilterChange: (value: LicitacaoStatusFilter) => void;
  secretariaId: string;
  onSecretariaIdChange: (value: string) => void;
  secretarias: Array<{ id: number; nome: string }>;
  modalidadeGrupo: LicitacaoModalidadeGrupoFilter;
  modalidadeGrupoLocked?: boolean;
  onModalidadeGrupoChange: (value: LicitacaoModalidadeGrupoFilter) => void;
  somenteObrasServicosEngenharia: boolean;
  onSomenteObrasServicosEngenhariaChange: (value: boolean) => void;
  onPageSizeChange: (value: number) => void;
  selectedRow: LicitacaoProcessListRow | null;
  onSelectProcesso: (processoId: number) => void;
  onCloseDetails: () => void;
  overlayIntensity: OverlayIntensity;
  onOverlayIntensityChange: (value: OverlayIntensity) => void;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "HOMOLOGACAO":
    case "CONTRATACAO":
      return "bg-[var(--success-bg)] text-[var(--success-color)]";
    case "RECURSOS":
      return "bg-[var(--warning-bg)] text-[var(--warning-color)]";
    case "FRACASSADA":
    case "CANCELADA":
      return "bg-[var(--danger-bg)] text-[var(--danger-color)]";
    default:
      return "bg-[var(--info-bg)] text-[var(--info-color)]";
  }
}

function overlayClass(intensity: OverlayIntensity) {
  if (intensity === "soft") return "bg-black/30";
  if (intensity === "strong") return "bg-black/80";
  return "bg-[var(--bg-overlay)]";
}

function getActiveFilterCount(params: {
  search: string;
  statusFilter: LicitacaoStatusFilter;
  secretariaId: string;
  modalidadeGrupo: LicitacaoModalidadeGrupoFilter;
  somenteObrasServicosEngenharia: boolean;
  modalidadeGrupoLocked?: boolean;
}) {
  return [
    params.search.trim(),
    params.statusFilter,
    params.secretariaId,
    params.modalidadeGrupoLocked ? "" : params.modalidadeGrupo,
    params.somenteObrasServicosEngenharia ? "obra" : "",
  ].filter(Boolean).length;
}

export function LicitacaoProcessList({
  title,
  subtitle,
  activeChip,
  total,
  rows,
  isLoading,
  hasError,
  unsupportedMessage,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onBackToHub,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  secretariaId,
  onSecretariaIdChange,
  secretarias,
  modalidadeGrupo,
  modalidadeGrupoLocked = false,
  onModalidadeGrupoChange,
  somenteObrasServicosEngenharia,
  onSomenteObrasServicosEngenhariaChange,
  onPageSizeChange,
  selectedRow,
  onSelectProcesso,
  onCloseDetails,
  overlayIntensity,
  onOverlayIntensityChange,
}: LicitacaoProcessListProps) {
  const activeFilterCount = getActiveFilterCount({
    search,
    statusFilter,
    secretariaId,
    modalidadeGrupo,
    somenteObrasServicosEngenharia,
    modalidadeGrupoLocked,
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-5 shadow-[var(--shadow-card)] lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary-600)]">
              {activeChip}
            </span>
            <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
              {total} processo(s)
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-[var(--text-primary)]">
            {title}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {subtitle}
          </p>
        </div>

        <Button type="button" variant="outline" onClick={onBackToHub}>
          Voltar as modalidades
        </Button>
      </div>

      <details
        open
        className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 shadow-[var(--shadow-card)]"
      >
        <summary className="cursor-pointer text-sm font-bold text-[var(--text-primary)]">
          Filtros secundarios
          {activeFilterCount ? (
            <span className="ml-2 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
              {activeFilterCount}
            </span>
          ) : null}
        </summary>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[260px] flex-1">
              <FormField label="Busca textual">
                <div className="flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2">
                  <Search className="h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Processo, objeto ou secretaria"
                    className="w-full border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                </div>
              </FormField>
            </div>

            <div className="w-[220px]">
              <FormField label="Status">
                <Select
                  value={statusFilter}
                  onChange={(event) =>
                    onStatusFilterChange(
                      event.target.value as LicitacaoStatusFilter,
                    )
                  }
                >
                  <option value="">Todos</option>
                  {licitacaoStatusOptions.map((item) => (
                    <option key={item} value={item}>
                      {licitacaoStatusLabels[item]}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="w-[240px]">
              <FormField label="Secretaria">
                <Select
                  value={secretariaId}
                  onChange={(event) => onSecretariaIdChange(event.target.value)}
                >
                  <option value="">Todas</option>
                  {secretarias.map((secretaria) => (
                    <option key={secretaria.id} value={secretaria.id}>
                      {secretaria.nome}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="w-[220px]">
              <FormField label="Tipo de modalidade">
                <Select
                  value={modalidadeGrupo}
                  disabled={modalidadeGrupoLocked}
                  onChange={(event) =>
                    onModalidadeGrupoChange(
                      event.target.value as LicitacaoModalidadeGrupoFilter,
                    )
                  }
                >
                  <option value="">Todos</option>
                  {modalidadeGrupoOptions.map((item) => (
                    <option key={item} value={item}>
                      {modalidadeGrupoLabels[item]}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="w-[140px]">
              <FormField label="Por pagina">
                <Select
                  value={String(pageSize)}
                  onChange={(event) =>
                    onPageSizeChange(Number(event.target.value))
                  }
                >
                  {[12, 24, 48].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            <Checkbox
              checked={somenteObrasServicosEngenharia}
              onChange={(event) =>
                onSomenteObrasServicosEngenhariaChange(event.target.checked)
              }
            />
            Obras e servicos de engenharia
          </label>
        </div>
      </details>

      {unsupportedMessage ? (
        <Alert variant="info" title="Filtro em preparacao">
          {unsupportedMessage}
        </Alert>
      ) : isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : rows.length ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-[26px] border border-[var(--table-border)] bg-[var(--surface-card)]">
            <Table className="min-w-[1160px]">
              <TableHead>
                <tr>
                  <TableHeaderCell>Processo</TableHeaderCell>
                  <TableHeaderCell>Objeto</TableHeaderCell>
                  <TableHeaderCell>Secretaria</TableHeaderCell>
                  <TableHeaderCell>Etapa</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Proxima data</TableHeaderCell>
                  <TableHeaderCell>Atualizado</TableHeaderCell>
                  <TableHeaderCell className="text-right">
                    Acoes
                  </TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.processoId}
                    className="cursor-pointer hover:bg-[var(--table-row-hover)]"
                    onClick={() => onSelectProcesso(row.processoId)}
                  >
                    <TableCell>
                      <div className="font-bold text-[var(--text-primary)]">
                        {row.numeroSirel}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {row.modalidade ?? "Licitacao"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div
                        className="max-w-[360px] truncate"
                        title={cleanDisplayText(row.objeto ?? "")}
                      >
                        {cleanDisplayText(row.objeto || "Sem objeto informado")}
                      </div>
                    </TableCell>
                    <TableCell>{cleanDisplayText(row.secretaria)}</TableCell>
                    <TableCell>
                      <div className="font-semibold text-[var(--text-primary)]">
                        {cleanDisplayText(row.etapaAtual)}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {cleanDisplayText(row.condutorNome ?? "Sem condutor")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(row.statusLicitacao)}`}
                      >
                        {licitacaoStatusLabels[row.statusLicitacao]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {row.proximaData ? (
                        <div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]">
                            {cleanDisplayText(
                              row.proximaEtapa ?? "Proxima etapa",
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            {formatShortDateBR(row.proximaData)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-secondary)]">
                          Sem data prevista
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatShortDateTimeBR(row.atualizadoEm)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className="flex justify-end gap-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Link
                          href={`/dossie/${row.processoId}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2 text-sm font-semibold text-[var(--accent-color)] transition hover:border-[var(--accent-color)]"
                        >
                          Dossie
                          <FileText className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/licitacao/${row.processoId}`}
                          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2 text-sm font-semibold text-[var(--accent-color)] transition hover:border-[var(--accent-color)]"
                        >
                          Abrir
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Exibindo{" "}
              <span className="font-bold text-[var(--text-primary)]">
                {rows.length}
              </span>{" "}
              de{" "}
              <span className="font-bold text-[var(--text-primary)]">
                {total}
              </span>{" "}
              processos
            </p>
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
          </div>
        </div>
      ) : hasError ? (
        <Alert variant="error">Falha ao carregar a fila da Licitacao.</Alert>
      ) : (
        <Alert variant="info">
          Nenhum processo esta atualmente nesta fila de Licitacao.
        </Alert>
      )}

      {selectedRow ? (
        <div className="pointer-events-none fixed inset-0 z-[110]">
          <button
            type="button"
            className={`pointer-events-auto absolute inset-y-0 left-0 ${overlayClass(overlayIntensity)} backdrop-blur-[2px]`}
            style={{ right: "min(640px, 100vw)" }}
            onClick={onCloseDetails}
            aria-label="Fechar detalhes"
          />

          <aside className="pointer-events-auto absolute right-0 top-0 z-[130] h-full w-full max-w-[640px] overflow-y-auto border-l border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-lg)]">
            <div className="sticky top-0 z-10 border-b border-[var(--border-color)] bg-[var(--surface-card)] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Processo
                  </p>
                  <h2 className="mt-1 text-3xl font-black text-[var(--text-primary)]">
                    {selectedRow.numeroSirel}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {cleanDisplayText(selectedRow.modalidade ?? "Licitacao")} •{" "}
                    {cleanDisplayText(selectedRow.secretaria)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onCloseDetails}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] text-[var(--text-secondary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs font-semibold">
                <span className="text-[var(--text-muted)]">Overlay</span>
                {(["soft", "default", "strong"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onOverlayIntensityChange(item)}
                    className={[
                      "rounded-full border px-3 py-1 capitalize",
                      overlayIntensity === item
                        ? "border-[var(--accent-color)] bg-[var(--sidebar-active)] text-[var(--accent-color)]"
                        : "border-[var(--border-color)] text-[var(--text-secondary)]",
                    ].join(" ")}
                  >
                    {item === "default"
                      ? "Padrao"
                      : item === "soft"
                        ? "Suave"
                        : "Forte"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Responsavel
                </p>
                <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                  {cleanDisplayText(
                    selectedRow.condutorNome ?? "Sem responsavel",
                  )}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Status
                </p>
                <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                  {licitacaoStatusLabels[selectedRow.statusLicitacao]}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Entrada na licitacao
                </p>
                <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                  {formatShortDateBR(selectedRow.dataEntradaLicitacao)}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Objeto completo
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">
                  {cleanDisplayText(
                    selectedRow.objeto || "Sem objeto informado.",
                  )}
                </p>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Cronograma
                </p>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 text-[var(--accent-color)]" />
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">
                        Publicacao
                      </div>
                      <div className="text-[var(--text-secondary)]">
                        {formatShortDateBR(selectedRow.dataPublicacaoEdital)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 text-[var(--accent-color)]" />
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">
                        Recebimento de propostas
                      </div>
                      <div className="text-[var(--text-secondary)]">
                        {formatShortDateBR(
                          selectedRow.dataRecebimentoPropostasFim,
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 text-[var(--accent-color)]" />
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">
                        Disputa
                      </div>
                      <div className="text-[var(--text-secondary)]">
                        {formatShortDateBR(selectedRow.dataInicioLances)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Link href={`/dossie/${selectedRow.processoId}`}>
                  <Button variant="outline" className="w-full">
                    <FileText className="mr-2 h-4 w-4" />
                    Dossie
                  </Button>
                </Link>
                <Link href={`/licitacao/${selectedRow.processoId}`}>
                  <Button className="w-full">Abrir fase</Button>
                </Link>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onCloseDetails}
                >
                  Fechar
                </Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
