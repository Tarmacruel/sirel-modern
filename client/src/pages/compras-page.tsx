import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, FileSpreadsheet, Search } from "lucide-react";

import { MacroTransitionModal } from "@/components/shared/macro-transition-modal";
import { ProcessMacroPanel } from "@/components/shared/process-macro-panel";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatCurrencyBRL, formatShortDateTimeBR } from "@/lib/formatters";
import { deriveMacroPhaseStatuses } from "@/lib/process-macro-flow";
import { cleanDisplayText } from "@/lib/text";
import { trpc } from "@/lib/trpc";

export function ComprasPage() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [transitionModalOpen, setTransitionModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      moduloAtual: "COMPRAS",
      ativo: true,
    }),
    [deferredSearch, page, pageSize],
  );

  const listQuery = trpc.processos.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (!rows.length) {
      setSelectedProcessId(null);
      return;
    }
    if (!selectedProcessId || !rows.some((item) => item.id === selectedProcessId)) {
      setSelectedProcessId(rows[0].id);
    }
  }, [rows, selectedProcessId]);

  const selectedRow = rows.find((item) => item.id === selectedProcessId) ?? null;
  const overviewQuery = trpc.processos.overview.useQuery(
    { processoId: selectedProcessId ?? 0 },
    { enabled: Boolean(selectedProcessId), retry: false },
  );
  const gateQuery = trpc.processos.macroPhaseGate.useQuery(
    { processoId: selectedProcessId ?? 0, moduloDestino: "LICITACAO" },
    { enabled: Boolean(selectedProcessId), retry: false },
  );

  const advanceMutation = trpc.processos.advanceMacroPhase.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.processos.list.invalidate(),
        utils.processos.summary.invalidate(),
        utils.processos.overview.invalidate(),
        utils.workflow.list.invalidate(),
        utils.workflow.byProcesso.invalidate(),
        utils.licitacao.list.invalidate(),
        utils.licitacao.summary.invalidate(),
        utils.licitacao.detail.invalidate(),
      ]);
      setFeedback("Processo encaminhado para Licitacao com sucesso.");
      setErrorMessage(null);
      setTransitionModalOpen(false);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });

  const summary = selectedRow && overviewQuery.data
    ? [
        {
          label: "Valor estimado",
          value: selectedRow.valorEstimado ? formatCurrencyBRL(Number(selectedRow.valorEstimado)) : "Nao consolidado",
          tone: "accent" as const,
        },
        { label: "Cotacoes preliminares", value: String(selectedRow.cotacoesPreliminares ?? 0) },
        { label: "Documentos", value: String(overviewQuery.data.gerencial.documentos) },
        { label: "Dias parado", value: String(overviewQuery.data.gerencial.diasParado) },
      ]
    : [];

  return (
    <div className="space-y-6">
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

      {selectedRow ? (
        <ProcessMacroPanel
          moduleLabel="Compras"
          title={`Consolidacao de compras do processo ${selectedRow.numeroSirel}`}
          processNumber={selectedRow.numeroSirel}
          modalidade={overviewQuery.data?.processo.modalidade?.nome ?? null}
          secretaria={cleanDisplayText(selectedRow.secretaria)}
          etapaAtual={cleanDisplayText(selectedRow.etapaAtual)}
          objeto={cleanDisplayText(overviewQuery.data?.processo.objeto ?? selectedRow.objeto)}
          foraDoFluxo={overviewQuery.data?.processo.foraDoFluxo ?? false}
          phaseStatuses={deriveMacroPhaseStatuses(overviewQuery.data?.workflow?.moduloAtual ?? "COMPRAS")}
          summary={summary}
          blockers={gateQuery.data?.blockers ?? []}
          targetLabel="Licitacao"
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href={`/planejamento/cotacoes/${selectedRow.id}`}><Button variant="outline" size="sm">Mapa comparativo</Button></Link>
              <Link href={`/planejamento/tr/${selectedRow.id}`}><Button variant="outline" size="sm">TR externo</Button></Link>
              <Link href={`/processos/${selectedRow.id}`}><Button variant="outline" size="sm">Painel do processo</Button></Link>
            </div>
          }
          footer={
            <Button icon={<ArrowRight className="h-4 w-4" />} onClick={() => setTransitionModalOpen(true)} disabled={!selectedProcessId || gateQuery.isLoading}>
              Encaminhar para Licitacao
            </Button>
          }
        />
      ) : null}

      <SectionCard
        title="Compras"
        description="Superficie operacional para consolidar precos, validar a base estimada e liberar o processo para a fase licitatoria."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[260px] items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2">
              <Search className="h-4 w-4 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Processo, objeto ou secretaria"
                className="w-full border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>
            <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} className="max-w-[150px]">
              {[12, 24, 48].map((option) => <option key={option} value={option}>{option} por pagina</option>)}
            </Select>
          </div>
        }
      >
        {listQuery.isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28" />)}
            </div>
            <Skeleton className="h-80" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Em Compras</p>
                <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{total}</p>
              </article>
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Com valor consolidado</p>
                <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{rows.filter((item) => Number(item.valorEstimado ?? 0) > 0).length}</p>
              </article>
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Fora do fluxo</p>
                <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{rows.filter((item) => item.foraDoFluxo).length}</p>
              </article>
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Parados ha 7+ dias</p>
                <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{rows.filter((item) => item.diasParado >= 7).length}</p>
              </article>
            </div>

            <div className="mt-4 overflow-x-auto rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
              <Table className="min-w-[920px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Secretaria</TableHeaderCell>
                    <TableHeaderCell>Etapa atual</TableHeaderCell>
                    <TableHeaderCell>Cotacoes</TableHeaderCell>
                    <TableHeaderCell>Documentos</TableHeaderCell>
                    <TableHeaderCell>Valor estimado</TableHeaderCell>
                    <TableHeaderCell className="text-right">Acoes</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={[
                        "cursor-pointer transition hover:bg-[var(--surface-soft)]",
                        row.id === selectedProcessId ? "bg-[var(--surface-highlight)]" : "",
                      ].join(" ")}
                      onClick={() => setSelectedProcessId(row.id)}
                    >
                      <TableCell className="align-top">
                        <div className="font-bold text-[var(--text-primary)]">{row.numeroSirel}</div>
                        <div className="text-xs text-[var(--text-muted)]">{cleanDisplayText(row.modalidade ?? "Modalidade em definicao")}</div>
                        <div className="mt-2 text-xs text-[var(--text-muted)]">Atualizado em {formatShortDateTimeBR(row.workflowAtualizadoEm ?? row.criadoEm)}</div>
                      </TableCell>
                      <TableCell className="align-top">{cleanDisplayText(row.secretaria)}</TableCell>
                      <TableCell className="align-top">
                        <div className="font-semibold text-[var(--text-primary)]">{cleanDisplayText(row.etapaAtual ?? "Consolidacao em Compras")}</div>
                        <div className="text-xs text-[var(--text-muted)]">{cleanDisplayText(row.situacao ?? "EM_ANDAMENTO")}</div>
                      </TableCell>
                      <TableCell className="align-top">{row.cotacoesPreliminares}</TableCell>
                      <TableCell className="align-top">{row.documentos}</TableCell>
                      <TableCell className="align-top font-semibold text-[var(--text-primary)]">{row.valorEstimado ? formatCurrencyBRL(Number(row.valorEstimado)) : "Nao consolidado"}</TableCell>
                      <TableCell className="text-right align-top">
                        <div className="flex flex-wrap justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                          <Link href={`/planejamento/cotacoes/${row.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]">Cotacoes</Link>
                          <Link href={`/processos/${row.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent-color)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]">Abrir painel<ArrowRight className="h-3.5 w-3.5" /></Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rows.length ? (
                    <TableRow>
                      <TableCell className="py-8 text-center text-[var(--text-muted)]" colSpan={7}>
                        Nenhum processo esta em Compras no momento. Quando a consolidacao vier do Planejamento, ela aparecera aqui.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--text-secondary)]">Exibindo <span className="font-bold text-[var(--text-primary)]">{rows.length}</span> de <span className="font-bold text-[var(--text-primary)]">{total}</span> processos em Compras.</p>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>

            <div className="mt-4">
              <Alert variant="info" title="Ritmo operacional">
                Compras concentra a consolidacao final do valor estimado, o fechamento do mapa comparativo e a preparacao documental para abertura da Licitacao. Se houver urgencia operacional, o avanco pode ser liberado com bypass auditado.
              </Alert>
            </div>
          </>
        )}
      </SectionCard>

      <MacroTransitionModal
        open={transitionModalOpen}
        onClose={() => setTransitionModalOpen(false)}
        title={selectedRow ? `Encaminhar ${selectedRow.numeroSirel} para Licitacao` : "Encaminhar para Licitacao"}
        targetLabel="Licitacao"
        blockers={gateQuery.data?.blockers ?? []}
        loading={advanceMutation.isPending}
        onConfirm={async (payload) => {
          if (!selectedProcessId) return;
          await advanceMutation.mutateAsync({
            processoId: selectedProcessId,
            moduloDestino: "LICITACAO",
            permitirBypass: payload.permitirBypass,
            justificativaAuditoria: payload.justificativaAuditoria,
            observacao: payload.observacao,
          });
        }}
      />
    </div>
  );
}
