import {
  Archive,
  ChevronRight,
  Clock3,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderArchive,
  FolderPlus,
  Image,
  LayoutGrid,
  LoaderCircle,
  List,
  RefreshCcw,
  Rows3,
  Search,
  ShieldCheck,
  Star,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SectionCard } from "@/components/shared/section-card";
import { Modal } from "@/components/shared/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { uploadArquivo } from "@/lib/arquivos-upload";
import { trpc } from "@/lib/trpc";

type Item = {
  name: string;
  relativePath: string;
  kind: string;
  extension?: string;
  size?: number | null;
  modifiedAt?: string | Date | null;
  previewable?: boolean;
  downloadable?: boolean;
  favorite?: boolean;
  parentPath?: string;
};

type ViewMode = "list" | "grid" | "compact";

const VIEW_MODE_STORAGE_KEY = "sirel.arquivos.view-mode";

function readViewMode(): ViewMode {
  if (typeof window === "undefined") return "list";
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === "grid" || stored === "compact" ? stored : "list";
  } catch {
    return "list";
  }
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!bytes) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: i === 0 ? 0 : 1 })} ${units[i]}`;
}

function iconFor(item: Item) {
  if (item.kind === "folder") return Folder;
  if (item.kind === "pdf") return FileText;
  if (item.kind === "image") return Image;
  if (item.kind === "office") {
    if ([".xls", ".xlsx", ".ods"].includes(item.extension ?? "")) return FileSpreadsheet;
    return FileText;
  }
  if (item.kind === "archive") return Archive;
  return File;
}

function useDebouncedValue<T>(value: T, delayMs = 320) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

function readPath() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("path") ?? "";
}

function setBrowserPath(path: string) {
  const url = new URL(window.location.href);
  if (path) url.searchParams.set("path", path);
  else url.searchParams.delete("path");
  window.history.pushState(null, "", `${url.pathname}${url.search}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function ArquivosPage() {
  const utils = trpc.useUtils();
  const [path, setPath] = useState(readPath);
  const [search, setSearch] = useState("");
  const deferredSearch = useDebouncedValue(search.trim());
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<{ name: string; path: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => setPath(readPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // Preferir o funcionamento da tela mesmo quando o navegador bloqueia o storage.
    }
  }, [viewMode]);

  const summary = trpc.arquivos.summary.useQuery(undefined, { retry: false });
  const list = trpc.arquivos.list.useQuery({ path }, { retry: false, enabled: !deferredSearch });
  const searchQuery = trpc.arquivos.search.useQuery(
    { q: deferredSearch || "__", limit: 100 },
    { retry: false, enabled: deferredSearch.length >= 2 },
  );
  const favoritesQuery = trpc.arquivos.favorites.useQuery(undefined, {
    retry: false,
    enabled: !path && deferredSearch.length < 2,
  });
  const recentQuery = trpc.arquivos.recent.useQuery(undefined, {
    retry: false,
    enabled: !path && deferredSearch.length < 2,
  });
  const favoriteMutation = trpc.arquivos.toggleFavorite.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.arquivos.list.invalidate(),
        utils.arquivos.favorites.invalidate(),
        utils.arquivos.recent.invalidate(),
        utils.arquivos.search.invalidate(),
      ]);
    },
  });
  const ticketMutation = trpc.arquivos.issueTicket.useMutation();
  const reindexMutation = trpc.arquivos.reindex.useMutation({
    onSuccess: async (data) => {
      setFeedback(`Índice atualizado: ${data.files} arquivos e ${data.folders} pastas.`);
      await Promise.all([utils.arquivos.summary.invalidate(), utils.arquivos.list.invalidate()]);
    },
  });
  const createFolderMutation = trpc.arquivos.createFolder.useMutation();

  const rows = (deferredSearch.length >= 2 ? searchQuery.data ?? [] : list.data ?? []) as Item[];
  const isGridView = viewMode !== "list";
  const isCompactView = viewMode === "compact";

  const breadcrumbs = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    return [
      { label: "LICITACAO.1", path: "" },
      ...parts.map((label, index) => ({ label, path: parts.slice(0, index + 1).join("/") })),
    ];
  }, [path]);

  function openFolder(nextPath: string) {
    setSearch("");
    setBrowserPath(nextPath);
    setPath(nextPath);
  }

  async function handleUpload(file: File) {
    if (uploading) return;

    setUploading(true);
    setFeedback(null);
    try {
      const result = await uploadArquivo({ path, arquivo: file });
      setFeedback(`Arquivo enviado: ${result.name}`);
      await Promise.all([
        utils.arquivos.list.invalidate(),
        utils.arquivos.search.invalidate(),
        utils.arquivos.summary.invalidate(),
      ]);
    } catch (error: any) {
      setFeedback(error?.message ?? "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  function openNewFolderDialog() {
    setNewFolderName("");
    setNewFolderError(null);
    setNewFolderOpen(true);
  }

  function closeNewFolderDialog() {
    if (!createFolderMutation.isPending) setNewFolderOpen(false);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) {
      setNewFolderError("Informe o nome da pasta.");
      return;
    }

    setNewFolderError(null);
    try {
      const result = await createFolderMutation.mutateAsync({ path, name });
      setNewFolderOpen(false);
      setNewFolderName("");
      setFeedback(`Pasta criada: ${result.name}`);
      await Promise.all([
        utils.arquivos.list.invalidate(),
        utils.arquivos.search.invalidate(),
        utils.arquivos.summary.invalidate(),
      ]);
    } catch (error: any) {
      setNewFolderError(error?.message ?? "Não foi possível criar a pasta.");
    }
  }

  async function openPreview(item: Item) {
    if (previewLoading) return;

    setPreviewLoading({ name: item.name, path: item.relativePath });
    try {
      const ticket = await ticketMutation.mutateAsync({ path: item.relativePath, mode: "preview" });
      setPreview({ name: item.name, url: ticket.url });
    } catch (error: any) {
      setFeedback(error?.message ?? "Não foi possível gerar o preview.");
    } finally {
      setPreviewLoading(null);
    }
  }

  async function download(item: Item) {
    try {
      const ticket = await ticketMutation.mutateAsync({ path: item.relativePath, mode: "download" });
      const anchor = document.createElement("a");
      anchor.href = ticket.url;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error: any) {
      setFeedback(error?.message ?? "Não foi possível iniciar o download.");
    }
  }

  function activateItem(item: Item) {
    if (item.kind === "folder") {
      openFolder(item.relativePath);
      return;
    }
    if (item.previewable) {
      void openPreview(item);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[30px] border border-[var(--border-soft-contrast)] bg-[var(--surface-hero)] px-5 py-6 text-white shadow-[var(--shadow-floating)] md:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-100/75">
              <FolderArchive className="h-4 w-4" />
              SIREL Arquivos
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] md:text-3xl">Acervo de Licitações</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
              Consulta remota, visualização e download auditado dos documentos da rede.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Arquivos", summary.data?.files ?? 0],
              ["Pastas", summary.data?.folders ?? 0],
              ["Acervo", formatBytes(summary.data?.bytes ?? 0)],
              ["Índice", summary.data?.lastIndexedAt ? "Atualizado" : "Pendente"],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-[20px] border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100/70">{label}</div>
                <div className="mt-1 text-sm font-black">{String(value)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionCard
        title="Localizar documentos"
        description="Pesquise pelo nome do arquivo, número do processo, pregão ou qualquer trecho do caminho."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-1" aria-label="Modo de exibição">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                title="Exibição em lista"
                aria-label="Exibição em lista"
                aria-pressed={viewMode === "list"}
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                title="Exibição em grade"
                aria-label="Exibição em grade"
                aria-pressed={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "compact" ? "secondary" : "ghost"}
                size="icon"
                title="Exibição em grade compacta"
                aria-label="Exibição em grade compacta"
                aria-pressed={viewMode === "compact"}
                onClick={() => setViewMode("compact")}
              >
                <Rows3 className="h-4 w-4" />
              </Button>
            </div>
            {summary.data?.canCreateFolder ? (
              <Button variant="outline" size="sm" onClick={openNewFolderDialog}>
                <FolderPlus className="h-4 w-4" />
                Nova pasta
              </Button>
            ) : null}
            {summary.data?.canUpload ? (
              <Button
                variant="outline"
                size="sm"
                loading={uploading}
                onClick={() => uploadInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {uploading ? "Enviando..." : "Enviar arquivo"}
              </Button>
            ) : null}
            {summary.data?.canAudit ? (
              <Button variant="outline" size="sm" onClick={() => (window.location.href = "/arquivos/auditoria")}>
                <ShieldCheck className="h-4 w-4" />
                Auditoria
              </Button>
            ) : null}
            {summary.data?.canReindex ? (
              <Button
                variant="outline"
                size="sm"
                disabled={reindexMutation.isPending}
                onClick={() => reindexMutation.mutate()}
              >
                <RefreshCcw className={["h-4 w-4", reindexMutation.isPending ? "animate-spin" : ""].join(" ")} />
                Reindexar
              </Button>
            ) : null}
          </div>
        }
      >
        <input
          ref={uploadInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-11"
            placeholder="Ex.: PE-059-2026, recurso, edital, PAPI..."
          />
        </div>
      </SectionCard>

      {!path && deferredSearch.length < 2 ? (
        <SectionCard
          title="Acesso rápido"
          description="Favoritos e documentos consultados recentemente nesta conta."
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
              <div className="mb-2 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                <Star className="h-4 w-4" />
                Favoritos
              </div>
              {favoritesQuery.isLoading ? (
                <div className="grid gap-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 rounded-[18px]" />
                  ))}
                </div>
              ) : favoritesQuery.data?.length ? (
                <div className="grid gap-1.5">
                  {(favoritesQuery.data as Item[]).slice(0, 5).map((item) => {
                    const Icon = iconFor(item);
                    return (
                      <button
                        key={item.relativePath}
                        type="button"
                        onClick={() => activateItem(item)}
                        className="flex min-w-0 items-center gap-3 rounded-[18px] border border-transparent bg-[var(--surface-card)] px-3 py-2.5 text-left transition hover:border-[var(--border-strong)]"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-[var(--accent-color)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{item.name}</span>
                          <span className="block truncate text-xs text-[var(--text-muted)]">{item.parentPath || "Raiz do acervo"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-[18px] bg-[var(--surface-card)] px-3 py-4 text-sm text-[var(--text-secondary)]">
                  Favorite arquivos ou pastas para mantê-los aqui.
                </p>
              )}
            </div>

            <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
              <div className="mb-2 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                <Clock3 className="h-4 w-4" />
                Recentes
              </div>
              {recentQuery.isLoading ? (
                <div className="grid gap-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 rounded-[18px]" />
                  ))}
                </div>
              ) : recentQuery.data?.length ? (
                <div className="grid gap-1.5">
                  {(recentQuery.data as Item[]).slice(0, 5).map((item) => {
                    const Icon = iconFor(item);
                    return (
                      <button
                        key={item.relativePath}
                        type="button"
                        onClick={() => activateItem(item)}
                        className="flex min-w-0 items-center gap-3 rounded-[18px] border border-transparent bg-[var(--surface-card)] px-3 py-2.5 text-left transition hover:border-[var(--border-strong)]"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-[var(--accent-color)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{item.name}</span>
                          <span className="block truncate text-xs text-[var(--text-muted)]">{item.parentPath || item.relativePath}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-[18px] bg-[var(--surface-card)] px-3 py-4 text-sm text-[var(--text-secondary)]">
                  Os documentos visualizados ou baixados aparecerão aqui.
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      ) : null}

      {feedback ? (
        <Alert>
          <div className="flex items-center justify-between gap-3">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)}><X className="h-4 w-4" /></button>
          </div>
        </Alert>
      ) : null}

      {deferredSearch.length < 2 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3">
          {breadcrumbs.map((item, index) => (
            <div key={item.path || "__root"} className="flex items-center gap-1.5">
              {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" /> : null}
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--accent-color)]"
                onClick={() => openFolder(item.path)}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {(list.isLoading || searchQuery.isLoading) ? (
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-[24px]" />)}
        </div>
      ) : (list.error || searchQuery.error) ? (
        <Alert variant="error">Não foi possível carregar os arquivos. Verifique a pasta configurada e o índice.</Alert>
      ) : rows.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-soft)] px-6 py-12 text-center">
          <Folder className="mx-auto h-9 w-9 text-[var(--text-muted)]" />
          <p className="mt-3 font-semibold text-[var(--text-primary)]">Nenhum item encontrado.</p>
        </div>
      ) : (
        <div className={isGridView ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-2"}>
          {rows.map((item) => {
            const Icon = iconFor(item);
            return (
              <article
                key={item.relativePath}
                className={isGridView
                  ? isCompactView
                    ? "group flex min-h-[108px] flex-col rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-3 transition hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-soft)]"
                    : "group flex min-h-[154px] flex-col rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4 transition hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-soft)]"
                  : "group grid gap-3 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4 transition hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-soft)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"}
              >
                <button
                  type="button"
                  onClick={() => activateItem(item)}
                  className={isGridView ? "flex min-w-0 flex-1 items-start gap-3 text-left" : "flex min-w-0 items-center gap-3 text-left"}
                >
                  <div className={isGridView
                    ? isCompactView
                      ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--surface-highlight)] text-[var(--accent-color)]"
                      : "inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[var(--surface-highlight)] text-[var(--accent-color)]"
                    : "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-[var(--surface-highlight)] text-[var(--accent-color)]"}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className={isGridView ? "break-words font-semibold text-[var(--text-primary)]" : "truncate font-semibold text-[var(--text-primary)]"}>{item.name}</div>
                    <div className={isCompactView ? "mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)]" : "mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]"}>
                      {deferredSearch ? <span className="max-w-[70vw] truncate">{item.parentPath || item.relativePath}</span> : null}
                      {item.kind !== "folder" ? <span>{formatBytes(item.size)}</span> : <span>Pasta</span>}
                      {item.modifiedAt ? <span>{new Date(item.modifiedAt).toLocaleString("pt-BR")}</span> : null}
                    </div>
                  </div>
                </button>

                <div className={isGridView ? (isCompactView ? "mt-2 flex flex-wrap items-center justify-start gap-1.5" : "mt-4 flex flex-wrap items-center justify-start gap-2") : "flex items-center justify-end gap-2"}>
                  <button
                    type="button"
                    title={item.favorite ? "Remover dos favoritos" : "Favoritar"}
                    aria-label={item.favorite ? `Remover ${item.name} dos favoritos` : `Adicionar ${item.name} aos favoritos`}
                    className={isCompactView
                      ? "inline-flex !h-8 !w-8 items-center justify-center !rounded-[12px] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-amber-500"
                      : "inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-amber-500"}
                    onClick={() => favoriteMutation.mutate({ path: item.relativePath })}
                  >
                    <Star className={["h-4 w-4", item.favorite ? "fill-current text-amber-500" : ""].join(" ")} />
                  </button>

                  {item.previewable && item.kind !== "folder" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className={isCompactView ? "!h-8 !rounded-xl !px-2 !text-[11px]" : undefined}
                      loading={previewLoading?.path === item.relativePath}
                      disabled={Boolean(previewLoading)}
                      onClick={() => void openPreview(item)}
                    >
                      {previewLoading?.path === item.relativePath
                        ? "Preparando..."
                        : "Visualizar"}
                    </Button>
                  ) : null}

                  {item.downloadable && item.kind !== "folder" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className={isCompactView ? "!h-8 !rounded-xl !px-2 !text-[11px]" : undefined}
                      onClick={() => download(item)}
                    >
                      <Download className="h-4 w-4" />
                      Baixar
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {previewLoading ? (
        <div
          className="fixed inset-0 z-[350] flex items-center justify-center bg-[var(--surface-overlay)]/90 p-4 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="w-full max-w-md rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-6 py-8 text-center shadow-[var(--shadow-floating)]">
            <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-[var(--accent-color)]" />
            <p className="mt-4 text-lg font-bold text-[var(--text-primary)]">
              Preparando visualização
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-[var(--text-secondary)]">
              {previewLoading.name}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              O documento está sendo convertido para um formato de leitura.
              Aguarde um instante.
            </p>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-[300] flex flex-col bg-[var(--surface-overlay)] p-2 md:p-4">
          <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-floating)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text-primary)]">{preview.name}</p>
                <p className="text-xs text-[var(--text-muted)]">Visualização protegida • acesso auditado</p>
              </div>
              <Button variant="outline" size="icon" onClick={() => setPreview(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <iframe
              src={preview.url}
              title={`Visualização de ${preview.name}`}
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        </div>
      ) : null}

      <Modal
        open={newFolderOpen}
        title="Criar nova pasta"
        description="Organize o acervo criando uma pasta dentro do local atualmente aberto."
        onClose={closeNewFolderDialog}
        size="md"
        actions={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeNewFolderDialog} disabled={createFolderMutation.isPending}>
              Cancelar
            </Button>
            <Button loading={createFolderMutation.isPending} onClick={() => void handleCreateFolder()}>
              <FolderPlus className="h-4 w-4" />
              Criar pasta
            </Button>
          </div>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreateFolder();
          }}
        >
          <label className="block text-sm font-semibold text-[var(--text-primary)]" htmlFor="nova-pasta-nome">
            Nome da pasta
          </label>
          <Input
            id="nova-pasta-nome"
            value={newFolderName}
            onChange={(event) => {
              setNewFolderName(event.target.value);
              setNewFolderError(null);
            }}
            placeholder="Ex.: Documentos complementares"
            maxLength={180}
            autoFocus
            disabled={createFolderMutation.isPending}
          />
          <p className="text-xs leading-5 text-[var(--text-muted)]">
            Local de criação: <span className="font-semibold text-[var(--text-secondary)]">{path || "Raiz do acervo"}</span>
          </p>
          {newFolderError ? <Alert variant="error">{newFolderError}</Alert> : null}
        </form>
      </Modal>
    </div>
  );
}
