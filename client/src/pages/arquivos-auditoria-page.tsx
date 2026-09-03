import { ArrowLeft, Search, ShieldCheck, X } from "lucide-react";
import { useDeferredValue, useRef, useState } from "react";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";

export function ArquivosAuditoriaPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const query = trpc.arquivos.audit.useQuery(
    {
      page,
      pageSize: 25,
      action: action || undefined,
      search: deferredSearch || undefined,
    },
    { retry: false },
  );

  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 25));

  return (
    <div className="space-y-5">
      <SectionCard
        title="Auditoria — SIREL Arquivos"
        description="Visualizações, downloads, uploads, criação e exclusão de pastas/documentos, pesquisas, favoritos e reindexações."
        action={
          <Button variant="outline" size="sm" onClick={() => (window.location.href = "/arquivos")}>
            <ArrowLeft className="h-4 w-4" />
            Voltar aos arquivos
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              className="pl-11 pr-11"
              placeholder="Usuário, arquivo, pasta ou detalhe..."
            />
            {search ? (
              <button
                type="button"
                aria-label="Limpar pesquisa"
                title="Limpar pesquisa"
                className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setPage(1);
                  setSearch("");
                  searchInputRef.current?.focus();
                }}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Select value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }}>
            <option value="">Todas as ações</option>
            {["LIST","SEARCH","VIEW","DOWNLOAD","UPLOAD","CREATE_FOLDER","DELETE","FAVORITE","UNFAVORITE","DENIED","REINDEX"].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </Select>
        </div>
      </SectionCard>

      {query.error ? <Alert variant="error">Você não tem acesso à auditoria ou ocorreu falha ao consultar os logs.</Alert> : null}

      <div className="overflow-auto rounded-[26px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Data</TableHeaderCell>
              <TableHeaderCell>Usuário</TableHeaderCell>
              <TableHeaderCell>Ação</TableHeaderCell>
              <TableHeaderCell>Arquivo / caminho</TableHeaderCell>
              <TableHeaderCell>IP</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {query.isLoading ? Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
            )) : (query.data?.items ?? []).map((item: any) => (
              <TableRow key={item.id}>
                <TableCell>{new Date(item.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell>
                  <div className="font-semibold text-[var(--text-primary)]">{item.user_name ?? item.username ?? "Sistema"}</div>
                  <div className="text-xs text-[var(--text-muted)]">{item.username ?? ""}</div>
                </TableCell>
                <TableCell><span className="inline-flex rounded-full bg-[var(--surface-highlight)] px-2.5 py-1 text-xs font-bold text-[var(--accent-color)]">{item.action}</span></TableCell>
                <TableCell className="max-w-[520px]">
                  <div className="truncate text-sm text-[var(--text-primary)]">{item.file_name ?? "-"}</div>
                  <div className="truncate text-xs text-[var(--text-muted)]">{item.relative_path ?? item.detail ?? "-"}</div>
                </TableCell>
                <TableCell>{item.ip_address ?? "-"}</TableCell>
                <TableCell>{item.success ? "OK" : "Falha"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-muted)]">Página {page} de {pages} • {query.data?.total ?? 0} eventos</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      </div>

      <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-xs text-[var(--text-secondary)]">
        <ShieldCheck className="mr-2 inline h-4 w-4" />
        A trilha deste módulo é independente da auditoria transacional do SIREL e registra navegação, leitura, download, exclusão e alterações no acervo.
      </div>
    </div>
  );
}
