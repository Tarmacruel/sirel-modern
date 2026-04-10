import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Building2, Download, ExternalLink, Printer, Search } from "lucide-react";
import { Link } from "wouter";

import type { DossieFilterOption } from "@sirel/shared/schemas/dossie";
import { SimpleBarChart } from "@/components/dashboard/simple-bar-chart";
import { SimpleDonutChart } from "@/components/dashboard/simple-donut-chart";
import { SimpleFunnelChart } from "@/components/dashboard/simple-funnel-chart";
import { SimpleHeatmap } from "@/components/dashboard/simple-heatmap";
import { SimpleMultiLineChart } from "@/components/dashboard/simple-multi-line-chart";
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
  exportDossieFornecedorToPdf,
  exportDossieFornecedorToXlsx,
  printDossieFornecedor,
} from "@/lib/export-dossie-entidades";
import { trpc } from "@/lib/trpc";

type FornecedorFilterState = {
  periodoInicio: string;
  periodoFim: string;
  modalidadeId: string;
  secretariaId: string;
  status: string;
  processoId: string;
  contratoId: string;
  itemId: string;
};

function readStateFromUrl(fornecedorId?: number) {
  const params = new URLSearchParams(window.location.search);
  return {
    selectedFornecedorId:
      fornecedorId ??
      (params.get("fornecedorId") ? Number(params.get("fornecedorId")) : null),
    filters: {
      periodoInicio: params.get("periodoInicio") ?? "",
      periodoFim: params.get("periodoFim") ?? "",
      modalidadeId: params.get("modalidadeId") ?? "",
      secretariaId: params.get("secretariaId") ?? "",
      status: params.get("status") ?? "",
      processoId: params.get("processoId") ?? "",
      contratoId: params.get("contratoId") ?? "",
      itemId: params.get("itemId") ?? "",
    } satisfies FornecedorFilterState,
  };
}

function syncUrl(selectedFornecedorId: number | null, filters: FornecedorFilterState) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const path = selectedFornecedorId
    ? `/dossie/fornecedor/${selectedFornecedorId}`
    : "/dossie/fornecedor";
  const query = params.toString();
  window.history.replaceState({}, "", query ? `${path}?${query}` : path);
}

function buildDetailInput(selectedFornecedorId: number, filters: FornecedorFilterState) {
  return {
    fornecedorId: selectedFornecedorId,
    filters: {
      periodoInicio: filters.periodoInicio || undefined,
      periodoFim: filters.periodoFim || undefined,
      modalidadeId: filters.modalidadeId ? Number(filters.modalidadeId) : undefined,
      secretariaId: filters.secretariaId ? Number(filters.secretariaId) : undefined,
      status: filters.status || undefined,
      processoId: filters.processoId ? Number(filters.processoId) : undefined,
      contratoId: filters.contratoId ? Number(filters.contratoId) : undefined,
      itemId: filters.itemId ? Number(filters.itemId) : undefined,
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

export function DossieFornecedorPage({
  fornecedorId,
}: {
  fornecedorId?: number;
} = {}) {
  const initialState = useMemo(() => readStateFromUrl(fornecedorId), [fornecedorId]);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState<null | "pdf" | "xlsx" | "print">(
    null,
  );
  const [selectedFornecedorId, setSelectedFornecedorId] = useState<number | null>(
    initialState.selectedFornecedorId,
  );
  const [filters, setFilters] = useState<FornecedorFilterState>(initialState.filters);
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    const next = readStateFromUrl(fornecedorId);
    setSelectedFornecedorId(next.selectedFornecedorId);
    setFilters(next.filters);
  }, [fornecedorId]);

  useEffect(() => {
    syncUrl(selectedFornecedorId, filters);
  }, [selectedFornecedorId, filters]);

  const optionsQuery = trpc.dossie.fornecedorOptions.useQuery(
    { search: deferredSearch || undefined, limit: 60 },
    { retry: false, placeholderData: (previous) => previous },
  );

  const detailQuery = trpc.dossie.fornecedorDetail.useQuery(
    selectedFornecedorId
      ? buildDetailInput(selectedFornecedorId, filters)
      : (undefined as never),
    { enabled: Boolean(selectedFornecedorId), retry: false },
  );

  const detail = detailQuery.data;
  const selectedOption = useMemo(
    () => optionsQuery.data?.find((row) => row.id === selectedFornecedorId) ?? null,
    [optionsQuery.data, selectedFornecedorId],
  );

  function handlePrint() {
    if (!detail) return;
    setExporting("print");
    try {
      printDossieFornecedor(detail);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPdf() {
    if (!detail) return;
    setExporting("pdf");
    try {
      await exportDossieFornecedorToPdf(detail);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportXlsx() {
    if (!detail) return;
    setExporting("xlsx");
    try {
      await exportDossieFornecedorToXlsx(detail);
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
                <MetaCard label="Documento" value={formatCnpjBR(detail.identificacao.documento)} />
                <MetaCard label="Status" value={detail.identificacao.status} />
                <MetaCard label="Situação interna" value={detail.identificacao.situacaoCadastralInterna} />
                <MetaCard label="E-mail" value={detail.identificacao.email ?? "Não informado"} />
                <MetaCard label="Telefone" value={detail.identificacao.telefone ?? "Não informado"} />
                <MetaCard label="Município/UF" value={`${detail.identificacao.municipio ?? "Não informado"}${detail.identificacao.uf ? `/${detail.identificacao.uf}` : ""}`} />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <SectionCard title="Participações x vitórias" description="Evolução temporal da atuação do fornecedor.">
                  <SimpleMultiLineChart items={detail.charts.participacoesVitorias} labels={{ a: "Participações", b: "Vitórias" }} />
                </SectionCard>
                <SectionCard title="Modalidades" description="Onde o fornecedor mais participa.">
                  <SimpleDonutChart items={detail.charts.modalidades.map((item) => ({ label: item.label, value: item.valor }))} />
                </SectionCard>
              </div>
            </div>
          ),
        },
        {
          value: "participacoes",
          label: "Participações",
          content: (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                <Table className="min-w-[1180px]">
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Processo</TableHeaderCell>
                      <TableHeaderCell>Modalidade</TableHeaderCell>
                      <TableHeaderCell>Papel</TableHeaderCell>
                      <TableHeaderCell>Tipo</TableHeaderCell>
                      <TableHeaderCell>Ofertado</TableHeaderCell>
                      <TableHeaderCell>Classificação</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {detail.participacoes.map((row) => (
                      <TableRow key={row.processoId}>
                        <TableCell>
                          <Link href={`/dossie/${row.processoId}`} className="font-semibold text-[var(--accent-color)]">
                            {row.numeroSirel}
                          </Link>
                          <div className="text-xs text-[var(--text-muted)]">{row.objetoProcesso}</div>
                        </TableCell>
                        <TableCell>{row.modalidade ?? "Não informado"}</TableCell>
                        <TableCell>{row.papel}</TableCell>
                        <TableCell>{row.tipoParticipacao}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.valorGlobalOfertado)}</TableCell>
                        <TableCell>{row.melhorClassificacao ?? "–"}</TableCell>
                        <TableCell>{row.statusFornecedor ?? "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                <Table className="min-w-[1180px]">
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Registro</TableHeaderCell>
                      <TableHeaderCell>Processo</TableHeaderCell>
                      <TableHeaderCell>Item</TableHeaderCell>
                      <TableHeaderCell>Estimado</TableHeaderCell>
                      <TableHeaderCell>Inicial</TableHeaderCell>
                      <TableHeaderCell>Final</TableHeaderCell>
                      <TableHeaderCell>Resultado</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {detail.ofertas.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.tipoRegistro}</TableCell>
                        <TableCell>
                          <Link href={`/dossie/${row.processoId}`} className="font-semibold text-[var(--accent-color)]">
                            {row.numeroSirel}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {row.itemCatalogoId ? (
                            <Link href={`/dossie/item/${row.itemCatalogoId}`} className="font-semibold text-[var(--accent-color)]">
                              {row.itemLabel}
                            </Link>
                          ) : (
                            row.itemLabel
                          )}
                        </TableCell>
                        <TableCell>{formatCurrencyBRL(row.valorEstimado)}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.valorOfertadoInicial)}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.valorFinal)}</TableCell>
                        <TableCell>{row.resultado ?? "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ),
        },
        {
          value: "vitorias",
          label: "Vitórias",
          content: (
            <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
              <Table className="min-w-[1140px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Item</TableHeaderCell>
                    <TableHeaderCell>Quantidade</TableHeaderCell>
                    <TableHeaderCell>Valor vencedor</TableHeaderCell>
                    <TableHeaderCell>Total vencido</TableHeaderCell>
                    <TableHeaderCell>Data</TableHeaderCell>
                    <TableHeaderCell>Status posterior</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {detail.vitorias.map((row) => (
                    <TableRow key={`${row.processoId}-${row.itemProcessoId}`}>
                      <TableCell>
                        <Link href={`/dossie/${row.processoId}`} className="font-semibold text-[var(--accent-color)]">
                          {row.numeroSirel}
                        </Link>
                        <div className="text-xs text-[var(--text-muted)]">{row.edital ?? "Sem edital"}</div>
                      </TableCell>
                      <TableCell>
                        {row.itemCatalogoId ? (
                          <Link href={`/dossie/item/${row.itemCatalogoId}`} className="font-semibold text-[var(--accent-color)]">
                            {row.itemLabel}
                          </Link>
                        ) : (
                          row.itemLabel
                        )}
                      </TableCell>
                      <TableCell>{formatNumberBR(row.quantidade, 3)} {row.unidade}</TableCell>
                      <TableCell>{formatCurrencyBRL(row.valorVencedorUnitario)}</TableCell>
                      <TableCell>{formatCurrencyBRL(row.valorTotalVencido)}</TableCell>
                      <TableCell>{formatShortDateBR(row.dataResultado)}</TableCell>
                      <TableCell>{row.statusPosterior}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ),
        },
        {
          value: "contratos",
          label: "Contratos",
          content: (
            <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
              <Table className="min-w-[1160px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Contrato</TableHeaderCell>
                    <TableHeaderCell>Origem</TableHeaderCell>
                    <TableHeaderCell>Processo</TableHeaderCell>
                    <TableHeaderCell>Valor</TableHeaderCell>
                    <TableHeaderCell>Atribuído</TableHeaderCell>
                    <TableHeaderCell>Itens</TableHeaderCell>
                    <TableHeaderCell>Saldo</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {detail.contratos.map((row) => (
                    <TableRow key={row.contratoId}>
                      <TableCell>
                        {row.origem === "PNCP" && row.pncpUrl ? (
                          <a href={row.pncpUrl} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent-color)]">
                            {row.numeroContrato}
                          </a>
                        ) : (
                          <span className="font-semibold text-[var(--text-primary)]">{row.numeroContrato}</span>
                        )}
                      </TableCell>
                      <TableCell>{row.origem}</TableCell>
                      <TableCell>
                        {row.processoId ? (
                          <Link href={`/dossie/${row.processoId}`} className="font-semibold text-[var(--accent-color)]">
                            {row.processoNumeroSirel ?? `Processo ${row.processoId}`}
                          </Link>
                        ) : (
                          row.processoNumeroSirel ?? "–"
                        )}
                      </TableCell>
                      <TableCell>{formatCurrencyBRL(row.valorTotalContrato)}</TableCell>
                      <TableCell>{formatCurrencyBRL(row.valorAtribuidoFornecedor)}</TableCell>
                      <TableCell>{row.totalItens.toLocaleString("pt-BR")}</TableCell>
                      <TableCell>{row.saldo === null ? "–" : formatNumberBR(row.saldo, 3)}</TableCell>
                      <TableCell>{row.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ),
        },
        {
          value: "itens",
          label: "Itens",
          content: (
            <div className="space-y-4">
              <SectionCard title="Top itens vencidos" description="Itens com maior valor ou frequência para o fornecedor.">
                <SimpleBarChart items={detail.charts.topItens.map((item) => ({ label: item.label, value: item.valor }))} />
              </SectionCard>
              <div className="overflow-x-auto rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                <Table className="min-w-[1060px]">
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Item</TableHeaderCell>
                      <TableHeaderCell>Ofertado</TableHeaderCell>
                      <TableHeaderCell>Vencido</TableHeaderCell>
                      <TableHeaderCell>Menor preço</TableHeaderCell>
                      <TableHeaderCell>Média</TableHeaderCell>
                      <TableHeaderCell>Último ofertado</TableHeaderCell>
                      <TableHeaderCell>Último vencedor</TableHeaderCell>
                      <TableHeaderCell>Participação nas vitórias</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {detail.itens.map((row, index) => (
                      <TableRow key={`${row.itemCatalogoId ?? row.itemLabel}-${index}`}>
                        <TableCell>
                          {row.itemCatalogoId ? (
                            <Link href={`/dossie/item/${row.itemCatalogoId}`} className="font-semibold text-[var(--accent-color)]">
                              {row.itemLabel}
                            </Link>
                          ) : (
                            row.itemLabel
                          )}
                        </TableCell>
                        <TableCell>{row.ofertado}</TableCell>
                        <TableCell>{row.vencido}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.menorPrecoOfertado)}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.precoMedioOfertado)}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.ultimoPrecoOfertado)}</TableCell>
                        <TableCell>{formatCurrencyBRL(row.ultimoPrecoVencedor)}</TableCell>
                        <TableCell>{row.participacaoVitoriasFornecedor === null ? "–" : `${formatNumberBR(row.participacaoVitoriasFornecedor, 2)}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ),
        },
        {
          value: "desempenho",
          label: "Desempenho",
          content: (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <SectionCard title="Funil concorrencial" description="Participações até contratos.">
                  <SimpleFunnelChart items={detail.charts.funil.map((item) => ({ label: item.label, valor: item.valor }))} />
                </SectionCard>
                <SectionCard title="Valor vencido por ano" description="Evolução do valor total vencido.">
                  <SimpleBarChart items={detail.charts.valorVencidoPorAno.map((item) => ({ label: item.label, value: item.valor }))} />
                </SectionCard>
              </div>
              <SectionCard title="Matriz por secretaria" description="Concentração institucional das vitórias do fornecedor.">
                <SimpleHeatmap items={detail.charts.heatmapSecretaria} />
              </SectionCard>
            </div>
          ),
        },
        {
          value: "timeline",
          label: "Linha do Tempo",
          content: (
            <div className="space-y-3">
              {detail.timeline.map((row) => (
                <article key={row.id} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{row.tipo}</div>
                      <div className="mt-1 text-base font-semibold text-[var(--text-primary)]">{row.titulo}</div>
                    </div>
                    <div className="text-sm text-[var(--text-secondary)]">{formatShortDateTimeBR(row.data)}</div>
                  </div>
                  <div className="mt-2 text-sm text-[var(--text-secondary)]">{row.descricao}</div>
                </article>
              ))}
            </div>
          ),
        },
        {
          value: "auditoria",
          label: "Auditoria",
          content: (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <MetaCard label="Última atualização" value={formatShortDateTimeBR(detail.auditoria.ultimaAtualizacaoCadastro)} />
                <MetaCard label="Registro unificado" value={detail.identificacao.registroUnificado ? "Sim" : "Não"} />
                <MetaCard label="Observações críticas" value={detail.auditoria.observacoesCriticas.length ? detail.auditoria.observacoesCriticas.join(" • ") : "Sem observações"} />
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
                    {detail.auditoria.trilha.map((row) => (
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
          { label: "Dossiê do fornecedor" },
          ...(selectedOption ? [{ label: selectedOption.label }] : []),
        ]}
      />

      <SectionCard
        title="Dossiê do fornecedor"
        description="Visão cadastral, concorrencial, contratual e histórica do fornecedor."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por razão social, CNPJ ou cidade"
                className="pl-9"
              />
            </div>
            <Select
              value={selectedFornecedorId ? String(selectedFornecedorId) : ""}
              onChange={(event) =>
                setSelectedFornecedorId(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">Selecione um fornecedor</option>
              {optionsQuery.data?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Link href="/cadastros">
              <Button variant="outline">
                <Building2 className="mr-2 h-4 w-4" />
                Cadastros
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
            <Input type="date" value={filters.periodoInicio} onChange={(event) => setFilters((prev) => ({ ...prev, periodoInicio: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Fim
            </label>
            <Input type="date" value={filters.periodoFim} onChange={(event) => setFilters((prev) => ({ ...prev, periodoFim: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Modalidade
            </label>
            <Select value={filters.modalidadeId} onChange={(event) => setFilters((prev) => ({ ...prev, modalidadeId: event.target.value }))}>
              {renderFilterOptions(detail?.filtrosDisponiveis.modalidades ?? [])}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Secretaria
            </label>
            <Select value={filters.secretariaId} onChange={(event) => setFilters((prev) => ({ ...prev, secretariaId: event.target.value }))}>
              {renderFilterOptions(detail?.filtrosDisponiveis.secretarias ?? [])}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Status
            </label>
            <Select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
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
            <Select value={filters.processoId} onChange={(event) => setFilters((prev) => ({ ...prev, processoId: event.target.value }))}>
              {renderFilterOptions(detail?.filtrosDisponiveis.processos ?? [])}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Contrato
            </label>
            <Select value={filters.contratoId} onChange={(event) => setFilters((prev) => ({ ...prev, contratoId: event.target.value }))}>
              {renderFilterOptions(detail?.filtrosDisponiveis.contratos ?? [])}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              Item
            </label>
            <Select value={filters.itemId} onChange={(event) => setFilters((prev) => ({ ...prev, itemId: event.target.value }))}>
              {renderFilterOptions(detail?.filtrosDisponiveis.itens ?? [])}
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

      {!selectedFornecedorId ? (
        <Alert title="Selecione um fornecedor" variant="info">
          Escolha um fornecedor para abrir o dossiê gerencial.
        </Alert>
      ) : null}

      {detailQuery.error ? (
        <Alert title="Não foi possível carregar o dossiê do fornecedor" variant="error">
          {detailQuery.error.message}
        </Alert>
      ) : null}

      {detail ? (
        <>
          <SectionCard
            title={detail.identificacao.razaoSocial}
            description={selectedOption?.subtitle ?? "Consolidação completa do fornecedor no SIREL."}
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
                <Link href="/cadastros">
                  <Button variant="outline">Abrir em cadastros</Button>
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
              <StatCard label="Vitórias" value={detail.resumo.totalVitorias.toLocaleString("pt-BR")} />
              <StatCard label="Taxa de vitória" value={detail.resumo.taxaVitoria === null ? "–" : `${formatNumberBR(detail.resumo.taxaVitoria, 2)}%`} />
              <StatCard label="Contratos" value={detail.resumo.totalContratos.toLocaleString("pt-BR")} />
              <StatCard label="Valor ofertado" value={formatCurrencyBRL(detail.resumo.valorTotalOfertado)} />
              <StatCard label="Valor vencido" value={formatCurrencyBRL(detail.resumo.valorTotalVencido)} />
              <StatCard label="Valor contratado" value={formatCurrencyBRL(detail.resumo.valorTotalContratado)} />
              <StatCard label="Itens ofertados" value={detail.resumo.totalItensOfertados.toLocaleString("pt-BR")} />
              <StatCard label="Itens vencidos" value={detail.resumo.totalItensVencidos.toLocaleString("pt-BR")} />
            </div>
          </SectionCard>

          {detail.identificacao.registroUnificado ? (
            <Alert title="Cadastro com histórico de unificação" variant="info">
              Este fornecedor possui trilha de unificação cadastral identificada na auditoria.
            </Alert>
          ) : null}

          {detail.insights.length ? (
            <Alert title="Alertas e insights gerenciais" variant="warning">
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


