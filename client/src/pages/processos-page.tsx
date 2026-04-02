import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { PlusCircle, Search } from "lucide-react";

import {
  modalidadeGrupoLabels,
  modalidadeGrupoOptions,
  processoOrigemCadastroLabels,
  workflowModuleOptions,
} from "@sirel/shared/const";
import { ProcessoCreateModal } from "@/components/processos/processo-create-modal";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatCurrencyBRL, formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";
import { cleanDisplayText } from "@/lib/text";
import { trpc } from "@/lib/trpc";

function toOptionalId(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function statusColor(status: string) {
  if (status === "CONCLUIDO") return "bg-emerald-100 text-emerald-800";
  if (status === "EM_ANDAMENTO") return "bg-[var(--color-primary-100)] text-[var(--color-primary-800)]";
  if (status === "PENDENTE") return "bg-amber-100 text-amber-800";
  return "bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)]";
}

interface ProcessosPageProps {
  processoId?: number;
}

export function ProcessosPage({ processoId }: ProcessosPageProps = {}) {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [secretariaId, setSecretariaId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [moduloAtual, setModuloAtual] = useState("");
  const [modalidadeGrupo, setModalidadeGrupo] = useState<"" | (typeof modalidadeGrupoOptions)[number]>("");
  const [origemFluxo, setOrigemFluxo] = useState<"" | "fluxo" | "fora">("");
  const [ativoFilter, setAtivoFilter] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [somenteParados, setSomenteParados] = useState(false);
  const [somenteObrasServicosEngenharia, setSomenteObrasServicosEngenharia] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pageFeedback, setPageFeedback] = useState<{ variant: "success" | "error"; message: string } | null>(null);

  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      secretariaId: toOptionalId(secretariaId),
      statusId: toOptionalId(statusId),
      moduloAtual: moduloAtual || undefined,
      modalidadeGrupo: modalidadeGrupo || undefined,
      somenteObrasServicosEngenharia: somenteObrasServicosEngenharia || undefined,
      foraDoFluxo: origemFluxo === "" ? undefined : origemFluxo === "fora",
      paradosHaMaisDeSeteDias: somenteParados || undefined,
      ativo: ativoFilter === "todos" ? undefined : ativoFilter === "ativos",
    }),
    [ativoFilter, deferredSearch, modalidadeGrupo, moduloAtual, origemFluxo, page, pageSize, secretariaId, somenteObrasServicosEngenharia, somenteParados, statusId],
  );

  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const summaryQuery = trpc.processos.summary.useQuery(undefined, { retry: false });
  const listQuery = trpc.processos.list.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data?.items ?? [];
  const displayedRows = selectedProcessId ? rows.filter((row) => row.id === selectedProcessId) : rows;
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [ativoFilter, deferredSearch, modalidadeGrupo, moduloAtual, origemFluxo, pageSize, secretariaId, somenteObrasServicosEngenharia, somenteParados, statusId]);

  useEffect(() => {
    if (processoId && processoId > 0) {
      setSelectedProcessId(processoId);
      return;
    }
    if (!rows.length) {
      setSelectedProcessId(null);
      return;
    }
    if (selectedProcessId && !rows.some((row) => row.id === selectedProcessId)) {
      setSelectedProcessId(null);
    }
  }, [processoId, rows, selectedProcessId]);

  const overviewQuery = trpc.processos.overview.useQuery({ processoId: selectedProcessId ?? 0 }, { enabled: Boolean(selectedProcessId), retry: false });
  const setAtivoMutation = trpc.processos.setAtivo.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.processos.summary.invalidate(),
        utils.processos.list.invalidate(),
        utils.processos.overview.invalidate({ processoId: result.id }),
        utils.workflow.summary.invalidate(),
        utils.workflow.list.invalidate(),
        utils.dashboard.summary.invalidate(),
        utils.consultas.search.invalidate(),
      ]);
      setPageFeedback({
        variant: "success",
        message: `Processo ${result.numeroSirel} ${result.ativo ? "reativado" : "inativado"} com sucesso.`,
      });
    },
    onError: (error) => setPageFeedback({ variant: "error", message: error.message }),
  });

  return (
    <div className="space-y-6">
      <SectionCard
        title="Processos"
        description="Visão gerencial do fluxo, incluindo localização atual, tempo parado, fases concluídas e criação de processos regulares ou fora do fluxo."
        action={
          <Button onClick={() => setCreateModalOpen(true)} icon={<PlusCircle className="h-4 w-4" />}>
            Novo processo
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {[
            { label: "Total", value: summaryQuery.data?.total },
            { label: "No fluxo", value: summaryQuery.data?.emFluxo },
            { label: "Fora do fluxo", value: summaryQuery.data?.foraDoFluxo },
            { label: "Publicados", value: summaryQuery.data?.publicados },
            { label: "Parados > 7 dias", value: summaryQuery.data?.paradosHaMaisDeSeteDias },
            { label: "Média de paralisação", value: summaryQuery.data ? `${summaryQuery.data.mediaDiasParado} dias` : undefined },
          ].map((card) => (
            <article key={card.label} className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4 shadow-[var(--shadow-card)]">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">{card.label}</p>
              {summaryQuery.isLoading ? <Skeleton className="mt-3 h-10 w-20" /> : <p className="mt-3 text-3xl font-black text-[var(--text-primary)]">{card.value ?? 0}</p>}
            </article>
          ))}
        </div>
        {pageFeedback ? <Alert className="mt-4" variant={pageFeedback.variant}>{pageFeedback.message}</Alert> : null}
      </SectionCard>

      <SectionCard
        title="Monitoramento gerencial"
        description="Acompanhe o processo em qualquer fase, com filtros de localização, situação e tempo de parada."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-neutral-400)]" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por SIREL, protocolo, administrativo, edital ou objeto" className="pl-9" />
            </div>
            <Select value={secretariaId} onChange={(event) => setSecretariaId(event.target.value)} className="max-w-[220px]">
              <option value="">Todas as secretarias</option>
              {catalogQuery.data?.secretarias.map((item) => <option key={item.id} value={item.id}>{item.sigla} - {item.nome}</option>)}
            </Select>
            <Select value={statusId} onChange={(event) => setStatusId(event.target.value)} className="max-w-[180px]">
              <option value="">Todos os status</option>
              {catalogQuery.data?.statusProcesso.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </Select>
            <Select value={moduloAtual} onChange={(event) => setModuloAtual(event.target.value)} className="max-w-[180px]">
              <option value="">Todos os módulos</option>
              {workflowModuleOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select value={modalidadeGrupo} onChange={(event) => setModalidadeGrupo(event.target.value as typeof modalidadeGrupo)} className="max-w-[220px]">
              <option value="">Todos os tipos de modalidade</option>
              {modalidadeGrupoOptions.map((item) => <option key={item} value={item}>{modalidadeGrupoLabels[item]}</option>)}
            </Select>
            <Select value={origemFluxo} onChange={(event) => setOrigemFluxo(event.target.value as typeof origemFluxo)} className="max-w-[180px]">
              <option value="">Qualquer origem</option>
              <option value="fluxo">No fluxo</option>
              <option value="fora">Fora do fluxo</option>
            </Select>
            <Select value={ativoFilter} onChange={(event) => setAtivoFilter(event.target.value as typeof ativoFilter)} className="max-w-[170px]">
              <option value="ativos">Somente ativos</option>
              <option value="inativos">Somente inativos</option>
              <option value="todos">Todos</option>
            </Select>
            <label className="flex items-center gap-2 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              <Checkbox checked={somenteParados} onChange={(event) => setSomenteParados(event.target.checked)} />
              Somente parados há mais de 7 dias
            </label>
            <label className="flex items-center gap-2 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              <Checkbox checked={somenteObrasServicosEngenharia} onChange={(event) => setSomenteObrasServicosEngenharia(event.target.checked)} />
              Obras e serviços de engenharia
            </label>
          </div>
        }
      >
        <div className="overflow-x-auto rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
          <Table className="min-w-[980px]">
            <TableHead>
              <tr>
                <TableHeaderCell>Processo</TableHeaderCell>
                <TableHeaderCell>Secretaria</TableHeaderCell>
                <TableHeaderCell>Módulo</TableHeaderCell>
                <TableHeaderCell>Etapa</TableHeaderCell>
                <TableHeaderCell>Cadastro</TableHeaderCell>
                <TableHeaderCell>Parado há</TableHeaderCell>
                <TableHeaderCell>Documentos</TableHeaderCell>
                <TableHeaderCell>Contratos</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {listQuery.isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={8}><Skeleton className="h-12 w-full" /></TableCell>
                    </TableRow>
                  ))
                : displayedRows.map((row) => (
                    <TableRow key={row.id} onClick={() => setSelectedProcessId((current) => current === row.id ? null : row.id)} className={row.id === selectedProcessId ? "cursor-pointer bg-[var(--surface-highlight)]" : "cursor-pointer transition hover:bg-[var(--surface-soft)]"}>
                      <TableCell>
                        <div className="font-bold text-[var(--text-primary)]">{row.numeroSirel}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {[
                            row.protocolo ? `Protocolo ${row.protocolo}` : null,
                            row.numeroAdministrativo ? `Adm ${row.numeroAdministrativo}` : null,
                            row.numeroEdital ? `Edital ${row.numeroEdital}` : null,
                          ]
                            .filter(Boolean)
                            .join(" • ") || "Sem protocolo, administrativo ou edital"}
                        </div>
                        {row.origemCadastro === "LEGADO" ? (
                          <span className="mt-2 inline-flex rounded-full bg-[var(--color-primary-100)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary-800)]">
                            {processoOrigemCadastroLabels[row.origemCadastro]}
                          </span>
                        ) : null}
                        {row.foraDoFluxo ? <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Fora do fluxo</span> : null}
                      </TableCell>
                      <TableCell>{cleanDisplayText(row.secretaria)}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-[var(--text-primary)]">{cleanDisplayText(row.moduloAtual ?? "Sem workflow")}</div>
                        <div className="text-xs text-[var(--text-muted)]">{cleanDisplayText(row.situacao ?? "Sem situação")}</div>
                      </TableCell>
                      <TableCell>{cleanDisplayText(row.etapaAtual ?? "Cadastro inicial")}</TableCell>
                      <TableCell>
                        <span className={["inline-flex rounded-full px-3 py-1 text-xs font-bold", row.ativo ? "bg-emerald-100 text-emerald-800" : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)]"].join(" ")}>
                          {row.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </TableCell>
                      <TableCell><div className="font-semibold text-[var(--text-primary)]">{row.diasParado} dia(s)</div><div className="text-xs text-[var(--text-muted)]">{cleanDisplayText(row.ultimaMovimentacao?.descricao ?? "Sem movimentação")}</div></TableCell>
                      <TableCell>{row.documentos}</TableCell>
                      <TableCell>{row.contratosAtivos}/{row.contratos}</TableCell>
                    </TableRow>
                  ))}
              {!listQuery.isLoading && !displayedRows.length ? <TableRow><TableCell colSpan={8} className="text-center text-[var(--text-muted)]">Nenhum processo encontrado para os filtros aplicados.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-secondary)]">
            {selectedProcessId ? (
              <>Exibindo <span className="font-bold text-[var(--text-primary)]">1</span> processo selecionado de <span className="font-bold text-[var(--text-primary)]">{total}</span>.</>
            ) : (
              <>Exibindo <span className="font-bold text-[var(--text-primary)]">{displayedRows.length}</span> de <span className="font-bold text-[var(--text-primary)]">{total}</span> processos.</>
            )}
          </p>
          <div className="flex items-center gap-3">
            {selectedProcessId ? <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedProcessId(null)}>Limpar seleção</Button> : null}
            <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} className="max-w-[140px]">
              {[12, 24, 48].map((option) => <option key={option} value={option}>{option} por página</option>)}
            </Select>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      </SectionCard>

      {selectedProcessId ? (
        <SectionCard
          title="Painel do processo"
          description="Resumo executivo da situação atual do processo selecionado, agora em largura total para facilitar a leitura."
          action={
            overviewQuery.data?.processo ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedProcessId(null)}>
                  Mostrar todos
                </Button>
                <Button
                  variant={overviewQuery.data.processo.ativo ? "destructive" : "outline"}
                  onClick={() =>
                    void setAtivoMutation.mutateAsync({
                      processoId: overviewQuery.data!.processo.id,
                      ativo: !overviewQuery.data!.processo.ativo,
                    })
                  }
                  disabled={setAtivoMutation.isPending}
                >
                  {overviewQuery.data.processo.ativo ? "Inativar processo" : "Reativar processo"}
                </Button>
              </div>
            ) : null
          }
        >
          {overviewQuery.isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-20" />)}</div>
          ) : overviewQuery.error ? (
            <Alert variant="error">Falha ao carregar o resumo do processo selecionado.</Alert>
          ) : !overviewQuery.data ? (
            <Alert variant="warning">O processo selecionado não foi encontrado.</Alert>
          ) : (
            <div className="space-y-6">
              <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-24px_rgba(15,26,109,0.2)]">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-xl font-black text-[var(--color-primary-900)]">{overviewQuery.data.processo.numeroSirel}</h4>
                  {overviewQuery.data.processo.foraDoFluxo ? <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">Fora do fluxo</span> : null}
                  <span className={["inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", overviewQuery.data.processo.ativo ? "bg-emerald-100 text-emerald-800" : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-700)]"].join(" ")}>
                    {overviewQuery.data.processo.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary-700)]">
                  {[
                    overviewQuery.data.processo.protocolo ? `Protocolo ${overviewQuery.data.processo.protocolo}` : null,
                    overviewQuery.data.processo.numeroAdministrativo ? `Adm ${overviewQuery.data.processo.numeroAdministrativo}` : null,
                    overviewQuery.data.processo.numeroEdital ? `Edital ${overviewQuery.data.processo.numeroEdital}` : null,
                  ]
                    .filter(Boolean)
                    .join(" • ") || "Identificadores complementares ainda não informados"}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-neutral-700)]">{cleanDisplayText(overviewQuery.data.processo.objeto)}</p>
              </article>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)] xl:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Módulo atual</p><p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{cleanDisplayText(overviewQuery.data.workflow?.moduloAtual ?? "Sem workflow")}</p><p className="mt-1 text-sm text-[var(--color-neutral-600)]">{cleanDisplayText(overviewQuery.data.workflow?.etapaAtual ?? "Cadastro inicial")}</p></article>
                <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)] xl:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Tempo parado</p><p className="mt-2 text-lg font-black text-[var(--color-primary-900)]">{overviewQuery.data.gerencial.diasParado} dia(s)</p><p className="mt-1 text-sm text-[var(--color-neutral-600)]">Atualizado por último em {formatShortDateTimeBR(overviewQuery.data.workflow?.atualizadoEm ?? overviewQuery.data.processo.atualizadoEm)}</p></article>
                <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Itens</p><p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{overviewQuery.data.gerencial.itens}</p></article>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Documentos</p><p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{overviewQuery.data.gerencial.documentos}</p></article>
                <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Contratos</p><p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{overviewQuery.data.gerencial.contratosAtivos}/{overviewQuery.data.gerencial.contratos}</p></article>
                <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Abertura prevista</p><p className="mt-2 text-2xl font-black text-[var(--color-primary-900)]">{formatShortDateBR(overviewQuery.data.processo.dataAbertura)}</p></article>
              </div>

              <article className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-white px-4 py-4 shadow-[0_12px_24px_-26px_rgba(15,26,109,0.22)]">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-primary-600)]">Parâmetros executivos</p>
                <dl className="mt-3 grid gap-3 text-sm text-[var(--color-neutral-700)] md:grid-cols-2">
                  <div className="flex items-center justify-between gap-4 border-b border-[var(--color-neutral-100)] pb-2"><dt className="text-[var(--color-neutral-500)]">Protocolo</dt><dd className="font-semibold text-[var(--color-primary-900)]">{cleanDisplayText(overviewQuery.data.processo.protocolo ?? "Não informado")}</dd></div>
                  <div className="flex items-center justify-between gap-4 border-b border-[var(--color-neutral-100)] pb-2"><dt className="text-[var(--color-neutral-500)]">Secretaria</dt><dd className="font-semibold text-[var(--color-primary-900)]">{cleanDisplayText(overviewQuery.data.processo.secretaria.nome)}</dd></div>
                  <div className="flex items-center justify-between gap-4 border-b border-[var(--color-neutral-100)] pb-2"><dt className="text-[var(--color-neutral-500)]">Modalidade</dt><dd className="font-semibold text-[var(--color-primary-900)]">{cleanDisplayText(overviewQuery.data.processo.modalidade?.nome ?? "Não informada")}</dd></div>
                  <div className="flex items-center justify-between gap-4 border-b border-[var(--color-neutral-100)] pb-2"><dt className="text-[var(--color-neutral-500)]">Status atual</dt><dd className="font-semibold text-[var(--color-primary-900)]">{cleanDisplayText(overviewQuery.data.processo.statusAtual?.nome ?? "Sem status")}</dd></div>
                  <div className="flex items-center justify-between gap-4 border-b border-[var(--color-neutral-100)] pb-2"><dt className="text-[var(--color-neutral-500)]">Valor estimado</dt><dd className="font-semibold text-[var(--color-primary-900)]">{formatCurrencyBRL(overviewQuery.data.processo.valorEstimado)}</dd></div>
                </dl>
              </article>

              <SectionCard title="Fases do processo" description="Acompanhamento resumido das principais etapas para gestores.">
                <div className="grid gap-3 lg:grid-cols-2">
                  {overviewQuery.data.etapas.map((etapa) => (
                    <article key={etapa.chave} className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[var(--color-primary-900)]">{cleanDisplayText(etapa.label)}</div>
                          <div className="text-sm text-[var(--color-neutral-600)]">{cleanDisplayText(etapa.detalhe)}</div>
                        </div>
                        <span className={["inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]", statusColor(etapa.status)].join(" ")}>{etapa.status}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Últimas movimentações" description="Histórico recente para entender onde o processo avançou ou parou.">
                <div className="space-y-3">
                  {overviewQuery.data.timeline.map((row, index) => (
                    <article key={`${row.moduloDestino}-${index}`} className="rounded-[28px] border border-[rgba(204,225,255,0.92)] bg-[var(--color-primary-50)] px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[var(--color-primary-900)]">{cleanDisplayText(row.descricao)}</div>
                          <div className="text-sm text-[var(--color-neutral-600)]">{cleanDisplayText(row.observacao ?? "Sem observação adicional.")}</div>
                        </div>
                        <div className="text-right text-xs text-[var(--color-neutral-500)]">{cleanDisplayText(row.moduloDestino)} | {formatShortDateTimeBR(row.criadoEm)}</div>
                      </div>
                    </article>
                  ))}
                  {!overviewQuery.data.timeline.length ? <Alert variant="info">Ainda não há movimentações registradas para este processo.</Alert> : null}
                </div>
              </SectionCard>
            </div>
          )}
        </SectionCard>
      ) : null}

      <ProcessoCreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(created) => {
          setSelectedProcessId(created.id);
          setPageFeedback({
            variant: "success",
            message: `Processo ${created.numeroSirel} criado. O fluxo segue a partir do Planejamento ou do módulo excepcional definido.`,
          });
        }}
      />
    </div>
  );
}
