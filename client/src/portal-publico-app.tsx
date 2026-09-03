import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  FileDown,
  FileText,
  Landmark,
  LoaderCircle,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { documentoTipoOptions } from "@sirel/shared/schemas/documentos";

import { portalPublicoTrpc } from "@/lib/portal-publico-trpc";
import "./styles/portal-publico.css";

const PAGE_SIZE = 12;
const portalThemeStorageKey = "sirel-transparencia-theme";

type DocumentoTipoPublico = (typeof documentoTipoOptions)[number];
type PortalTheme = "light" | "dark";

function resolvePortalTheme(): PortalTheme {
  if (typeof window === "undefined") return "light";

  const savedTheme = window.localStorage.getItem(portalThemeStorageKey);
  return savedTheme === "dark" || savedTheme === "light" ? savedTheme : "light";
}

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
  const [theme, setTheme] = useState<PortalTheme>(resolvePortalTheme);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(portalThemeStorageKey, theme);
  }, [theme]);

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
    <main
      className="portal-publico"
      data-portal-theme={theme}
      data-testid="portal-publico"
    >
      <header className="portal-publico__header">
        <div className="portal-publico__container portal-publico__header-inner">
          <div className="portal-publico__brand">
            <div className="portal-publico__brand-mark">
              <img
                src="/logo-prefeitura.png"
                alt="Prefeitura Municipal de Teixeira de Freitas"
              />
            </div>
            <div>
              <p className="portal-publico__brand-overline">
                Prefeitura Municipal de Teixeira de Freitas
              </p>
              <p className="portal-publico__brand-name">
                Portal da Transparência
              </p>
            </div>
          </div>

          <div
            className="portal-publico__theme-switch"
            role="group"
            aria-label="Aparência do portal"
          >
            <button
              type="button"
              className="portal-publico__theme-button"
              data-active={theme === "light"}
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
            >
              <Sun aria-hidden="true" />
              <span>Claro</span>
            </button>
            <button
              type="button"
              className="portal-publico__theme-button"
              data-active={theme === "dark"}
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
            >
              <Moon aria-hidden="true" />
              <span>Escuro</span>
            </button>
          </div>
        </div>
      </header>

      <section
        className="portal-publico__intro"
        aria-labelledby="portal-publico-titulo"
      >
        <div className="portal-publico__container portal-publico__intro-grid">
          <div className="portal-publico__intro-copy">
            <p className="portal-publico__eyebrow">Consulta pública</p>
            <h1 id="portal-publico-titulo">
              Processos e documentos publicados
            </h1>
            <p className="portal-publico__intro-description">
              Consulte licitações ativas e acesse somente os documentos
              oficialmente aprovados para publicação.
            </p>
          </div>

          <aside className="portal-publico__intro-note">
            <Landmark aria-hidden="true" />
            <p>
              Dados internos, responsáveis, prazos e documentos restritos não
              são exibidos neste ambiente.
            </p>
          </aside>
        </div>
      </section>

      <section className="portal-publico__workspace">
        <div className="portal-publico__container">
          <form
            aria-label="Buscar processos publicados"
            onSubmit={submitSearch}
            className="portal-publico__search"
          >
            <label className="portal-publico__search-field">
              <span className="sr-only">
                Buscar por número SIREL, edital ou objeto
              </span>
              <Search aria-hidden="true" />
              <input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Número SIREL, edital ou objeto"
              />
            </label>
            <button
              type="submit"
              className="portal-publico__button portal-publico__button--primary"
            >
              <Search aria-hidden="true" />
              Pesquisar
            </button>
            {search || searchDraft ? (
              <button
                type="button"
                onClick={clearSearch}
                className="portal-publico__button portal-publico__button--quiet"
              >
                Limpar
              </button>
            ) : null}
          </form>

          <div className="portal-publico__content-grid">
            <section
              className="portal-publico__results"
              aria-labelledby="processos-publicados-titulo"
            >
              <div className="portal-publico__section-heading">
                <div>
                  <p className="portal-publico__eyebrow">
                    Resultado da consulta
                  </p>
                  <h2 id="processos-publicados-titulo">Processos publicados</h2>
                </div>
                <p className="portal-publico__result-count" aria-live="polite">
                  {processesQuery.isFetching
                    ? "Atualizando resultados…"
                    : getVisibleRange(currentPage, limit, total)}
                </p>
              </div>

              {processesQuery.isPending ? (
                <div className="portal-publico__loading" aria-live="polite">
                  <LoaderCircle aria-hidden="true" />
                  Carregando processos publicados…
                </div>
              ) : null}

              {processesQuery.isError ? (
                <div className="portal-publico__notice" role="alert">
                  Não foi possível carregar os processos agora. Tente novamente
                  em alguns instantes.
                </div>
              ) : null}

              {!processesQuery.isPending && !processesQuery.isError ? (
                <div className="portal-publico__process-list">
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
                        className="portal-publico__process"
                        data-selected={isSelected}
                      >
                        <span
                          className="portal-publico__process-marker"
                          aria-hidden="true"
                        />
                        <span className="portal-publico__process-content">
                          <span className="portal-publico__process-kicker">
                            <strong>{processo.numero}</strong>
                            {processo.modalidade ? (
                              <span>{processo.modalidade}</span>
                            ) : null}
                          </span>
                          <span className="portal-publico__process-title">
                            {processo.objeto ||
                              "Objeto publicado sem descrição adicional."}
                          </span>
                          <span className="portal-publico__process-meta">
                            {processo.edital ? (
                              <span>Edital {processo.edital}</span>
                            ) : null}
                            {processo.secretaria ? (
                              <span>{processo.secretaria}</span>
                            ) : null}
                            {publicationDate ? (
                              <span className="portal-publico__date">
                                <CalendarDays aria-hidden="true" />
                                Publicado em {publicationDate}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <ChevronRight
                          className="portal-publico__process-arrow"
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                  {!processes.length ? (
                    <div className="portal-publico__empty-state">
                      Nenhum processo publicado foi encontrado para esta busca.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {totalPages > 1 ? (
                <nav
                  aria-label="Paginação de processos publicados"
                  className="portal-publico__pagination"
                >
                  <button
                    type="button"
                    disabled={currentPage <= 1 || processesQuery.isFetching}
                    onClick={() => {
                      setPage((current) => Math.max(1, current - 1));
                      setSelectedProcessNumber(null);
                    }}
                    className="portal-publico__button portal-publico__button--outline"
                  >
                    <ArrowLeft aria-hidden="true" />
                    Anterior
                  </button>
                  <span>
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
                    className="portal-publico__button portal-publico__button--outline"
                  >
                    Próxima
                    <ArrowRight aria-hidden="true" />
                  </button>
                </nav>
              ) : null}
            </section>

            <aside
              className="portal-publico__documents"
              aria-labelledby="documentos-publicos-titulo"
            >
              <div className="portal-publico__documents-heading">
                <p className="portal-publico__eyebrow">Documentos aprovados</p>
                <h2 id="documentos-publicos-titulo">
                  {selectedProcessNumber
                    ? `Processo ${selectedProcessNumber}`
                    : "Selecione um processo"}
                </h2>
                <p>
                  {selectedProcess
                    ? selectedProcess.objeto ||
                      "Documentos oficiais disponíveis para consulta."
                    : "Escolha um processo na lista para visualizar os documentos liberados ao público."}
                </p>
              </div>

              {selectedProcessNumber ? (
                <div className="portal-publico__document-filters">
                  <label className="portal-publico__field">
                    <span>Buscar nos documentos</span>
                    <input
                      type="search"
                      value={documentSearch}
                      onChange={(event) =>
                        setDocumentSearch(event.target.value)
                      }
                      placeholder="Título, edital ou classificação"
                    />
                  </label>
                  <div className="portal-publico__filter-grid">
                    <label className="portal-publico__field">
                      <span>Tipo</span>
                      <select
                        value={documentType}
                        onChange={(event) =>
                          setDocumentType(
                            event.target.value as "" | DocumentoTipoPublico,
                          )
                        }
                      >
                        <option value="">Todos os tipos</option>
                        {documentoTipoOptions.map((tipo) => (
                          <option key={tipo} value={tipo}>
                            {tipo}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="portal-publico__field">
                      <span>Classificação</span>
                      <select
                        value={documentClassification}
                        onChange={(event) =>
                          setDocumentClassification(event.target.value)
                        }
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
                      className="portal-publico__text-button"
                    >
                      Limpar filtros dos documentos
                    </button>
                  ) : null}
                </div>
              ) : null}

              {selectedProcessNumber && documentsQuery.isPending ? (
                <div className="portal-publico__loading" aria-live="polite">
                  <LoaderCircle aria-hidden="true" />
                  Carregando documentos públicos…
                </div>
              ) : null}

              {selectedProcessNumber && documentsQuery.isError ? (
                <div className="portal-publico__notice" role="alert">
                  Não foi possível carregar os documentos deste processo agora.
                </div>
              ) : null}

              {selectedProcessNumber &&
              !documentsQuery.isPending &&
              !documentsQuery.isError ? (
                <div className="portal-publico__document-list">
                  {publicDocuments.map((documento) => (
                    <a
                      key={`${documento.titulo}-${documento.versao}-${documento.downloadUrl}`}
                      href={documento.downloadUrl}
                      className="portal-publico__document"
                    >
                      <FileText
                        className="portal-publico__document-icon"
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{documento.titulo}</strong>
                        <small>
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
                        </small>
                      </span>
                      <FileDown
                        className="portal-publico__download-icon"
                        aria-hidden="true"
                      />
                    </a>
                  ))}
                  {!publicDocuments.length ? (
                    <p className="portal-publico__empty-documents">
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

      <footer className="portal-publico__footer">
        <div className="portal-publico__container">
          <p>Portal público do SIREL — Sistema de Licitações.</p>
          <p>Consulta atualizada conforme as publicações aprovadas.</p>
        </div>
      </footer>
    </main>
  );
}
