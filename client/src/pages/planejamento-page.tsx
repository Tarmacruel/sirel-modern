import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Search, ShoppingCart } from "lucide-react";

import { MacroTransitionModal } from "@/components/shared/macro-transition-modal";
import { ProcessMacroPanel } from "@/components/shared/process-macro-panel";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatCurrencyBRL } from "@/lib/formatters";
import { deriveMacroPhaseStatuses } from "@/lib/process-macro-flow";
import { cleanDisplayText } from "@/lib/text";
import { trpc } from "@/lib/trpc";

function etapaStatusLabel(existe: number | null, concluido: boolean | null, pendente = "Nao iniciada") {
  if (!existe) return pendente;
  return concluido ? "Concluida" : "Em elaboracao";
}

function etapaStatusClass(existe: number | null, concluido: boolean | null) {
  if (!existe) return "bg-slate-100 text-slate-700";
  return concluido ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800";
}

export function PlanejamentoPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [somenteSemDfd, setSomenteSemDfd] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [transitionModalOpen, setTransitionModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(() => ({ search: deferredSearch || undefined, somenteSemDfd }), [deferredSearch, somenteSemDfd]);
  const listQuery = trpc.planejamento.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data ?? [];

  useEffect(() => {
    if (!rows.length) {
      setSelectedProcessId(null);
      return;
    }
    if (!selectedProcessId || !rows.some((item) => item.processoId === selectedProcessId)) {
      setSelectedProcessId(rows[0].processoId);
    }
  }, [rows, selectedProcessId]);

  const selectedRow = rows.find((item) => item.processoId === selectedProcessId) ?? null;
  const overviewQuery = trpc.processos.overview.useQuery(
    { processoId: selectedProcessId ?? 0 },
    { enabled: Boolean(selectedProcessId), retry: false },
  );
  const gateQuery = trpc.processos.macroPhaseGate.useQuery(
    { processoId: selectedProcessId ?? 0, moduloDestino: "COMPRAS" },
    { enabled: Boolean(selectedProcessId), retry: false },
  );

  const advanceMutation = trpc.processos.advanceMacroPhase.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.planejamento.list.invalidate(),
        utils.processos.overview.invalidate(),
        utils.processos.list.invalidate(),
        utils.processos.summary.invalidate(),
        utils.workflow.list.invalidate(),
        utils.workflow.byProcesso.invalidate(),
      ]);
      setFeedback("Processo encaminhado para Compras com sucesso.");
      setErrorMessage(null);
      setTransitionModalOpen(false);
    },
    onError: (error) => {
      setFeedback(null);
      setErrorMessage(error.message);
    },
  });

  const summary = overviewQuery.data
    ? [
        { label: "Itens do processo", value: String(overviewQuery.data.gerencial.itens) },
        { label: "Documentos", value: String(overviewQuery.data.gerencial.documentos) },
        { label: "Dias parado", value: String(overviewQuery.data.gerencial.diasParado) },
        {
          label: "Valor estimado",
          value: overviewQuery.data.processo.valorEstimado ? formatCurrencyBRL(overviewQuery.data.processo.valorEstimado) : "Nao consolidado",
          tone: "accent" as const,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

      {selectedRow ? (
        <ProcessMacroPanel
          moduleLabel="Planejamento"
          title={`Planejamento do processo ${selectedRow.numeroSirel}`}
          processNumber={selectedRow.numeroSirel}
          modalidade={overviewQuery.data?.processo.modalidade?.nome ?? null}
          secretaria={cleanDisplayText(selectedRow.secretaria)}
          etapaAtual={cleanDisplayText(selectedRow.etapaAtual)}
          objeto={cleanDisplayText(overviewQuery.data?.processo.objeto ?? selectedRow.objeto)}
          foraDoFluxo={overviewQuery.data?.processo.foraDoFluxo ?? false}
          phaseStatuses={deriveMacroPhaseStatuses(overviewQuery.data?.workflow?.moduloAtual ?? "PLANEJAMENTO")}
          summary={summary}
          blockers={gateQuery.data?.blockers ?? []}
          targetLabel="Compras"
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href={`/planejamento/dfd/${selectedRow.processoId}`}><Button variant="outline" size="sm">DFD</Button></Link>
              <Link href={`/planejamento/etp/${selectedRow.processoId}`}><Button variant="outline" size="sm">ETP</Button></Link>
              <Link href={`/planejamento/cotacoes/${selectedRow.processoId}`}><Button variant="outline" size="sm">Cotacoes</Button></Link>
              <Link href={`/planejamento/tr/${selectedRow.processoId}`}><Button variant="outline" size="sm">TR externo</Button></Link>
            </div>
          }
          footer={
            <Button icon={<ShoppingCart className="h-4 w-4" />} onClick={() => setTransitionModalOpen(true)} disabled={!selectedProcessId || gateQuery.isLoading}>
              Encaminhar para Compras
            </Button>
          }
        />
      ) : null}

      <SectionCard
        title="Planejamento"
        description="Fila operacional das etapas DFD, ETP e cotacoes preliminares. Cada fase abre em tela propria dentro do modulo."
        action={
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <FormField label="Buscar">
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Processo, objeto ou secretaria"
                  className="w-full border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
              </div>
            </FormField>
            <FormField label="Filtro">
              <label className="flex h-11 items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 text-sm font-semibold text-[var(--text-secondary)]">
                <Checkbox checked={somenteSemDfd} onChange={(event) => setSomenteSemDfd(event.target.checked)} />
                Somente sem DFD
              </label>
            </FormField>
          </div>
        }
      >
        {listQuery.isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-80" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Fila do Planejamento</p>
                <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{rows.length}</p>
              </article>
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">DFDs concluidas</p>
                <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{rows.filter((item) => item.dfdConcluido).length}</p>
              </article>
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">ETPs concluidos</p>
                <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{rows.filter((item) => item.etpConcluido).length}</p>
              </article>
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">TRs concluidos</p>
                <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{rows.filter((item) => item.trConcluido).length}</p>
              </article>
              <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Cotacoes registradas</p>
                <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{rows.reduce((acc, item) => acc + item.cotacoesCount, 0)}</p>
              </article>
            </div>

            <div className="mt-4 overflow-x-auto rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
              <Table className="min-w-[760px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>DFD</TableHeaderCell>
                    <TableHeaderCell>ETP</TableHeaderCell>
                    <TableHeaderCell>TR</TableHeaderCell>
                    <TableHeaderCell>Cotacoes</TableHeaderCell>
                    <TableHeaderCell className="text-right">Acoes</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {rows.map((item) => (
                    <TableRow
                      key={item.processoId}
                      className={[
                        "cursor-pointer transition hover:bg-[var(--surface-soft)]",
                        item.processoId === selectedProcessId ? "bg-[var(--surface-highlight)]" : "",
                      ].join(" ")}
                      onClick={() => setSelectedProcessId(item.processoId)}
                    >
                      <TableCell className="align-top">
                        <div className="font-bold text-[var(--text-primary)]">{item.numeroSirel}</div>
                        <div className="text-xs text-[var(--text-muted)]">{cleanDisplayText(item.secretaria)}</div>
                        <div className="mt-2 text-xs text-[var(--text-muted)]">{cleanDisplayText(item.etapaAtual)}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <span className={["inline-flex rounded-full px-3 py-1 text-xs font-bold", etapaStatusClass(item.dfdId, item.dfdConcluido)].join(" ")}>
                          {etapaStatusLabel(item.dfdId, item.dfdConcluido)}
                        </span>
                        <div className="mt-2 text-xs text-[var(--text-muted)]">{item.itensCount} item(ns)</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <span className={["inline-flex rounded-full px-3 py-1 text-xs font-bold", etapaStatusClass(item.etpId, item.etpConcluido)].join(" ")}>
                          {etapaStatusLabel(item.etpId, item.etpConcluido)}
                        </span>
                      </TableCell>
                      <TableCell className="align-top">
                        <span className={["inline-flex rounded-full px-3 py-1 text-xs font-bold", etapaStatusClass(item.trId, item.trConcluido)].join(" ")}>
                          {etapaStatusLabel(item.trId, item.trConcluido)}
                        </span>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-bold text-[var(--text-primary)]">{item.cotacoesCount}</div>
                        <div className="text-xs text-[var(--text-muted)]">registros lancados</div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <div className="flex flex-wrap justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                          <Link href={`/planejamento/dfd/${item.processoId}`} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]">DFD</Link>
                          <Link href={`/planejamento/etp/${item.processoId}`} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]">ETP</Link>
                          <Link href={`/planejamento/cotacoes/${item.processoId}`} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent-color)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)]">Cotacoes<ArrowRight className="h-3.5 w-3.5" /></Link>
                          <Link href={`/planejamento/tr/${item.processoId}`} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]">TR externo</Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rows.length ? (
                    <TableRow>
                      <TableCell className="py-8 text-center text-[var(--text-muted)]" colSpan={6}>
                        Nenhum processo em Planejamento. Crie um processo no fluxo regular para iniciar a DFD.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4">
              <Alert variant="info" title="Fluxo da fase">
                O Planejamento agora opera em quatro superficies dedicadas: DFD, ETP, cotacoes preliminares e TR externo. A passagem para Compras so acontece quando a base minima estiver consistente, ou com bypass auditado para cenarios excepcionais.
              </Alert>
            </div>
          </>
        )}
      </SectionCard>

      <MacroTransitionModal
        open={transitionModalOpen}
        onClose={() => setTransitionModalOpen(false)}
        title={selectedRow ? `Encaminhar ${selectedRow.numeroSirel} para Compras` : "Encaminhar para Compras"}
        targetLabel="Compras"
        blockers={gateQuery.data?.blockers ?? []}
        loading={advanceMutation.isPending}
        onConfirm={async (payload) => {
          if (!selectedProcessId) return;
          await advanceMutation.mutateAsync({
            processoId: selectedProcessId,
            moduloDestino: "COMPRAS",
            permitirBypass: payload.permitirBypass,
            justificativaAuditoria: payload.justificativaAuditoria,
            observacao: payload.observacao,
          });
        }}
      />
    </div>
  );
}
