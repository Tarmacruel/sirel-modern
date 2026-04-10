import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CalendarClock, FileText, Search, X } from "lucide-react";

import {
  licitacaoStatusLabels,
  licitacaoStatusOptions,
  modalidadeGrupoLabels,
  modalidadeGrupoOptions,
} from "@sirel/shared/const";
import { PageIntro } from "@/components/shared/page-intro";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { cleanDisplayText } from "@/lib/text";
import { trpc } from "@/lib/trpc";

type OverlayIntensity = "soft" | "default" | "strong";

const overlayStorageKey = "sirel-overlay-intensity";

function resolveOverlayIntensity(): OverlayIntensity {
  if (typeof window === "undefined") return "default";
  const saved = window.localStorage.getItem(overlayStorageKey);
  if (saved === "soft" || saved === "default" || saved === "strong") {
    return saved;
  }
  return "default";
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

export function LicitacaoPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | (typeof licitacaoStatusOptions)[number]>("");
  const [secretariaId, setSecretariaId] = useState("");
  const [modalidadeGrupo, setModalidadeGrupo] = useState<"" | (typeof modalidadeGrupoOptions)[number]>("");
  const [somenteObrasServicosEngenharia, setSomenteObrasServicosEngenharia] = useState(false);
  const [overlayIntensity, setOverlayIntensity] = useState<OverlayIntensity>(resolveOverlayIntensity);
  const [selectedProcessoId, setSelectedProcessoId] = useState<number | null>(null);

  const deferredSearch = useDeferredValue(search.trim());

  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      statusLicitacao: statusFilter || undefined,
      secretariaId: secretariaId ? Number(secretariaId) : undefined,
      modalidadeGrupo: modalidadeGrupo || undefined,
      somenteObrasServicosEngenharia: somenteObrasServicosEngenharia || undefined,
    }),
    [deferredSearch, modalidadeGrupo, page, pageSize, secretariaId, somenteObrasServicosEngenharia, statusFilter],
  );

  const summaryQuery = trpc.licitacao.summary.useQuery(undefined, { retry: false });
  const catalogosQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const listQuery = trpc.licitacao.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });

  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedRow = useMemo(() => rows.find((row) => row.processoId === selectedProcessoId) ?? null, [rows, selectedProcessoId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(overlayStorageKey, overlayIntensity);
    }
  }, [overlayIntensity]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, modalidadeGrupo, pageSize, secretariaId, somenteObrasServicosEngenharia, statusFilter]);

  return (
    <div className="space-y-5">
      <PageIntro
        eyebrow="Ciclo principal"
        title="Licitacao orientada por agenda, status e ritmo de decisao."
        description="A entrada do modulo destaca o que esta publicado, o que ainda depende de publicidade e onde existem sinais de friccao operacional antes de abrir cada processo."
        dataTourId="licitacao-intro"
        meta={[
          { label: "Em Licitacao", value: String(summaryQuery.data?.total ?? 0) },
          { label: "Publicados", value: String(summaryQuery.data?.publicados ?? 0) },
          { label: "Recursos pendentes", value: String(summaryQuery.data?.recursosPendentes ?? 0) },
        ]}
        aside={
          <div className="rounded-[24px] border border-white/12 bg-white/[0.08] p-4 text-white backdrop-blur-sm xl:max-w-[340px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-100/70">O que priorizar primeiro</p>
            <p className="mt-3 text-sm leading-7 text-slate-200">
              Combine filtros com a agenda do painel lateral para atacar publicacoes pendentes, recursos e cronogramas criticos sem perder a visao global da fila.
            </p>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Em Licitacao</p>
          <p className="mt-2 text-3xl font-black text-[var(--text-primary)]">{summaryQuery.data?.total ?? 0}</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Processos ativos no modulo.</p>
        </article>
        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Publicados</p>
          <p className="mt-2 text-3xl font-black text-[var(--text-primary)]">{summaryQuery.data?.publicados ?? 0}</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Com edital e cronograma ativos.</p>
        </article>
        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Aguardando publicidade</p>
          <p className="mt-2 text-3xl font-black text-[var(--text-primary)]">{summaryQuery.data?.aguardandoPublicacao ?? 0}</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Fase interna pendente.</p>
        </article>
        <article className="rounded-[26px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Recursos pendentes</p>
          <p className="mt-2 text-3xl font-black text-[var(--text-primary)]">{summaryQuery.data?.recursosPendentes ?? 0}</p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Demandas recursais sem decisao.</p>
        </article>
      </div>

      <SectionCard title="Modulo de Licitacao" description="Visao geral e acompanhamento operacional dos processos.">
        <div data-tour-id="licitacao-list" className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[260px] flex-1">
              <FormField label="Busca textual">
                <div className="flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2">
                  <Search className="h-4 w-4 text-[var(--text-muted)]" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Processo, objeto ou secretaria"
                    className="w-full border-none bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                </div>
              </FormField>
            </div>

            <div className="w-[220px]">
              <FormField label="Status">
                <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | (typeof licitacaoStatusOptions)[number])}>
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
                <Select value={secretariaId} onChange={(event) => setSecretariaId(event.target.value)}>
                  <option value="">Todas</option>
                  {(catalogosQuery.data?.secretarias ?? []).map((secretaria) => (
                    <option key={secretaria.id} value={secretaria.id}>
                      {secretaria.nome}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="w-[220px]">
              <FormField label="Tipo de modalidade">
                <Select value={modalidadeGrupo} onChange={(event) => setModalidadeGrupo(event.target.value as typeof modalidadeGrupo)}>
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
                <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))}>
                  {[12, 24, 48].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>

          <div>
            <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              <Checkbox checked={somenteObrasServicosEngenharia} onChange={(event) => setSomenteObrasServicosEngenharia(event.target.checked)} />
              Obras e servicos de engenharia
            </label>
          </div>

          {listQuery.isLoading ? (
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
                      <TableHeaderCell className="text-right">Acoes</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.processoId} className="cursor-pointer hover:bg-[var(--table-row-hover)]" onClick={() => setSelectedProcessoId(row.processoId)}>
                        <TableCell>
                          <div className="font-bold text-[var(--text-primary)]">{row.numeroSirel}</div>
                          <div className="text-xs text-[var(--text-secondary)]">{row.modalidade ?? "Licitacao"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[360px] truncate" title={cleanDisplayText(row.objeto ?? "")}>{cleanDisplayText(row.objeto || "Sem objeto informado")}</div>
                        </TableCell>
                        <TableCell>{cleanDisplayText(row.secretaria)}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-[var(--text-primary)]">{cleanDisplayText(row.etapaAtual)}</div>
                          <div className="text-xs text-[var(--text-secondary)]">{cleanDisplayText(row.condutorNome ?? "Sem condutor")}</div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(row.statusLicitacao)}`}>
                            {licitacaoStatusLabels[row.statusLicitacao]}
                          </span>
                        </TableCell>
                        <TableCell>
                          {row.proximaData ? (
                            <div>
                              <div className="text-sm font-semibold text-[var(--text-primary)]">{cleanDisplayText(row.proximaEtapa ?? "Proxima etapa")}</div>
                              <div className="text-xs text-[var(--text-secondary)]">{formatShortDateBR(row.proximaData)}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--text-secondary)]">Sem data prevista</span>
                          )}
                        </TableCell>
                        <TableCell>{formatShortDateTimeBR(row.atualizadoEm)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                            <Link href={`/dossie/${row.processoId}`} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2 text-sm font-semibold text-[var(--accent-color)] transition hover:border-[var(--accent-color)]">
                              Dossie
                              <FileText className="h-4 w-4" />
                            </Link>
                            <Link href={`/licitacao/${row.processoId}`} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2 text-sm font-semibold text-[var(--accent-color)] transition hover:border-[var(--accent-color)]">
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
                  Exibindo <span className="font-bold text-[var(--text-primary)]">{rows.length}</span> de <span className="font-bold text-[var(--text-primary)]">{total}</span> processos
                </p>
                <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
              </div>

              <Alert variant="info" title="Leitura da fila">
                Priorize processos com publicacao pendente, recursos em aberto e etapas criticas com data proxima para reduzir friccao entre agenda e execucao.
              </Alert>
            </div>
          ) : listQuery.error ? (
            <Alert variant="error">Falha ao carregar a fila da Licitacao.</Alert>
          ) : (
            <Alert variant="info">Nenhum processo esta atualmente no modulo de Licitacao.</Alert>
          )}
        </div>
      </SectionCard>

      {selectedRow ? (
        <div className="pointer-events-none fixed inset-0 z-[110]">
          <button
            type="button"
            className={`pointer-events-auto absolute inset-y-0 left-0 ${overlayClass(overlayIntensity)} backdrop-blur-[2px]`}
            style={{ right: "min(640px, 100vw)" }}
            onClick={() => setSelectedProcessoId(null)}
            aria-label="Fechar detalhes"
          />

          <aside className="pointer-events-auto absolute right-0 top-0 z-[130] h-full w-full max-w-[640px] overflow-y-auto border-l border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-lg)]">
            <div className="sticky top-0 z-10 border-b border-[var(--border-color)] bg-[var(--surface-card)] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Processo</p>
                  <h2 className="mt-1 text-3xl font-black text-[var(--text-primary)]">{selectedRow.numeroSirel}</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{cleanDisplayText(selectedRow.modalidade ?? "Licitacao")} • {cleanDisplayText(selectedRow.secretaria)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProcessoId(null)}
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
                    onClick={() => setOverlayIntensity(item)}
                    className={[
                      "rounded-full border px-3 py-1 capitalize",
                      overlayIntensity === item
                        ? "border-[var(--accent-color)] bg-[var(--sidebar-active)] text-[var(--accent-color)]"
                        : "border-[var(--border-color)] text-[var(--text-secondary)]",
                    ].join(" ")}
                  >
                    {item === "default" ? "Padrao" : item === "soft" ? "Suave" : "Forte"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Responsavel</p>
                <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{cleanDisplayText(selectedRow.condutorNome ?? "Sem responsavel")}</p>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Status</p>
                <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{licitacaoStatusLabels[selectedRow.statusLicitacao]}</p>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Entrada na licitacao</p>
                <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{formatShortDateBR(selectedRow.dataEntradaLicitacao)}</p>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Objeto completo</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{cleanDisplayText(selectedRow.objeto || "Sem objeto informado.")}</p>
              </div>

              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Cronograma</p>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 text-[var(--accent-color)]" />
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">Publicacao</div>
                      <div className="text-[var(--text-secondary)]">{formatShortDateBR(selectedRow.dataPublicacaoEdital)}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 text-[var(--accent-color)]" />
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">Recebimento de propostas</div>
                      <div className="text-[var(--text-secondary)]">{formatShortDateBR(selectedRow.dataRecebimentoPropostasFim)}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 text-[var(--accent-color)]" />
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">Disputa</div>
                      <div className="text-[var(--text-secondary)]">{formatShortDateBR(selectedRow.dataInicioLances)}</div>
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
                <Button variant="outline" className="w-full" onClick={() => setSelectedProcessoId(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
