import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Printer, RefreshCcw, Search } from "lucide-react";
import { Link } from "wouter";

import type { DossieDetail } from "@sirel/shared/schemas/dossie";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
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
import { buildDossieHtml, openPrintableHtml } from "@/lib/print-documents";
import {
  formatCnpjBR,
  formatCurrencyBRL,
  formatNumberBR,
  formatShortDateBR,
  formatShortDateTimeBR,
} from "@/lib/formatters";
import { cleanDisplayText } from "@/lib/text";
import { trpc } from "@/lib/trpc";

function summarizeIdentifiers(detail: DossieDetail) {
  return [
    detail.processo.protocolo ? `Protocolo ${detail.processo.protocolo}` : null,
    detail.processo.numeroAdministrativo
      ? `Adm ${detail.processo.numeroAdministrativo}`
      : null,
    detail.processo.numeroEdital
      ? `Edital ${detail.processo.numeroEdital}`
      : null,
  ]
    .filter(Boolean)
    .join(" • ");
}

type CriticalStatusDateKey =
  | "HOMOLOGACAO"
  | "FRACASSADO"
  | "SUSPENSAO"
  | "REVOGACAO"
  | "ANULACAO"
  | "DESERTO";

const criticalStatusDateCatalog: Array<{
  key: CriticalStatusDateKey;
  label: string;
}> = [
  { key: "HOMOLOGACAO", label: "Homologação" },
  { key: "FRACASSADO", label: "Fracassado" },
  { key: "SUSPENSAO", label: "Suspensão" },
  { key: "REVOGACAO", label: "Revogação" },
  { key: "ANULACAO", label: "Anulação" },
  { key: "DESERTO", label: "Deserto" },
];

function normalizeStatusToken(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function detectCriticalStatusKey(
  label: string | null | undefined,
): CriticalStatusDateKey | null {
  const token = normalizeStatusToken(label);
  if (!token) return null;
  if (token.includes("HOMOLOG")) return "HOMOLOGACAO";
  if (token.includes("FRACASS")) return "FRACASSADO";
  if (token.includes("SUSPENS")) return "SUSPENSAO";
  if (token.includes("REVOG")) return "REVOGACAO";
  if (token.includes("ANUL")) return "ANULACAO";
  if (token.includes("DESERT")) return "DESERTO";
  return null;
}

function parseCriticalStatusFromObservacao(observacao: string | null) {
  if (!observacao) return null;
  const match = observacao.match(
    /Data do status\s+([^:]+):\s*(\d{4}-\d{2}-\d{2})/i,
  );
  if (!match) return null;
  const key = detectCriticalStatusKey(match[1]);
  if (!key) return null;
  return { key, date: match[2] };
}

function buildCriticalStatusDates(detail: DossieDetail) {
  const byKey = new Map<CriticalStatusDateKey, string>();

  const dataHomologacao = detail.licitacao.cabecalho?.dataHomologacao;
  if (dataHomologacao) {
    byKey.set("HOMOLOGACAO", dataHomologacao);
  }

  for (const movimentacao of detail.workflow.movimentacoes) {
    const parsed = parseCriticalStatusFromObservacao(movimentacao.observacao);
    if (parsed && !byKey.has(parsed.key)) {
      byKey.set(parsed.key, parsed.date);
    }
  }

  const fallbackStatusKey = detectCriticalStatusKey(
    detail.processo.statusAtual?.nome ?? detail.processo.statusAtual?.codigo,
  );
  if (
    fallbackStatusKey &&
    detail.processo.dataEncerramento &&
    !byKey.has(fallbackStatusKey)
  ) {
    byKey.set(fallbackStatusKey, detail.processo.dataEncerramento);
  }

  return criticalStatusDateCatalog.map((item) => ({
    ...item,
    date: byKey.get(item.key) ?? null,
  }));
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <article className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className={[
          "mt-2 text-2xl font-black",
          accent ? "text-[var(--accent-color)]" : "text-[var(--text-primary)]",
        ].join(" ")}
      >
        {value}
      </p>
    </article>
  );
}

interface DossiePageProps {
  processoId?: number;
}

export function DossiePage({ processoId }: DossiePageProps = {}) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(
    processoId ?? null,
  );
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    setSelectedProcessId(processoId ?? null);
  }, [processoId]);

  const optionsQuery = trpc.dossie.processOptions.useQuery(
    { search: deferredSearch || undefined, limit: 60 },
    { retry: false, placeholderData: (previous) => previous },
  );

  const detailQuery = trpc.dossie.detail.useQuery(
    { processoId: selectedProcessId ?? 0 },
    { enabled: Boolean(selectedProcessId), retry: false },
  );
  const refreshMutation = trpc.dossie.refresh.useMutation({
    onSuccess: async (result) => {
      setFeedback(result.message);
      setErrorMessage(null);
      await utils.dossie.detail.invalidate();
      await utils.contratos.list.invalidate();
      await utils.contratos.summary.invalidate();
    },
    onError: (mutationError) => {
      setErrorMessage(mutationError.message);
      setFeedback(null);
    },
  });

  const selectedOption = useMemo(
    () =>
      optionsQuery.data?.find((item) => item.id === selectedProcessId) ?? null,
    [optionsQuery.data, selectedProcessId],
  );

  function handlePrint(autoPrint = true) {
    if (!detailQuery.data) return;
    openPrintableHtml({
      title: `Dossiê ${detailQuery.data.processo.numeroSirel}`,
      bodyHtml: buildDossieHtml(detailQuery.data),
      autoPrint,
    });
  }

  const externalLinks = [
    (detailQuery.data?.importacoes.bll.processo?.linkExterno ??
      detailQuery.data?.licitacao.cabecalho?.linkBllPublico)
      ? {
          label: "Abrir BLL",
          href:
            detailQuery.data?.importacoes.bll.processo?.linkExterno ??
            detailQuery.data?.licitacao.cabecalho?.linkBllPublico ??
            "",
        }
      : null,
    (detailQuery.data?.importacoes.bll.processo?.urlPncp ??
      detailQuery.data?.licitacao.cabecalho?.linkPncpPublico)
      ? {
          label: "Abrir PNCP",
          href:
            detailQuery.data?.importacoes.bll.processo?.urlPncp ??
            detailQuery.data?.licitacao.cabecalho?.linkPncpPublico ??
            "",
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>;
  const criticalStatusDates = useMemo(
    () => (detailQuery.data ? buildCriticalStatusDates(detailQuery.data) : []),
    [detailQuery.data],
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Dossiê do processo"
        description="Panorama completo do processo, consolidando planejamento, licitação, contratos, documentos, workflow, legado, BLL e PNCP."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por SIREL, protocolo, edital, administrativo ou objeto"
                className="pl-9"
              />
            </div>
            <Select
              value={selectedProcessId ? String(selectedProcessId) : ""}
              onChange={(event) =>
                setSelectedProcessId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
              className="min-w-[320px]"
            >
              <option value="">Selecione um processo</option>
              {optionsQuery.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.numeroSirel} -{" "}
                  {item.protocolo ||
                    item.numeroEdital ||
                    item.numeroAdministrativo ||
                    item.siglaSecretaria}
                </option>
              ))}
            </Select>
            {selectedProcessId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedProcessId(null)}
              >
                Limpar seleção
              </Button>
            ) : null}
          </div>
        }
      >
        {!selectedProcessId ? (
          <Alert variant="info">
            Selecione um processo para abrir o dossiê consolidado.
          </Alert>
        ) : detailQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-24" />
            ))}
          </div>
        ) : detailQuery.error ? (
          <Alert variant="error">{detailQuery.error.message}</Alert>
        ) : !detailQuery.data ? (
          <Alert variant="warning">
            O processo selecionado não foi encontrado.
          </Alert>
        ) : (
          <div className="space-y-6">
            {feedback ? <Alert variant="success">{feedback}</Alert> : null}
            {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
            <article className="rounded-[32px] border border-[rgba(204,225,255,0.92)] bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(230,240,255,0.78))] px-5 py-5 shadow-[0_12px_24px_-24px_rgba(15,26,109,0.2)]">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-primary-700)]">
                    Dossiê consolidado
                  </p>
                  <h2 className="text-2xl font-black text-[var(--color-primary-900)]">
                    {detailQuery.data.processo.numeroSirel}
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {cleanDisplayText(
                      summarizeIdentifiers(detailQuery.data) ||
                        selectedOption?.secretaria ||
                        "Sem identificadores complementares",
                    )}
                  </p>
                  <p className="max-w-4xl text-sm leading-7 text-[var(--text-secondary)]">
                    {cleanDisplayText(detailQuery.data.processo.objeto)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Printer className="h-4 w-4" />}
                    onClick={() => handlePrint(true)}
                  >
                    Imprimir / PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RefreshCcw className="h-4 w-4" />}
                    onClick={() =>
                      refreshMutation.mutate({
                        processoId: detailQuery.data.processo.id,
                      })
                    }
                    disabled={refreshMutation.isPending}
                  >
                    {refreshMutation.isPending
                      ? "Atualizando..."
                      : "Atualizar dossiê"}
                  </Button>
                  <Link href={`/processos/${detailQuery.data.processo.id}`}>
                    <Button size="sm" variant="outline">
                      Processo
                    </Button>
                  </Link>
                  <Link href="/workflow">
                    <Button size="sm" variant="outline">
                      Workflow
                    </Button>
                  </Link>
                  <Link href={`/licitacao/${detailQuery.data.processo.id}`}>
                    <Button size="sm" variant="outline">
                      Licitação
                    </Button>
                  </Link>
                  <Link href="/contratos">
                    <Button size="sm" variant="outline">
                      Contratos
                    </Button>
                  </Link>
                  {externalLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<ExternalLink className="h-4 w-4" />}
                      >
                        {link.label}
                      </Button>
                    </a>
                  ))}
                </div>
              </div>
            </article>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Itens"
                value={String(detailQuery.data.resumo.totalItens)}
              />
              <StatCard
                label="Homologados"
                value={`${detailQuery.data.resumo.itensHomologados}/${detailQuery.data.resumo.totalItens}`}
              />
              <StatCard
                label="Fracassados / desertos"
                value={`${detailQuery.data.resumo.itensFracassados} / ${detailQuery.data.resumo.itensDesertos}`}
              />
              <StatCard
                label="Contratos"
                value={`${detailQuery.data.resumo.totalContratos} (${detailQuery.data.resumo.totalContratosPncp} PNCP)`}
              />
              <StatCard
                label="Valor estimado"
                value={formatCurrencyBRL(
                  detailQuery.data.resumo.valorEstimadoTotal,
                )}
                accent
              />
              <StatCard
                label="Valor vencedor"
                value={formatCurrencyBRL(
                  detailQuery.data.resumo.valorVencedorTotal,
                )}
                accent
              />
              <StatCard
                label="Economia"
                value={formatCurrencyBRL(detailQuery.data.resumo.economiaTotal)}
                accent
              />
              <StatCard
                label="Desconto"
                value={
                  detailQuery.data.resumo.percentualEconomia !== null
                    ? `${formatNumberBR(detailQuery.data.resumo.percentualEconomia, 2)}%`
                    : "-"
                }
              />
              <StatCard
                label="Valor contratado"
                value={formatCurrencyBRL(
                  detailQuery.data.resumo.valorContratadoTotal,
                )}
                accent
              />
              <StatCard
                label="Entrada na licitação"
                value={formatShortDateBR(
                  detailQuery.data.processo.dataEntradaLicitacao,
                )}
              />
              <StatCard
                label="Integrações"
                value={
                  [
                    detailQuery.data.resumo.temLegado ? "Legado" : null,
                    detailQuery.data.resumo.temBll ? "BLL" : null,
                    detailQuery.data.resumo.temPncp ? "PNCP" : null,
                  ]
                    .filter(Boolean)
                    .join(" / ") || "Interno"
                }
              />
              <StatCard
                label="Atualização financeira"
                value={formatShortDateBR(
                  detailQuery.data.resumo.ultimaSincronizacaoFinanceira,
                )}
              />
            </section>

            <SectionCard title="Datas criticas de status">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {criticalStatusDates.map((item) => (
                  <StatCard
                    key={item.key}
                    label={item.label}
                    value={formatShortDateBR(item.date)}
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Itens e valores">
              <div className="overflow-x-auto rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                <Table className="min-w-[1380px]">
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Lote</TableHeaderCell>
                      <TableHeaderCell>Item</TableHeaderCell>
                      <TableHeaderCell>Quantidade</TableHeaderCell>
                      <TableHeaderCell>Estimado</TableHeaderCell>
                      <TableHeaderCell>Vencedor</TableHeaderCell>
                      <TableHeaderCell>Desconto</TableHeaderCell>
                      <TableHeaderCell>Economia</TableHeaderCell>
                      <TableHeaderCell>Fornecedor vencedor</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {detailQuery.data.itens.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.loteNumeroExterno
                            ? `Lote ${item.loteNumeroExterno}`
                            : item.loteNumero
                              ? `Lote ${item.loteNumero}`
                              : "-"}
                        </TableCell>
                        <TableCell>
                          {item.catalogoItemId ? (
                            <Link
                              href={`/dossie/item/${item.catalogoItemId}`}
                              className="font-semibold text-[var(--accent-color)]"
                            >
                              Item {item.numeroItem}
                            </Link>
                          ) : (
                            <div className="font-semibold text-[var(--text-primary)]">
                              Item {item.numeroItem}
                            </div>
                          )}
                          <div className="text-xs text-[var(--text-muted)]">
                            {item.catalogoItemId ? (
                              <Link
                                href={`/dossie/item/${item.catalogoItemId}`}
                                className="text-[var(--accent-color)]"
                              >
                                {cleanDisplayText(item.descricao)}
                              </Link>
                            ) : (
                              cleanDisplayText(item.descricao)
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatNumberBR(item.quantidade, 3)} {item.unidade}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-[var(--text-primary)]">
                            {formatCurrencyBRL(item.valorTotalEstimado)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            Unit. {formatCurrencyBRL(item.valorUnitarioEstimado)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-[var(--text-primary)]">
                            {formatCurrencyBRL(item.valorLanceVencedorTotal)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            Unit.{" "}
                            {formatCurrencyBRL(item.valorLanceVencedorUnitario)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.percentualDesconto !== null
                            ? `${formatNumberBR(item.percentualDesconto, 2)}%`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {formatCurrencyBRL(item.economiaObtida)}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-[var(--text-primary)]">
                            {cleanDisplayText(
                              item.fornecedorVencedorNome ?? "Não identificado",
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {formatCnpjBR(item.fornecedorVencedorCnpj)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={[
                              "inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]",
                              item.itemHomologado
                                ? "bg-emerald-50 text-emerald-700"
                                : item.itemFracassado
                                  ? "bg-rose-50 text-rose-700"
                                  : item.itemDeserto
                                    ? "bg-amber-50 text-amber-800"
                                    : "bg-[var(--surface-soft)] text-[var(--text-secondary)]",
                            ].join(" ")}
                          >
                            {item.statusResumo}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!detailQuery.data.itens.length ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="text-center text-[var(--text-muted)]"
                        >
                          Nenhum item registrado.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>

            <SectionCard title="Fornecedores vencedores e contratos">
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="overflow-x-auto rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                  <Table className="min-w-[980px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Fornecedor</TableHeaderCell>
                        <TableHeaderCell>Itens</TableHeaderCell>
                        <TableHeaderCell>Valor total</TableHeaderCell>
                        <TableHeaderCell>Origem</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {detailQuery.data.fornecedoresVencedores.map((row) => (
                        <TableRow
                          key={`${row.fornecedorId ?? row.nome}-${row.cnpj ?? ""}`}
                        >
                          <TableCell>
                            {row.fornecedorId ? (
                              <Link
                                href={`/dossie/fornecedor/${row.fornecedorId}`}
                                className="font-semibold text-[var(--accent-color)]"
                              >
                                {row.nome}
                              </Link>
                            ) : (
                              <div className="font-semibold text-[var(--text-primary)]">
                                {row.nome}
                              </div>
                            )}
                            <div className="text-xs text-[var(--text-muted)]">
                              {formatCnpjBR(row.cnpj)}
                            </div>
                          </TableCell>
                          <TableCell>{row.totalItens}</TableCell>
                          <TableCell>
                            {formatCurrencyBRL(row.valorTotal)}
                          </TableCell>
                          <TableCell>{row.origemPrincipal}</TableCell>
                        </TableRow>
                      ))}
                      {!detailQuery.data.fornecedoresVencedores.length ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center text-[var(--text-muted)]"
                          >
                            Nenhum vencedor consolidado.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
                <div className="overflow-x-auto rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                  <Table className="min-w-[980px]">
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Contrato</TableHeaderCell>
                        <TableHeaderCell>Origem</TableHeaderCell>
                        <TableHeaderCell>Fornecedor</TableHeaderCell>
                        <TableHeaderCell>Vigência</TableHeaderCell>
                        <TableHeaderCell>Valor</TableHeaderCell>
                        <TableHeaderCell>Acesso</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {detailQuery.data.contratos.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="font-semibold text-[var(--text-primary)]">
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
                            {row.fornecedorId ? (
                              <Link
                                href={`/dossie/fornecedor/${row.fornecedorId}`}
                                className="font-semibold text-[var(--accent-color)]"
                              >
                                {row.fornecedorNome}
                              </Link>
                            ) : (
                              row.fornecedorNome
                            )}
                          </TableCell>
                          <TableCell>
                            {formatShortDateBR(row.dataVigenciaInicio)} até{" "}
                            {formatShortDateBR(row.dataVigenciaFim)}
                          </TableCell>
                          <TableCell>
                            {formatCurrencyBRL(row.valorContrato)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
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
                                    Ver no PNCP
                                  </Button>
                                </a>
                              ) : null}
                              {row.documentoContratoUrl ? (
                                <a
                                  href={row.documentoContratoUrl}
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
                      {!detailQuery.data.contratos.length ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center text-[var(--text-muted)]"
                          >
                            Nenhum contrato vinculado.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Documentos e prazos">
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-3">
                  {detailQuery.data.documentos.slice(0, 8).map((documento) => (
                    <article
                      key={documento.id}
                      className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[var(--text-primary)]">
                            {documento.titulo}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {documento.tipo} •{" "}
                            {documento.categoria || "Sem categoria"} • v
                            {documento.versao}
                          </div>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {formatShortDateBR(
                            documento.dataReferencia || documento.criadoEm,
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                  {!detailQuery.data.documentos.length ? (
                    <Alert variant="info">Nenhum documento cadastrado.</Alert>
                  ) : null}
                </div>
                <div className="space-y-3">
                  {detailQuery.data.prazos.map((prazo) => (
                    <article
                      key={prazo.id}
                      className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[var(--text-primary)]">
                            {prazo.titulo}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {prazo.tipo} • {prazo.status}
                          </div>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {formatShortDateBR(prazo.dataPrevista)}
                        </div>
                      </div>
                    </article>
                  ))}
                  {!detailQuery.data.prazos.length ? (
                    <Alert variant="info">
                      Nenhum prazo processual registrado.
                    </Alert>
                  ) : null}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Integrações e base importada">
              <div className="grid gap-4 xl:grid-cols-3">
                <StatCard
                  label="Registros legado"
                  value={String(
                    detailQuery.data.importacoes.legado.registros.length,
                  )}
                />
                <StatCard
                  label="Itens BLL"
                  value={String(detailQuery.data.importacoes.bll.itens.length)}
                />
                <StatCard
                  label="Contratações PNCP"
                  value={String(
                    detailQuery.data.importacoes.pncp.contratacoes.length,
                  )}
                />
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    Legado
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {detailQuery.data.importacoes.legado.registros.length
                      ? cleanDisplayText(
                          detailQuery.data.importacoes.legado.registros[0]
                            .loteArquivo,
                        )
                      : "Sem vínculo legado"}
                  </p>
                </div>
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    BLL
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {cleanDisplayText(
                      detailQuery.data.importacoes.bll.processo?.modalidade ??
                        "Sem vínculo BLL",
                    )}
                  </p>
                </div>
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    PNCP
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {detailQuery.data.importacoes.pncp.contratos.length
                      ? `${detailQuery.data.importacoes.pncp.contratos.length} contrato(s) importado(s)`
                      : "Sem vínculo PNCP"}
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Workflow e trilha completa">
              <div className="space-y-3">
                {detailQuery.data.workflow.movimentacoes
                  .map((row) => (
                    <article
                      key={row.id}
                      className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[var(--text-primary)]">
                            {cleanDisplayText(row.descricao)}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {cleanDisplayText(
                              row.moduloOrigem || "Origem inicial",
                            )}{" "}
                            → {cleanDisplayText(row.moduloDestino)}
                            {row.usuario ? ` • ${row.usuario}` : ""}
                          </div>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {formatShortDateTimeBR(row.criadoEm)}
                        </div>
                      </div>
                    {row.observacao ? (
                      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                        {cleanDisplayText(row.observacao)}
                      </p>
                    ) : null}
                    </article>
                  ))}
                {!detailQuery.data.workflow.movimentacoes.length ? (
                  <Alert variant="info">
                    Ainda não há movimentações registradas.
                  </Alert>
                ) : null}
              </div>
            </SectionCard>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

