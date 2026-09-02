import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  FileDown,
  FileText,
  Landmark,
  LoaderCircle,
  Search,
} from "lucide-react";
import { documentoTipoOptions } from "@sirel/shared/schemas/documentos";

import { portalPublicoTrpc } from "@/lib/portal-publico-trpc";

const PAGE_SIZE = 12;
type DocumentoTipoPublico = (typeof documentoTipoOptions)[number];

function formatPublicDate(value: unknown) {
  if (!value) return null;

  if (typeof value === "string") {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    }
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getVisibleRange(page: number, limit: number, total: number) {
  if (!total) return "Nenhum processo encontrado";

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  return `${first}–${last} de ${total} processo${total === 1 ? "" : "s"}`;
}

/**
 * Surface dedicated to the public transparency hostname. It deliberately has
 * no authentication, internal navigation or local session persistence.
 */
export function PortalPublicoApp() {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedProcessNumber, setSelectedProcessNumber] = useState<
    string | null
  >(null);
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentType, setDocumentType] = useState<"" | DocumentoTipoPublico>(
    "",
  );
  const [documentClassification, setDocumentClassification] = useState("");

  const processInput = useMemo(
    () => ({
      pagina: page,
      limite: PAGE_SIZE,
      busca: search || undefined,
    }),
    [page, search],
  );
  const processesQuery = portalPublicoTrpc.portalPublico.processos.useQuery(
    processInput,
    {
      staleTime: 30_000,
      retry: 1,
    },
  );
  const documentClassificationsQuery =
    portalPublicoTrpc.portalPublico.classificacoes.useQuery(undefined, {
      staleTime: 60_000,
      retry: 1,
    });
  const documentsInput = useMemo(
    () => ({
      pagina: 1,
      limite: 50,
      ...(selectedProcessNumber
        ? { numeroProcesso: selectedProcessNumber }
        : {}),
      ...(documentSearch.trim() ? { busca: documentSearch.trim() } : {}),
      ...(documentType ? { tipo: documentType } : {}),
      ...(documentClassification
        ? { classificacao: documentClassification }
        : {}),
    }),
    [
      documentClassification,
      documentSearch,
      documentType,
      selectedProcessNumber,
    ],
  );
  const documentsQuery = portalPublicoTrpc.portalPublico.documentos.useQuery(
    documentsInput,
    {
      enabled: Boolean(selectedProcessNumber),
      staleTime: 30_000,
      retry: 1,
    },
  );

  const processes = processesQuery.data?.itens ?? [];
  const total = processesQuery.data?.total ?? 0;
  const limit = processesQuery.data?.limite ?? PAGE_SIZE;
  const currentPage = processesQuery.data?.pagina ?? page;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const selectedProcess = processes.find(
    (processo) => processo.numero === selectedProcessNumber,
  );
  const publicDocuments = documentsQuery.data?.itens ?? [];

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = searchDraft.trim();
    setSearch(nextSearch);
    setPage(1);
    setSelectedProcessNumber(null);
  }

  function clearSearch() {
    setSearchDraft("");
    setSearch("");
    setPage(1);
    setSelectedProcessNumber(null);
  }

  function selectProcess(number: string) {
    setSelectedProcessNumber(number);
  }

  function clearDocumentFilters() {
    setDocumentSearch("");
    setDocumentType("");
    setDocumentClassification("");
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900 selection:bg-sky-200">
      <header className="border-b border-white/15 bg-[#112d4e] text-white">
        <div className="mx-auto flex min-h-20 max-w-6xl items-center gap-4 px-5 py-4 sm:px-8">
          <img
            src="/logo-prefeitura.png"
            alt="Prefeitura Municipal de Teixeira de Freitas"
            className="h-11 w-11 rounded-full bg-white object-contain p-1"
          />
          <div className="min-w-0">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-sky-100">
              Prefeitura Municipal de Teixeira de Freitas
            </p>
            <p className="mt-0.5 text-lg font-extrabold tracking-[-0.02em]">
              Portal da Transparência
            </p>
          </div>
        </div>
      </header>

      <section className="overflow-hidden bg-[#112d4e] text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-14 pt-8 sm:px-8 md:grid-cols-[minmax(0,1fr)_15rem] md:items-end md:pb-16 md:pt-12">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-sky-200">
              Consulta pública
            </p>
            <h1 className="mt-4 font-[var(--font-heading)] text-4xl font-black tracking-[-0.055em] sm:text-5xl">
              Processos e documentos publicados
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
              Consulte os processos ativos divulgados pelo Município e baixe
              apenas os documentos oficialmente aprovados para publicação.
            </p>
          </div>
          <div className="border-l border-sky-200/30 pl-5 text-sm leading-6 text-sky-100 md:pb-1">
            <Landmark
              className="mb-3 h-6 w-6 text-sky-300"
              aria-hidden="true"
            />
            Dados internos, responsáveis, prazos e documentos restritos não são
            exibidos neste ambiente.
          </div>
        </div>
      </section>

      <section className="relative -mt-7 px-5 pb-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <form
            aria-label="Buscar processos publicados"
            onSubmit={submitSearch}
            className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_22px_44px_-30px_rgba(15,39,69,0.7)] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:p-5"
          >
            <label className="relative block">
              <span className="sr-only">
                Buscar por número SIREL, edital ou objeto
              </span>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Número SIREL, edital ou objeto"
                className="h-12 w-full rounded-xl border border-slate-300 bg-slate-50 pl-12 pr-4 text-base text-slate-900 outline-none transition focus:border-sky-600 focus:bg-white focus:ring-4 focus:ring-sky-100"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 font-bold text-white transition hover:bg-sky-800 focus:outline-none focus:ring-4 focus:ring-sky-200"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Pesquisar
            </button>
            {search || searchDraft ? (
              <button
                type="button"
                onClick={clearSearch}
                className="h-12 rounded-xl px-4 font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-200"
              >
                Limpar
              </button>
            ) : null}
          </form>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.62fr)] lg:items-start">
            <section aria-labelledby="processos-publicados-titulo">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-300 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
                    Resultado da consulta
                  </p>
                  <h2
                    id="processos-publicados-titulo"
                    className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-slate-900"
                  >
                    Processos publicados
                  </h2>
                </div>
                <p
                  className="text-sm font-medium text-slate-600"
                  aria-live="polite"
                >
                  {processesQuery.isFetching
                    ? "Atualizando resultados…"
                    : getVisibleRange(currentPage, limit, total)}
                </p>
              </div>

              {processesQuery.isPending ? (
                <div
                  className="flex min-h-44 items-center justify-center gap-3 border-b border-slate-200 text-slate-600"
                  aria-live="polite"
                >
                  <LoaderCircle
                    className="h-5 w-5 animate-spin text-sky-700"
                    aria-hidden="true"
                  />
                  Carregando processos publicados…
                </div>
              ) : null}

              {processesQuery.isError ? (
                <div
                  role="alert"
                  className="mt-5 border-l-4 border-rose-600 bg-rose-50 px-4 py-4 text-sm leading-6 text-rose-950"
                >
                  Não foi possível carregar os processos agora. Tente novamente
                  em alguns instantes.
                </div>
              ) : null}

              {!processesQuery.isPending && !processesQuery.isError ? (
                <div className="divide-y divide-slate-200 border-b border-slate-200">
                  {processes.map((processo) => {
                    const publicationDate = formatPublicDate(
                      processo.dataPublicacao,
                    );
                    const isSelected =
                      processo.numero === selectedProcessNumber;

                    return (
                      <button
                        key={processo.numero}
                        type="button"
                        onClick={() => selectProcess(processo.numero)}
                        aria-pressed={isSelected}
                        aria-label={`Consultar documentos públicos do processo ${processo.numero}`}
                        className="group flex w-full items-start gap-4 py-5 text-left transition hover:bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky-200"
                      >
                        <span
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600 transition group-hover:scale-125"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <strong className="text-sm font-extrabold text-sky-800">
                              {processo.numero}
                            </strong>
                            {processo.modalidade ? (
                              <span className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">
                                {processo.modalidade}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-2 block text-base font-semibold leading-6 text-slate-900">
                            {processo.objeto ||
                              "Objeto publicado sem descrição adicional."}
                          </span>
                          <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                            {processo.edital ? (
                              <span>Edital {processo.edital}</span>
                            ) : null}
                            {processo.secretaria ? (
                              <span>{processo.secretaria}</span>
                            ) : null}
                            {publicationDate ? (
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDays
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                Publicado em {publicationDate}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <ChevronRight
                          className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-sky-700"
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                  {!processes.length ? (
                    <div className="py-12 text-center text-sm leading-6 text-slate-600">
                      Nenhum processo publicado foi encontrado para esta busca.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {totalPages > 1 ? (
                <nav
                  aria-label="Paginação de processos publicados"
                  className="mt-6 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    disabled={currentPage <= 1 || processesQuery.isFetching}
                    onClick={() => {
                      setPage((current) => Math.max(1, current - 1));
                      setSelectedProcessNumber(null);
                    }}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:border-sky-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Anterior
                  </button>
                  <span className="text-sm font-semibold text-slate-600">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={
                      currentPage >= totalPages || processesQuery.isFetching
                    }
                    onClick={() => {
                      setPage((current) => Math.min(totalPages, current + 1));
                      setSelectedProcessNumber(null);
                    }}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 transition hover:border-sky-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Próxima
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </nav>
              ) : null}
            </section>

            <aside
              aria-labelledby="documentos-publicos-titulo"
              className="border-t-4 border-sky-700 bg-white px-5 py-6 shadow-[0_18px_36px_-30px_rgba(15,39,69,0.9)] sm:px-6"
            >
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
                Documentos aprovados
              </p>
              <h2
                id="documentos-publicos-titulo"
                className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-slate-900"
              >
                {selectedProcessNumber
                  ? `Processo ${selectedProcessNumber}`
                  : "Selecione um processo"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {selectedProcess
                  ? selectedProcess.objeto ||
                    "Documentos oficiais disponíveis para consulta."
                  : "Escolha um processo na lista para visualizar os documentos liberados ao público."}
              </p>

              {selectedProcessNumber ? (
                <div className="mt-5 space-y-3 border-y border-slate-200 py-4">
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      Buscar nos documentos
                    </span>
                    <input
                      type="search"
                      value={documentSearch}
                      onChange={(event) =>
                        setDocumentSearch(event.target.value)
                      }
                      placeholder="Título, edital ou classificação"
                      className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-sky-600 focus:bg-white focus:ring-4 focus:ring-sky-100"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Tipo
                      </span>
                      <select
                        value={documentType}
                        onChange={(event) =>
                          setDocumentType(
                            event.target.value as "" | DocumentoTipoPublico,
                          )
                        }
                        className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-sky-600 focus:bg-white focus:ring-4 focus:ring-sky-100"
                      >
                        <option value="">Todos os tipos</option>
                        {documentoTipoOptions.map((tipo) => (
                          <option key={tipo} value={tipo}>
                            {tipo}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Classificação
                      </span>
                      <select
                        value={documentClassification}
                        onChange={(event) =>
                          setDocumentClassification(event.target.value)
                        }
                        className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-sky-600 focus:bg-white focus:ring-4 focus:ring-sky-100"
                      >
                        <option value="">Todas as classificações</option>
                        {documentClassificationsQuery.data?.map(
                          (classificacao) => (
                            <option
                              key={classificacao.codigo}
                              value={classificacao.codigo}
                            >
                              {classificacao.codigo} — {classificacao.nome}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  {documentSearch || documentType || documentClassification ? (
                    <button
                      type="button"
                      onClick={clearDocumentFilters}
                      className="text-sm font-semibold text-sky-800 underline-offset-4 transition hover:text-sky-950 hover:underline focus:outline-none focus:ring-4 focus:ring-sky-100"
                    >
                      Limpar filtros dos documentos
                    </button>
                  ) : null}
                </div>
              ) : null}

              {selectedProcessNumber && documentsQuery.isPending ? (
                <div
                  className="mt-7 flex items-center gap-3 text-sm text-slate-600"
                  aria-live="polite"
                >
                  <LoaderCircle
                    className="h-5 w-5 animate-spin text-sky-700"
                    aria-hidden="true"
                  />
                  Carregando documentos públicos…
                </div>
              ) : null}

              {selectedProcessNumber && documentsQuery.isError ? (
                <div
                  role="alert"
                  className="mt-6 border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-950"
                >
                  Não foi possível carregar os documentos deste processo agora.
                </div>
              ) : null}

              {selectedProcessNumber &&
              !documentsQuery.isPending &&
              !documentsQuery.isError ? (
                <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
                  {publicDocuments.map((documento) => (
                    <a
                      key={`${documento.titulo}-${documento.versao}-${documento.downloadUrl}`}
                      href={documento.downloadUrl}
                      className="group flex items-start gap-3 py-4 transition hover:bg-sky-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                    >
                      <FileText
                        className="mt-0.5 h-5 w-5 shrink-0 text-sky-700"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold leading-5 text-slate-900 group-hover:text-sky-800">
                          {documento.titulo}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-600">
                          {[
                            documento.tipo,
                            documento.classificacao ?? documento.categoria,
                            documento.versao
                              ? `Versão ${documento.versao}`
                              : null,
                            formatPublicDate(documento.dataReferencia),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <FileDown
                        className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-y-0.5 group-hover:text-sky-700"
                        aria-hidden="true"
                      />
                    </a>
                  ))}
                  {!publicDocuments.length ? (
                    <p className="py-6 text-sm leading-6 text-slate-600">
                      Não há documentos aprovados para publicação neste
                      processo.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-300 bg-white px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-sm leading-6 text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>Portal público do SIREL — Sistema de Licitações.</p>
          <p>Consulta atualizada conforme as publicações aprovadas.</p>
        </div>
      </footer>
    </main>
  );
}
