import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

import { licitacaoStatusOptions } from "@sirel/shared/const";
import { LicitacaoProcessList } from "@/components/licitacao/licitacao-process-list";
import type {
  LicitacaoModalidadeGrupoFilter,
  LicitacaoProcessListRow,
  LicitacaoStatusFilter,
  OverlayIntensity,
} from "@/components/licitacao/licitacao-process-list";
import { LicitacaoWorkspaceHub } from "@/components/licitacao/licitacao-workspace-hub";
import {
  buildLicitacaoHubHref,
  buildLicitacaoWorkspaceHref,
  getLicitacaoWorkspaceModalidadeGrupo,
  getLicitacaoWorkspaceUnsupportedMessage,
  isLicitacaoWorkspaceFilterSupported,
  licitacaoWorkspaces,
  resolveLicitacaoWorkspaceRoute,
  type LicitacaoWorkspaceKey,
} from "@/lib/licitacao-workspaces";
import { trpc } from "@/lib/trpc";

const overlayStorageKey = "sirel-overlay-intensity";

function resolveOverlayIntensity(): OverlayIntensity {
  if (typeof window === "undefined") return "default";
  const saved = window.localStorage.getItem(overlayStorageKey);
  if (saved === "soft" || saved === "default" || saved === "strong") {
    return saved;
  }
  return "default";
}

function getSearchFromLocation(location: string) {
  const queryIndex = location.indexOf("?");
  if (queryIndex >= 0) return location.slice(queryIndex);
  if (typeof window === "undefined") return "";
  return window.location.search;
}

export function LicitacaoPage() {
  const [location, setLocation] = useLocation();
  const [routeSearch, setRouteSearch] = useState(() =>
    getSearchFromLocation(location),
  );
  const routeState = useMemo(
    () => resolveLicitacaoWorkspaceRoute(routeSearch),
    [routeSearch],
  );
  const selectedWorkspace = routeState.workspace;
  const workspaceModalidadeGrupo =
    getLicitacaoWorkspaceModalidadeGrupo(selectedWorkspace);
  const workspaceFilterSupported =
    isLicitacaoWorkspaceFilterSupported(selectedWorkspace);
  const unsupportedMessage =
    getLicitacaoWorkspaceUnsupportedMessage(selectedWorkspace);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LicitacaoStatusFilter>("");
  const [secretariaId, setSecretariaId] = useState("");
  const [modalidadeGrupo, setModalidadeGrupo] =
    useState<LicitacaoModalidadeGrupoFilter>("");
  const [somenteObrasServicosEngenharia, setSomenteObrasServicosEngenharia] =
    useState(false);
  const [overlayIntensity, setOverlayIntensity] = useState<OverlayIntensity>(
    resolveOverlayIntensity,
  );
  const [selectedProcessoId, setSelectedProcessoId] = useState<number | null>(
    null,
  );

  const deferredSearch = useDeferredValue(search.trim());
  const effectiveModalidadeGrupo = workspaceModalidadeGrupo ?? modalidadeGrupo;

  const filters = useMemo(
    () => ({
      page,
      pageSize,
      search: deferredSearch || undefined,
      statusLicitacao: statusFilter || undefined,
      secretariaId: secretariaId ? Number(secretariaId) : undefined,
      modalidadeGrupo: effectiveModalidadeGrupo || undefined,
      somenteObrasServicosEngenharia:
        somenteObrasServicosEngenharia || undefined,
    }),
    [
      deferredSearch,
      effectiveModalidadeGrupo,
      page,
      pageSize,
      secretariaId,
      somenteObrasServicosEngenharia,
      statusFilter,
    ],
  );

  const summaryQuery = trpc.licitacao.summary.useQuery(undefined, {
    retry: false,
  });
  const catalogosQuery = trpc.cadastros.formOptions.useQuery(undefined, {
    retry: false,
  });
  const credenciamentosCountQuery = trpc.licitacao.list.useQuery(
    { page: 1, pageSize: 1, modalidadeGrupo: "CREDENCIAMENTO" },
    { retry: false, enabled: routeState.showHub },
  );
  const dispensasCountQuery = trpc.licitacao.list.useQuery(
    { page: 1, pageSize: 1, modalidadeGrupo: "DISPENSA" },
    { retry: false, enabled: routeState.showHub },
  );
  const inexigibilidadesCountQuery = trpc.licitacao.list.useQuery(
    { page: 1, pageSize: 1, modalidadeGrupo: "INEXIGIBILIDADE" },
    { retry: false, enabled: routeState.showHub },
  );
  const pregoesCountQuery = trpc.licitacao.list.useQuery(
    { page: 1, pageSize: 1, modalidadeGrupo: "PREGAO" },
    { retry: false, enabled: routeState.showHub },
  );
  const concorrenciasCountQuery = trpc.licitacao.list.useQuery(
    { page: 1, pageSize: 1, modalidadeGrupo: "CONCORRENCIA" },
    { retry: false, enabled: routeState.showHub },
  );
  const listQuery = trpc.licitacao.list.useQuery(filters, {
    retry: false,
    enabled: !routeState.showHub && workspaceFilterSupported,
    placeholderData: (previous) => previous,
  });

  const countByWorkspace = useMemo(
    () => ({
      credenciamentos: {
        count: credenciamentosCountQuery.data?.total ?? null,
        loading: credenciamentosCountQuery.isLoading,
      },
      dispensas: {
        count: dispensasCountQuery.data?.total ?? null,
        loading: dispensasCountQuery.isLoading,
      },
      inexigibilidades: {
        count: inexigibilidadesCountQuery.data?.total ?? null,
        loading: inexigibilidadesCountQuery.isLoading,
      },
      pregoes: {
        count: pregoesCountQuery.data?.total ?? null,
        loading: pregoesCountQuery.isLoading,
      },
      concorrencias: {
        count: concorrenciasCountQuery.data?.total ?? null,
        loading: concorrenciasCountQuery.isLoading,
      },
      "atas-adesoes": {
        count: null,
        loading: false,
      },
      todos: {
        count: summaryQuery.data?.total ?? null,
        loading: summaryQuery.isLoading,
      },
    }),
    [
      concorrenciasCountQuery.data?.total,
      concorrenciasCountQuery.isLoading,
      credenciamentosCountQuery.data?.total,
      credenciamentosCountQuery.isLoading,
      dispensasCountQuery.data?.total,
      dispensasCountQuery.isLoading,
      inexigibilidadesCountQuery.data?.total,
      inexigibilidadesCountQuery.isLoading,
      pregoesCountQuery.data?.total,
      pregoesCountQuery.isLoading,
      summaryQuery.data?.total,
      summaryQuery.isLoading,
    ],
  );

  const workspaceCards = useMemo(
    () =>
      licitacaoWorkspaces.map((workspace) => ({
        workspace,
        count: countByWorkspace[workspace.key].count,
        loading: countByWorkspace[workspace.key].loading,
      })),
    [countByWorkspace],
  );

  const rows: LicitacaoProcessListRow[] =
    !routeState.showHub && workspaceFilterSupported
      ? (listQuery.data?.items ?? [])
      : [];
  const total =
    !routeState.showHub && workspaceFilterSupported
      ? (listQuery.data?.total ?? 0)
      : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedRow = useMemo(
    () => rows.find((row) => row.processoId === selectedProcessoId) ?? null,
    [rows, selectedProcessoId],
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(overlayStorageKey, overlayIntensity);
    }
  }, [overlayIntensity]);

  useEffect(() => {
    setRouteSearch(getSearchFromLocation(location));
  }, [location]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncRouteSearch = () => setRouteSearch(window.location.search);
    window.addEventListener("popstate", syncRouteSearch);

    return () => {
      window.removeEventListener("popstate", syncRouteSearch);
    };
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedProcessoId(null);
  }, [
    deferredSearch,
    effectiveModalidadeGrupo,
    pageSize,
    routeState.showHub,
    selectedWorkspace?.key,
    secretariaId,
    somenteObrasServicosEngenharia,
    statusFilter,
  ]);

  function handleSelectWorkspace(workspace: LicitacaoWorkspaceKey) {
    const href = buildLicitacaoWorkspaceHref(workspace);
    setPage(1);
    setModalidadeGrupo("");
    setSelectedProcessoId(null);
    setRouteSearch(getSearchFromLocation(href));
    setLocation(href);
  }

  function handleBackToHub() {
    const href = buildLicitacaoHubHref();
    setSelectedProcessoId(null);
    setRouteSearch("");
    setLocation(href);
  }

  if (routeState.showHub) {
    return (
      <LicitacaoWorkspaceHub
        cards={workspaceCards}
        onSelect={handleSelectWorkspace}
      />
    );
  }

  const listTitle = selectedWorkspace?.title ?? "Todos os processos";
  const listSubtitle = selectedWorkspace?.modalidadeGrupo
    ? "Fila filtrada por modalidade."
    : selectedWorkspace?.customFilter
      ? "Fila dedicada aguardando classificacao."
      : "Consulta geral da licitacao.";
  const activeChip = selectedWorkspace?.shortTitle ?? "Todos";
  const visibleModalidadeGrupo =
    workspaceModalidadeGrupo ?? modalidadeGrupo ?? "";

  return (
    <LicitacaoProcessList
      title={listTitle}
      subtitle={listSubtitle}
      activeChip={activeChip}
      total={total}
      rows={rows}
      isLoading={listQuery.isLoading}
      hasError={Boolean(listQuery.error)}
      unsupportedMessage={unsupportedMessage}
      page={page}
      pageSize={pageSize}
      totalPages={totalPages}
      onPageChange={setPage}
      onBackToHub={handleBackToHub}
      search={search}
      onSearchChange={setSearch}
      statusFilter={statusFilter}
      onStatusFilterChange={(value) => {
        if (value === "" || licitacaoStatusOptions.includes(value)) {
          setStatusFilter(value);
        }
      }}
      secretariaId={secretariaId}
      onSecretariaIdChange={setSecretariaId}
      secretarias={catalogosQuery.data?.secretarias ?? []}
      modalidadeGrupo={visibleModalidadeGrupo}
      modalidadeGrupoLocked={Boolean(workspaceModalidadeGrupo)}
      onModalidadeGrupoChange={setModalidadeGrupo}
      somenteObrasServicosEngenharia={somenteObrasServicosEngenharia}
      onSomenteObrasServicosEngenhariaChange={setSomenteObrasServicosEngenharia}
      onPageSizeChange={setPageSize}
      selectedRow={selectedRow}
      onSelectProcesso={setSelectedProcessoId}
      onCloseDetails={() => setSelectedProcessoId(null)}
      overlayIntensity={overlayIntensity}
      onOverlayIntensityChange={setOverlayIntensity}
    />
  );
}
