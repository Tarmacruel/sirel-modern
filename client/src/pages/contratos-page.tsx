import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ExternalLink, FileText, Search } from "lucide-react";

import { PageIntro } from "@/components/shared/page-intro";
import { ProcessMacroPanel } from "@/components/shared/process-macro-panel";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs } from "@/components/ui/tabs";
import { formatCurrencyBRL, formatShortDateBR } from "@/lib/formatters";
import { deriveMacroPhaseStatuses } from "@/lib/process-macro-flow";
import { cleanDisplayText } from "@/lib/text";
import { trpc } from "@/lib/trpc";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function formatMoney(value: string | null) {
  if (!value) return "-";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatCurrencyBRL(parsed) : "-";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function ContratosPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState<
    "" | "ATIVO" | "ENCERRADO" | "SUSPENSO" | "RESCINDIDO"
  >("");
  const [search, setSearch] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(
    null,
  );
  const deferredSearch = useDeferredValue(search.trim());
  const filters = useMemo(
    () => ({
      page,
      pageSize,
      status: status || undefined,
      search: deferredSearch || undefined,
    }),
    [deferredSearch, page, pageSize, status],
  );

  const summaryQuery = trpc.contratos.summary.useQuery(undefined, {
    retry: false,
  });
  const listQuery = trpc.contratos.list.useQuery(filters, {
    retry: false,
    placeholderData: (previous) => previous,
  });
  const contratoRows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const processosContratosQuery = trpc.processos.list.useQuery(
    { page: 1, pageSize: 24, moduloAtual: "CONTRATOS", ativo: true },
    { retry: false, placeholderData: (previous) => previous },
  );
  const processoRows = processosContratosQuery.data?.items ?? [];

  useEffect(() => {
    if (!processoRows.length) {
      setSelectedProcessId(null);
      return;
    }
    if (
      !selectedProcessId ||
      !processoRows.some((item) => item.id === selectedProcessId)
    ) {
      setSelectedProcessId(processoRows[0].id);
    }
  }, [processoRows, selectedProcessId]);

  const selectedProcess =
    processoRows.find((item) => item.id === selectedProcessId) ?? null;
  const overviewQuery = trpc.processos.overview.useQuery(
    { processoId: selectedProcessId ?? 0 },
    { enabled: Boolean(selectedProcessId), retry: false },
  );

  const processSummary =
    selectedProcess && overviewQuery.data
      ? [
          {
            label: "Contratos ativos",
            value: String(overviewQuery.data.gerencial.contratosAtivos),
          },
          {
            label: "Contratos totais",
            value: String(overviewQuery.data.gerencial.contratos),
          },
          {
            label: "Documentos",
            value: String(overviewQuery.data.gerencial.documentos),
          },
          {
            label: "Valor estimado",
            value: overviewQuery.data.processo.valorEstimado
              ? formatCurrencyBRL(overviewQuery.data.processo.valorEstimado)
              : "Nao informado",
            tone: "accent" as const,
          },
        ]
      : [];

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Ciclo principal"
        title="Contratos com leitura macro e acesso direto aos vinculos."
        description="A entrada do modulo concentra contratos vigentes, processos em formalizacao e atalhos para processo, fornecedor e base externa sem quebrar a navegacao."
        dataTourId="contratos-intro"
        meta={[
          { label: "Total", value: String(summaryQuery.data?.total ?? 0) },
          { label: "Ativos", value: String(summaryQuery.data?.ativos ?? 0) },
          { label: "Expirando em 30 dias", value: String(summaryQuery.data?.expirandoEm30Dias ?? 0) },
        ]}
        aside={
          <div className="rounded-[24px] border border-white/12 bg-white/[0.08] p-4 text-white backdrop-blur-sm xl:max-w-[340px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-100/70">Foco operacional</p>
            <p className="mt-3 text-sm leading-7 text-slate-200">
              Combine a visao macro do processo com a lista contratual para agir rapido em vigencia, fornecedor e origem do ajuste.
            </p>
          </div>
        }
      />

      {selectedProcess ? (
        <ProcessMacroPanel
          moduleLabel="Contratos"
          title={`Formalizacao contratual do processo ${selectedProcess.numeroSirel}`}
          processNumber={selectedProcess.numeroSirel}
          modalidade={overviewQuery.data?.processo.modalidade?.nome ?? null}
          secretaria={cleanDisplayText(selectedProcess.secretaria)}
          etapaAtual={cleanDisplayText(selectedProcess.etapaAtual)}
          objeto={cleanDisplayText(
            overviewQuery.data?.processo.objeto ?? selectedProcess.objeto,
          )}
          foraDoFluxo={overviewQuery.data?.processo.foraDoFluxo ?? false}
          phaseStatuses={deriveMacroPhaseStatuses(
            overviewQuery.data?.workflow?.moduloAtual ?? "CONTRATOS",
          )}
          summary={processSummary}
          actions={
            <div className="flex flex-wrap gap-2">
              <Link href={`/processos/${selectedProcess.id}`}>
                <Button variant="outline" size="sm">
                  Painel do processo
                </Button>
              </Link>
              <Link href={`/dossie/${selectedProcess.id}`}>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<FileText className="h-4 w-4" />}
                >
                  Abrir dossiê
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText className="h-4 w-4" />}
                disabled
              >
                Ultima macrofase
              </Button>
            </div>
          }
        />
      ) : null}

      <SectionCard
        title="Contratos"
        description="Base de contratos da SIREL com visao macro do processo, filtros, resumo e paginacao para crescimento real da operacao."
      >
        <div data-tour-id="contratos-list">
          <Tabs
            items={[
            {
              value: "visao-geral",
              label: "Visao geral",
              content: (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    {[
                      { label: "Total", value: summaryQuery.data?.total },
                      {
                        label: "Importados do PNCP",
                        value: summaryQuery.data?.totalPncp,
                      },
                      { label: "Ativos", value: summaryQuery.data?.ativos },
                      {
                        label: "Expirando em 30 dias",
                        value: summaryQuery.data?.expirandoEm30Dias,
                      },
                    ].map((item) => (
                      <article
                        key={item.label}
                        className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4"
                      >
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          {item.label}
                        </p>
                        {summaryQuery.isLoading ? (
                          <Skeleton className="mt-3 h-10 w-20" />
                        ) : (
                          <p className="mt-3 text-3xl font-black text-[var(--text-primary)]">
                            {item.value ?? 0}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>

                  <div className="overflow-x-auto rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                    <Table className="min-w-[760px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>
                            Processo em Contratos
                          </TableHeaderCell>
                          <TableHeaderCell>Secretaria</TableHeaderCell>
                          <TableHeaderCell>Etapa atual</TableHeaderCell>
                          <TableHeaderCell>Documentos</TableHeaderCell>
                          <TableHeaderCell>Atualizado em</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {processosContratosQuery.isLoading
                          ? Array.from({ length: 4 }).map((_, index) => (
                              <TableRow key={index}>
                                <TableCell colSpan={5}>
                                  <Skeleton className="h-12 w-full" />
                                </TableCell>
                              </TableRow>
                            ))
                          : processoRows.map((row) => (
                              <TableRow
                                key={row.id}
                                className={[
                                  "cursor-pointer transition hover:bg-[var(--surface-soft)]",
                                  row.id === selectedProcessId
                                    ? "bg-[var(--surface-highlight)]"
                                    : "",
                                ].join(" ")}
                                onClick={() => setSelectedProcessId(row.id)}
                              >
                                <TableCell>
                                  <div className="font-bold text-[var(--text-primary)]">
                                    {row.numeroSirel}
                                  </div>
                                  <div className="text-xs text-[var(--text-muted)]">
                                    {cleanDisplayText(
                                      row.modalidade ??
                                        "Modalidade em definicao",
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {cleanDisplayText(row.secretaria)}
                                </TableCell>
                                <TableCell>
                                  {cleanDisplayText(
                                    row.etapaAtual ?? "Formalizacao contratual",
                                  )}
                                </TableCell>
                                <TableCell>{row.documentos}</TableCell>
                                <TableCell>
                                  {formatShortDateBR(
                                    row.workflowAtualizadoEm ?? row.criadoEm,
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                        {!processosContratosQuery.isLoading &&
                        !processoRows.length ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-center text-[var(--text-muted)]"
                            >
                              Nenhum processo esta estacionado em Contratos
                              neste momento.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>

                  {summaryQuery.error ? (
                    <Alert variant="error">
                      Falha ao consultar o resumo de contratos.
                    </Alert>
                  ) : null}
                </div>
              ),
            },
            {
              value: "registros",
              label: "Registros",
              content: (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative max-w-md flex-1 min-w-[240px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar por contrato, processo, fornecedor ou objeto"
                        className="pl-9"
                      />
                    </div>
                    <Select
                      value={status}
                      onChange={(event) =>
                        setStatus(event.target.value as typeof status)
                      }
                      className="max-w-[180px]"
                    >
                      <option value="">Todos os status</option>
                      {["ATIVO", "ENCERRADO", "SUSPENSO", "RESCINDIDO"].map(
                        (option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ),
                      )}
                    </Select>
                    <Select
                      value={String(pageSize)}
                      onChange={(event) =>
                        setPageSize(Number(event.target.value))
                      }
                      className="max-w-[140px]"
                    >
                      {[10, 20, 50].map((option) => (
                        <option key={option} value={option}>
                          {option} por pagina
                        </option>
                      ))}
                    </Select>
                  </div>

                  {listQuery.error ? (
                    <Alert variant="error">
                      Falha ao carregar os contratos da base.
                    </Alert>
                  ) : null}

                  <div className="overflow-x-auto rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                    <Table className="min-w-[760px]">
                      <TableHead>
                        <tr>
                          <TableHeaderCell>Contrato</TableHeaderCell>
                          <TableHeaderCell>Origem</TableHeaderCell>
                          <TableHeaderCell>Processo</TableHeaderCell>
                          <TableHeaderCell>Fornecedor</TableHeaderCell>
                          <TableHeaderCell>Vigencia final</TableHeaderCell>
                          <TableHeaderCell className="text-right">
                            Valor
                          </TableHeaderCell>
                          <TableHeaderCell>Acesso</TableHeaderCell>
                        </tr>
                      </TableHead>
                      <TableBody>
                        {listQuery.isLoading
                          ? Array.from({ length: 5 }).map((_, index) => (
                              <TableRow key={index}>
                                <TableCell colSpan={7}>
                                  <Skeleton className="h-12 w-full" />
                                </TableCell>
                              </TableRow>
                            ))
                          : contratoRows.map((row) => (
                              <TableRow
                                key={row.id}
                                className="transition hover:bg-[var(--surface-soft)]"
                              >
                                <TableCell>
                                  <div className="font-bold text-[var(--text-primary)]">
                                    {row.numeroContrato}
                                  </div>
                                  <div className="text-xs text-[var(--text-muted)]">
                                    {row.status}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={[
                                      "inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]",
                                      row.origem === "PNCP"
                                        ? "bg-[var(--color-primary-50)] text-[var(--color-primary-700)]"
                                        : "bg-[var(--surface-soft)] text-[var(--text-secondary)]",
                                    ].join(" ")}
                                  >
                                    {row.origem}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {row.processoId ? (
                                    <Link
                                      href={`/dossie/${row.processoId}`}
                                      className="font-semibold text-[var(--accent-color)]"
                                    >
                                      {row.processoNumeroSirel}
                                    </Link>
                                  ) : (
                                    row.processoNumeroSirel
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="max-w-[280px] truncate">
                                    {row.fornecedorId ? (
                                      <Link
                                        href={`/dossie/fornecedor/${row.fornecedorId}`}
                                        className="font-semibold text-[var(--accent-color)]"
                                      >
                                        {row.fornecedor}
                                      </Link>
                                    ) : (
                                      row.fornecedor
                                    )}
                                  </div>
                                  <div className="text-xs text-[var(--text-muted)]">
                                    {row.objeto}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {formatDate(row.dataVigenciaFim)}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-[var(--text-primary)]">
                                  {formatMoney(row.valorContrato)}
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-2">
                                    {row.processoId ? (
                                      <Link href={`/dossie/${row.processoId}`}>
                                        <Button variant="outline" size="sm">
                                          Dossiê processo
                                        </Button>
                                      </Link>
                                    ) : null}
                                    {row.fornecedorId ? (
                                      <Link href={`/dossie/fornecedor/${row.fornecedorId}`}>
                                        <Button variant="outline" size="sm">
                                          Dossiê fornecedor
                                        </Button>
                                      </Link>
                                    ) : null}
                                    {row.pncpUrl ? (
                                      <a
                                        href={row.pncpUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          icon={<ExternalLink className="h-4 w-4" />}
                                        >
                                          PNCP
                                        </Button>
                                      </a>
                                    ) : null}
                                    {row.documentoUrl ? (
                                      <a
                                        href={row.documentoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <Button variant="ghost" size="sm">
                                          Documento
                                        </Button>
                                      </a>
                                    ) : row.pncpApiUrl ? (
                                      <a
                                        href={row.pncpApiUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <Button variant="ghost" size="sm">
                                          API
                                        </Button>
                                      </a>
                                    ) : (
                                      <span className="text-xs text-[var(--text-muted)]">
                                        {row.origem === "PNCP"
                                          ? "Sem documento direto"
                                          : "-"}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                        {!listQuery.isLoading && !contratoRows.length ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center text-[var(--text-muted)]"
                            >
                              Nenhum contrato encontrado.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-[var(--text-secondary)]">
                      Exibindo{" "}
                      <span className="font-bold text-[var(--text-primary)]">
                        {contratoRows.length}
                      </span>{" "}
                      de{" "}
                      <span className="font-bold text-[var(--text-primary)]">
                        {total}
                      </span>{" "}
                      contratos.
                    </p>
                    <Pagination
                      page={page}
                      totalPages={totalPages}
                      onPageChange={setPage}
                    />
                  </div>
                </div>
              ),
            },
            ]}
          />
        </div>
      </SectionCard>
    </div>
  );
}
