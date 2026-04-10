import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Boxes, Download, ExternalLink, Printer, Search } from "lucide-react";
import { Link } from "wouter";

import type { DossieFilterOption } from "@sirel/shared/schemas/dossie";
import { SimpleBarChart } from "@/components/dashboard/simple-bar-chart";
import { SimpleDonutChart } from "@/components/dashboard/simple-donut-chart";
import { SimpleMultiLineChart } from "@/components/dashboard/simple-multi-line-chart";
import { SimpleScatterChart } from "@/components/dashboard/simple-scatter-chart";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, type TabItem } from "@/components/ui/tabs";
import {
  formatCnpjBR,
  formatCurrencyBRL,
  formatNumberBR,
  formatShortDateBR,
  formatShortDateTimeBR,
} from "@/lib/formatters";
import {
  exportDossieItemToPdf,
  exportDossieItemToXlsx,
  printDossieItem,
} from "@/lib/export-dossie-entidades";
import { trpc } from "@/lib/trpc";

type ItemFilterState = {
  periodoInicio: string;
  periodoFim: string;
  modalidadeId: string;
  secretariaId: string;
  status: string;
  processoId: string;
  contratoId: string;
  fornecedorId: string;
};

function readStateFromUrl(itemId?: number) {
  const params = new URLSearchParams(window.location.search);
  return {
    selectedItemId:
      itemId ?? (params.get("itemId") ? Number(params.get("itemId")) : null),
    filters: {
      periodoInicio: params.get("periodoInicio") ?? "",
      periodoFim: params.get("periodoFim") ?? "",
      modalidadeId: params.get("modalidadeId") ?? "",
      secretariaId: params.get("secretariaId") ?? "",
      status: params.get("status") ?? "",
      processoId: params.get("processoId") ?? "",
      contratoId: params.get("contratoId") ?? "",
      fornecedorId: params.get("fornecedorId") ?? "",
    } satisfies ItemFilterState,
  };
}

function syncUrl(selectedItemId: number | null, filters: ItemFilterState) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const path = selectedItemId ? `/dossie/item/${selectedItemId}` : "/dossie/item";
  const query = params.toString();
  window.history.replaceState({}, "", query ? `${path}?${query}` : path);
}

function buildDetailInput(selectedItemId: number, filters: ItemFilterState) {
  return {
    itemId: selectedItemId,
    filters: {
      periodoInicio: filters.periodoInicio || undefined,
      periodoFim: filters.periodoFim || undefined,
      modalidadeId: filters.modalidadeId ? Number(filters.modalidadeId) : undefined,
      secretariaId: filters.secretariaId ? Number(filters.secretariaId) : undefined,
      status: filters.status || undefined,
      processoId: filters.processoId ? Number(filters.processoId) : undefined,
      contratoId: filters.contratoId ? Number(filters.contratoId) : undefined,
      fornecedorId: filters.fornecedorId ? Number(filters.fornecedorId) : undefined,
    },
  };
}

function renderFilterOptions(options: DossieFilterOption[], emptyLabel = "Todos") {
  return (
    <>
      <option value="">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">{value}</p>
    </article>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

export function DossieItemPage({ itemId }: { itemId?: number } = {}) {
  const initialState = useMemo(() => readStateFromUrl(itemId), [itemId]);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState<null | "pdf" | "xlsx" | "print">(
    null,
  );
  const [selectedItemId, setSelectedItemId] = useState<number | null>(
    initialState.selectedItemId,
  );
  const [filters, setFilters] = useState<ItemFilterState>(initialState.filters);
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    const next = readStateFromUrl(itemId);
    setSelectedItemId(next.selectedItemId);
    setFilters(next.filters);
  }, [itemId]);

  useEffect(() => {
    syncUrl(selectedItemId, filters);
  }, [selectedItemId, filters]);

  const optionsQuery = trpc.dossie.itemOptions.useQuery(
    { search: deferredSearch || undefined, limit: 60 },
    { retry: false, placeholderData: (previous) => previous },
  );

  const detailQuery = trpc.dossie.itemDetail.useQuery(
    selectedItemId ? buildDetailInput(selectedItemId, filters) : (undefined as never),
    { enabled: Boolean(selectedItemId), retry: false },
  );

  const detail = detailQuery.data;
  const selectedOption = useMemo(
    () => optionsQuery.data?.find((row) => row.id === selectedItemId) ?? null,
    [optionsQuery.data, selectedItemId],
  );

  function handlePrint() {
    if (!detail) return;
    setExporting("print");
    try {
      printDossieItem(detail);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPdf() {
    if (!detail) return;
    setExporting("pdf");
    try {
      await exportDossieItemToPdf(detail);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportXlsx() {
    if (!detail) return;
    setExporting("xlsx");
    try {
      await exportDossieItemToXlsx(detail);
    } finally {
      setExporting(null);
    }
  }

  const tabs: TabItem[] = detail
    ? [
        {
          value: "visao-geral",
          label: "Visão Geral",
          content: (
            <div className="space-y-6">
              <div className="grid gap-3 md:grid-cols-3">
                <MetaCard label="Código interno" value={detail.identificacao.codigoInterno} />
                <MetaCard label="Status" value={detail.identificacao.status} />
                <MetaCard label="Unidade" value={detail.identificacao.unidadeMedida} />
                <MetaCard label="Criado em" value={formatShortDateTimeBR(detail.identificacao.criadoEm)} />
                <MetaCard label="Atualizado em" value={formatShortDateTimeBR(detail.identificacao.atualizadoEm)} />
                <MetaCard label="Aliases" value={detail.identificacao.aliases.length ? detail.identificacao.aliases.join(" • ") : "Sem aliases"} />
              </div>
              <SectionCard title="Descrição consolidada" description="Descrição técnica e variações conhecidas do item.">
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  {detail.identificacao.descricaoCompleta ?? detail.identificacao.descricaoResumida}
                </p>
              </SectionCard>
              <div className="grid gap-4 xl:grid-cols-2">
                <SectionCard title="Série histórica de preços" description="Comparativo entre estimado, vencedor e contratado ao longo do tempo.">
                  <SimpleMultiLineChart items={detail.charts.seriePrecos} labels={{ a: "Estimado", b: "Vencedor", c: "Contratado" }} />
                </SectionCard>
                <SectionCard title="Dispersão de preços" description="Leitura visual de variação e outliers.">
                  <SimpleScatterChart items={detail.charts.dispersao} />
                </SectionCard>
              </div>
            </div>
          ),
        },
        {
          value: "processos",
          label: "Processos",
          content: (
            <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
              <Table className="min-w-[1160px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Secretaria</TableHeaderCell>
                    <TableHeaderCell>Modalidade</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Quantidade</TableHeaderCell>
                    <TableHeaderCell>Estimado</TableHeaderCell>
                    <TableHeaderCell>Homologado</TableHeaderCell>
                    <TableHeaderCell>Links</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {detail.processos.map((row) => (
                    <TableRow key={`${row.itemProcessoId}-${row.processoId}`}>
                      <TableCell>
                        <div className="font-semibold text-[var(--text-primary)]">{row.numeroSirel}</div>
                        <div className="text-xs text-[var(--text-muted)]">{row.numeroAdministrativo ?? row.objetoProcesso}</div>
                      </TableCell>
                      <TableCell>{row.secretaria}</TableCell>
                      <TableCell>{row.modalidade ?? "Não informado"}</TableCell>
                      <TableCell>{row.status ?? row.etapaAtual ?? "Em análise"}</TableCell>
                      <TableCell>{formatNumberBR(row.quantidadePrevista, 3)} {row.unidade}</TableCell>
                      <TableCell>{formatCurrencyBRL(row.valorEstimado)}</TableCell>
                      <TableCell>{formatCurrencyBRL(row.valorHomologado)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/processos/${row.processoId}`} className="text-sm font-semibold text-[var(--accent-color)]">Processo</Link>
                          <Link href={`/dossie/${row.processoId}`} className="text-sm font-semibold text-[var(--accent-color)]">Dossiê</Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ),
        },
        {
          value: "licitacoes",
          label: "Licitações",
          content: (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <SectionCard title="Distribuição por modalidade" description="Modalidades em que o item mais aparece.">
                  <SimpleDonutChart items={detail.charts.modalidades.map((item) => ({ label: item.label, value: item.valor }))} />
                </SectionCard>
                <SectionCard title="Status das disputas" description="Sucesso e insucesso do item nas licitações.">
                  <SimpleBarChart items={detail.charts.status.map((item) => ({ label: item.label, value: item.valor }))} />
                </SectionCard>
              </div>
              <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                <Table className="min-w-[1220px]">
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Processo</TableHeaderCell>
                      <TableHeaderCell>Lote/Item</TableHeaderCell>
                      <TableHeaderCell>Vencedor</TableHeaderCell>
                      <TableHeaderCell>Estimado</TableHeaderCell>
                      <TableHeaderCell>Melhor oferta</TableHeaderCell>
                      <TableHeaderCell>Vencedor</TableHeaderCell>
                      <TableHeaderCell>Economia</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {detail.licitacoes.map((row) => (
                      <TableRow key={`${row.itemProcessoId}-${row.processoId}`}>
                        <TableCell>
                          <div className="font-semibold text-[var(--text-primary)]">{row.numeroSirel}</div>
                          <div className="text-xs text-[var(--text-muted)]">{row.edital ?? "Sem edital"}</div>
                        </TableCell>
                        <TableCell>{row.loteNumero ? `Lote ${row.loteNumero}` : "Sem lote"} • Item {row.itemNumero}</TableCell>
                        <TableCell>
                          {row.fornecedorVencedorId ? (
                            <Link href={`/dossie/fornecedor/${row.fornecedorVencedorId}`} className="font-semibold text-[var(--accent-color)]">
                              {row.fornecedorVencedor ?? "Fornecedor"}
                            </Link>
                          ) : (
                            row.fornecedorVencedor ?? "Sem vencedor"
                          )}
                        </TableCell>
                        <TableCell>{formatCurrencyBRL(row.valorEstimadoUnitario)}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.melhorValorOfertado)}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.valorVencedor)}</TableCell>
                        <TableCell>
                          <div>{formatCurrencyBRL(row.economiaAbsoluta)}</div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {row.economiaPercentual === null ? "–" : `${formatNumberBR(row.economiaPercentual, 2)}%`}
                          </div>
                        </TableCell>
                        <TableCell>{row.statusItem}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ),
        },
        {
          value: "contratos",
          label: "Contratos",
          content: (
            <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
              <Table className="min-w-[1100px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Contrato</TableHeaderCell>
                    <TableHeaderCell>Fornecedor</TableHeaderCell>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Quantidade</TableHeaderCell>
                    <TableHeaderCell>Saldo</TableHeaderCell>
                    <TableHeaderCell>Valor unitário</TableHeaderCell>
                    <TableHeaderCell>Valor total</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {detail.contratos.map((row) => (
                    <TableRow key={row.contratoId}>
                      <TableCell>
                        <div className="font-semibold text-[var(--text-primary)]">{row.numeroContrato}</div>
                        <div className="text-xs text-[var(--text-muted)]">{row.status}</div>
                      </TableCell>
                      <TableCell>
                        {row.fornecedorId ? (
                          <Link href={`/dossie/fornecedor/${row.fornecedorId}`} className="font-semibold text-[var(--accent-color)]">
                            {row.fornecedorNome}
                          </Link>
                        ) : (
                          row.fornecedorNome
                        )}
                      </TableCell>
                      <TableCell>
                        <Link href={`/dossie/${row.processoId}`} className="font-semibold text-[var(--accent-color)]">
                          {row.processoNumeroSirel}
                        </Link>
                      </TableCell>
                      <TableCell>{formatNumberBR(row.quantidadeContratada, 3)}</TableCell>
                      <TableCell>{formatNumberBR(row.saldoRemanescente, 3)}</TableCell>
                      <TableCell>{formatCurrencyBRL(row.valorUnitario)}</TableCell>
                      <TableCell>{formatCurrencyBRL(row.valorTotalItem)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ),
        },
        {
          value: "fornecedores",
          label: "Fornecedores",
          content: (
            <div className="space-y-4">
              <SectionCard title="Comparativo por fornecedor" description="Valor médio ofertado por fornecedor.">
                <SimpleBarChart items={detail.charts.fornecedores.map((item) => ({ label: item.label, value: item.valor }))} />
              </SectionCard>
              <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                <Table className="min-w-[1080px]">
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Fornecedor</TableHeaderCell>
                      <TableHeaderCell>Participações</TableHeaderCell>
                      <TableHeaderCell>Vitórias</TableHeaderCell>
                      <TableHeaderCell>Faixa ofertada</TableHeaderCell>
                      <TableHeaderCell>Média</TableHeaderCell>
                      <TableHeaderCell>Última vitória</TableHeaderCell>
                      <TableHeaderCell>Taxa</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {detail.fornecedores.map((row, index) => (
                      <TableRow key={`${row.fornecedorId ?? row.fornecedorNome}-${index}`}>
                        <TableCell>
                          {row.fornecedorId ? (
                            <Link href={`/dossie/fornecedor/${row.fornecedorId}`} className="font-semibold text-[var(--accent-color)]">
                              {row.fornecedorNome}
                            </Link>
                          ) : (
                            <span className="font-semibold text-[var(--text-primary)]">{row.fornecedorNome}</span>
                          )}
                          <div className="text-xs text-[var(--text-muted)]">{formatCnpjBR(row.documento)}</div>
                        </TableCell>
                        <TableCell>{row.participacoes}</TableCell>
                        <TableCell>{row.vitorias}</TableCell>
                        <TableCell>{`${formatCurrencyBRL(row.menorValorOfertado)} a ${formatCurrencyBRL(row.maiorValorOfertado)}`}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.valorMedioOfertado)}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.ultimoValorVencedor)}</TableCell>
                        <TableCell>{row.taxaVitoria === null ? "–" : `${formatNumberBR(row.taxaVitoria, 2)}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ),
        },
        {
          value: "auditoria",
          label: "Auditoria",
          content: (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <MetaCard label="Última atualização" value={formatShortDateTimeBR(detail.auditoria.ultimaAtualizacaoCadastro)} />
                <MetaCard label="Usuários sensíveis" value={detail.auditoria.usuariosSensiveis.length ? detail.auditoria.usuariosSensiveis.join(" • ") : "Sem registros"} />
                <MetaCard label="Vínculos críticos" value={detail.auditoria.vinculosCriticos.length ? detail.auditoria.vinculosCriticos.join(" • ") : "Nenhum"} />
              </div>
              <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                <Table className="min-w-[980px]">
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Data</TableHeaderCell>
                      <TableHeaderCell>Ação</TableHeaderCell>
                      <TableHeaderCell>Usuário</TableHeaderCell>
                      <TableHeaderCell>Descrição</TableHeaderCell>
                      <TableHeaderCell>Campos</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {detail.auditoria.mudancasRelevantes.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatShortDateTimeBR(row.criadoEm)}</TableCell>
                        <TableCell>{row.acao}</TableCell>
                        <TableCell>{row.usuario ?? "Sistema"}</TableCell>
                        <TableCell>{row.descricao ?? "Sem descrição"}</TableCell>
                        <TableCell>{row.camposAlterados.length ? row.camposAlterados.join(", ") : "Sem campos destacados"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Dossiês", href: "/dossie" },
          { label: "Dossiê do item" },
          ...(selectedOption ? [{ label: selectedOption.label }] : []),
        ]}
      />

      <SectionCard
        title="Dossiê do item"
        description="Visão gerencial, histórica e contratual do item catalogado."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar item por descrição ou unidade"
                className="pl-9"
              />
            </div>
            <Select
              value={selectedItemId ? String(selectedItemId) : ""}
              onChange={(event) =>
                setSelectedItemId(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">Selecione um item</option>
              {optionsQuery.data?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Link href="/itens">
              <Button variant="outline">
                <Boxes className="mr-2 h-4 w-4" />
                Catálogo
              </Button>
            </Link>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Início
            </label>
            <Input
              type="date"
              value={filters.periodoInicio}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, periodoInicio: event.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Fim
            </label>
            <Input
              type="date"
              value={filters.periodoFim}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, periodoFim: event.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Modalidade
            </label>
            <Select
              value={filters.modalidadeId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, modalidadeId: event.target.value }))
              }
            >
              {renderFilterOptions(detail?.filtrosDisponiveis.modalidades ?? [])}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Secretaria
            </label>
            <Select
              value={filters.secretariaId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, secretariaId: event.target.value }))
              }
            >
              {renderFilterOptions(detail?.filtrosDisponiveis.secretarias ?? [])}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Status
            </label>
            <Select
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value }))
              }
            >
              <option value="">Todos</option>
              {detail?.filtrosDisponiveis.status.map((option) => (
                <option key={option.codigo} value={option.codigo}>
                  {option.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Processo
            </label>
            <Select
              value={filters.processoId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, processoId: event.target.value }))
              }
            >
              {renderFilterOptions(detail?.filtrosDisponiveis.processos ?? [])}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Contrato
            </label>
            <Select
              value={filters.contratoId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, contratoId: event.target.value }))
              }
            >
              {renderFilterOptions(detail?.filtrosDisponiveis.contratos ?? [])}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Fornecedor
            </label>
            <Select
              value={filters.fornecedorId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, fornecedorId: event.target.value }))
              }
            >
              {renderFilterOptions(detail?.filtrosDisponiveis.fornecedores ?? [])}
            </Select>
          </div>
        </div>
      </SectionCard>

      {detailQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-[28px]" />
          ))}
        </div>
      ) : null}

      {!selectedItemId ? (
        <Alert title="Selecione um item" variant="info">
          Escolha um item do catálogo para abrir o dossiê analítico.
        </Alert>
      ) : null}

      {detailQuery.error ? (
        <Alert title="Não foi possível carregar o dossiê do item" variant="error">
          {detailQuery.error.message}
        </Alert>
      ) : null}

      {detail ? (
        <>
          <SectionCard
            title={detail.identificacao.descricaoResumida}
            description={selectedOption?.subtitle ?? "Consolidação completa do item no SIREL."}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={handlePrint} disabled={exporting !== null}>
                  <Printer className="mr-2 h-4 w-4" />
                  {exporting === "print" ? "Preparando..." : "Imprimir"}
                </Button>
                <Button variant="outline" onClick={() => void handleExportPdf()} disabled={exporting !== null}>
                  <Download className="mr-2 h-4 w-4" />
                  {exporting === "pdf" ? "Gerando PDF..." : "PDF"}
                </Button>
                <Button variant="outline" onClick={() => void handleExportXlsx()} disabled={exporting !== null}>
                  <Download className="mr-2 h-4 w-4" />
                  {exporting === "xlsx" ? "Gerando XLSX..." : "XLSX"}
                </Button>
                <Link href="/itens">
                  <Button variant="outline">Abrir no catálogo</Button>
                </Link>
                <Link href="/consultas">
                  <Button variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Consulta central
                  </Button>
                </Link>
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Processos" value={detail.resumo.totalProcessos.toLocaleString("pt-BR")} />
              <StatCard label="Licitações" value={detail.resumo.totalLicitacoes.toLocaleString("pt-BR")} />
              <StatCard label="Contratos" value={detail.resumo.totalContratos.toLocaleString("pt-BR")} />
              <StatCard label="Valor contratado" value={formatCurrencyBRL(detail.resumo.valorTotalContratado)} />
              <StatCard label="Fornecedores" value={detail.resumo.totalFornecedoresDistintos.toLocaleString("pt-BR")} />
              <StatCard label="Qtd. contratada" value={formatNumberBR(detail.resumo.quantidadeTotalContratada, 3)} />
              <StatCard label="Valor médio" value={formatCurrencyBRL(detail.resumo.valorMedioContratado)} />
              <StatCard label="Menor unitário" value={formatCurrencyBRL(detail.resumo.menorValorUnitarioHistorico)} />
              <StatCard label="Maior unitário" value={formatCurrencyBRL(detail.resumo.maiorValorUnitarioHistorico)} />
              <StatCard label="Taxa de sucesso" value={detail.resumo.taxaSucessoMediaContratacao === null ? "–" : `${formatNumberBR(detail.resumo.taxaSucessoMediaContratacao, 2)}%`} />
            </div>
          </SectionCard>

          {detail.insights.length ? (
            <Alert title="Alertas analíticos" variant="warning">
              <div className="space-y-2">
                {detail.insights.map((insight) => (
                  <div key={insight.id}>
                    <div className="font-semibold">{insight.titulo}</div>
                    <div className="text-sm text-[var(--text-secondary)]">{insight.descricao}</div>
                  </div>
                ))}
              </div>
            </Alert>
          ) : null}

          <Tabs items={tabs} />
        </>
      ) : null}
    </div>
  );
}
