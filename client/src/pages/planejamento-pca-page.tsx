import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { FilePlus2 } from "lucide-react";

import { PageIntro } from "@/components/shared/page-intro";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatCurrencyBRL } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

const currentYear = new Date().getFullYear();

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    RASCUNHO: "Rascunho",
    EM_CONSOLIDACAO: "Em consolidação",
    APROVADO: "Aprovado",
    PUBLICACAO_PREPARADA: "Publicação preparada",
    PUBLICADO: "Publicado",
    CANCELADO: "Cancelado",
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (status === "APROVADO" || status === "PUBLICADO") return "bg-emerald-100 text-emerald-700";
  if (status === "PUBLICACAO_PREPARADA") return "bg-sky-100 text-sky-700";
  if (status === "CANCELADO") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-800";
}

export function PlanejamentoPcaPage() {
  const utils = trpc.useUtils();
  const [ano, setAno] = useState(String(currentYear + 1));
  const [secretariaId, setSecretariaId] = useState("");
  const [status, setStatus] = useState("");
  const [selectedPlanoId, setSelectedPlanoId] = useState<number | null>(null);
  const [processoId, setProcessoId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deferredAno = useDeferredValue(ano);

  const catalogQuery = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const filters = useMemo(
    () => ({
      ano: Number(deferredAno) || undefined,
      secretariaId: secretariaId ? Number(secretariaId) : undefined,
      status: status ? (status as any) : undefined,
    }),
    [deferredAno, secretariaId, status],
  );
  const listQuery = trpc.planejamento.listPca.useQuery(filters, { retry: false, placeholderData: (previous) => previous });
  const rows = listQuery.data ?? [];

  useEffect(() => {
    if (!rows.length) {
      setSelectedPlanoId(null);
      return;
    }
    if (!selectedPlanoId || !rows.some((row) => row.id === selectedPlanoId)) {
      setSelectedPlanoId(rows[0].id);
    }
  }, [rows, selectedPlanoId]);

  const detailQuery = trpc.planejamento.detailPca.useQuery(
    { planoId: selectedPlanoId ?? 0 },
    { enabled: Boolean(selectedPlanoId), retry: false },
  );
  const detail = detailQuery.data ?? null;

  const savePcaMutation = trpc.planejamento.savePca.useMutation({
    onSuccess: async (saved) => {
      await utils.planejamento.listPca.invalidate();
      setSelectedPlanoId(saved.id);
      setMessage("PCA anual criado para consolidação.");
      setErrorMessage(null);
    },
    onError: (error) => setErrorMessage(error.message),
  });

  const addFromDfdMutation = trpc.planejamento.addPcaItemFromDfd.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.planejamento.listPca.invalidate(), utils.planejamento.detailPca.invalidate()]);
      setProcessoId("");
      setMessage("Itens da DFD incluídos no PCA.");
      setErrorMessage(null);
    },
    onError: (error) => setErrorMessage(error.message),
  });

  const approveMutation = trpc.planejamento.approvePca.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.planejamento.listPca.invalidate(), utils.planejamento.detailPca.invalidate()]);
      setMessage("PCA aprovado com validações concluídas.");
      setErrorMessage(null);
    },
    onError: (error) => setErrorMessage(error.message),
  });

  const preparePublicationMutation = trpc.planejamento.preparePcaPublication.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.planejamento.listPca.invalidate(), utils.planejamento.detailPca.invalidate()]);
      setMessage("Publicação do PCA preparada para envio ao PNCP.");
      setErrorMessage(null);
    },
    onError: (error) => setErrorMessage(error.message),
  });

  const createPlano = () => {
    const secretaria = catalogQuery.data?.secretarias.find((item) => item.id === Number(secretariaId));
    savePcaMutation.mutate({
      ano: Number(ano) || currentYear + 1,
      orgaoCnpj: "13.650.403/0001-28",
      orgaoNome: "Município de Teixeira de Freitas",
      unidade: secretaria?.nome ?? "Consolidado municipal",
      secretariaId: secretaria?.id,
      status: "RASCUNHO",
      versao: 1,
      justificativa: "Plano de Contratações Anual aberto para consolidação das demandas formalizadas por DFD.",
    });
  };

  const addFromDfd = () => {
    if (!selectedPlanoId || !processoId) return;
    addFromDfdMutation.mutate({ planoId: selectedPlanoId, processoId: Number(processoId) });
  };

  const approvePca = () => {
    if (!selectedPlanoId) return;
    approveMutation.mutate({
      planoId: selectedPlanoId,
      dataAprovacao: new Date().toISOString().slice(0, 10),
      justificativa: "PCA aprovado após conferência de itens, valores, prioridades e vínculos com DFD.",
    });
  };

  return (
    <div className="space-y-6">
      {message ? <Alert variant="success">{message}</Alert> : null}
      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

      <PageIntro
        eyebrow="Planejamento"
        title="PCA com visão anual, origem nas DFDs e pendências de validação."
        description="Consolide o Plano de Contratações Anual por exercício, filtre por secretaria e prepare a publicação com rastreabilidade dos itens importados das DFDs."
        meta={[
          { label: "Exercício", value: ano || "-" },
          { label: "Planos", value: String(rows.length) },
          { label: "Itens selecionados", value: String(detail?.resumo.totalItens ?? 0) },
        ]}
        aside={
          <div className="rounded-[24px] border border-white/12 bg-white/[0.06] p-4 text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-100/70">PNCP</p>
            <p className="mt-3 text-sm leading-7 text-slate-200">A preparação de publicação bloqueia planos sem aprovação e destaca pendências antes do envio.</p>
          </div>
        }
      />

      <SectionCard
        title="Visão anual do PCA"
        description="Escolha o exercício e a secretaria para revisar planos ou abrir uma nova consolidação."
        action={
          <Button type="button" onClick={createPlano} disabled={savePcaMutation.isPending}>
            <FilePlus2 className="h-4 w-4" /> Novo PCA
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-[160px_1fr_220px]">
          <FormField label="Ano">
            <Input value={ano} onChange={(event) => setAno(event.target.value)} inputMode="numeric" />
          </FormField>
          <FormField label="Secretaria">
            <Select value={secretariaId} onChange={(event) => setSecretariaId(event.target.value)}>
              <option value="">Todas / consolidado municipal</option>
              {(catalogQuery.data?.secretarias ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.nome}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              {['RASCUNHO', 'EM_CONSOLIDACAO', 'APROVADO', 'PUBLICACAO_PREPARADA', 'PUBLICADO', 'CANCELADO'].map((item) => (
                <option key={item} value={item}>{statusLabel(item)}</option>
              ))}
            </Select>
          </FormField>
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SectionCard title="PCAs do exercício">
          {listQuery.isLoading ? <Skeleton className="h-44" /> : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Unidade</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Itens</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className={row.id === selectedPlanoId ? "bg-sky-50" : undefined} onClick={() => setSelectedPlanoId(row.id)}>
                    <TableCell>
                      <button type="button" className="text-left font-semibold text-[var(--text-primary)]">{row.unidade}</button>
                      <p className="text-xs text-[var(--text-muted)]">{row.ano} · versão {row.versao}</p>
                    </TableCell>
                    <TableCell><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></TableCell>
                    <TableCell>{row.itensCount}</TableCell>
                  </TableRow>
                ))}
                {!rows.length ? <TableRow><TableCell colSpan={3}>Nenhum PCA encontrado para os filtros selecionados.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard
          title={detail ? `${detail.plano.unidade} · ${detail.plano.ano}` : "Selecione um PCA"}
          description={detail ? `Valor estimado consolidado: ${formatCurrencyBRL(detail.resumo.valorTotal)}` : "Abra um PCA para incluir itens a partir das DFDs."}
          action={detail ? <Link href="/planejamento"><Button variant="outline">Voltar ao Planejamento</Button></Link> : undefined}
        >
          {detailQuery.isLoading ? <Skeleton className="h-64" /> : detail ? (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-[var(--border-subtle)] p-4"><p className="text-xs font-bold uppercase text-[var(--text-muted)]">Itens</p><strong>{detail.resumo.totalItens}</strong></div>
                <div className="rounded-2xl border border-[var(--border-subtle)] p-4"><p className="text-xs font-bold uppercase text-[var(--text-muted)]">DFDs vinculadas</p><strong>{detail.resumo.dfdVinculados}</strong></div>
                <div className="rounded-2xl border border-[var(--border-subtle)] p-4"><p className="text-xs font-bold uppercase text-[var(--text-muted)]">Pendências</p><strong>{detail.resumo.pendencias}</strong></div>
              </div>

              <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <FormField label="Incluir a partir da DFD / processo">
                    <Input value={processoId} onChange={(event) => setProcessoId(event.target.value)} placeholder="ID do processo" inputMode="numeric" />
                  </FormField>
                  <div className="flex items-end"><Button type="button" onClick={addFromDfd} disabled={!processoId || addFromDfdMutation.isPending}>Incluir DFD</Button></div>
                </div>
              </div>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Item</TableHeaderCell>
                    <TableHeaderCell>Prioridade</TableHeaderCell>
                    <TableHeaderCell>Valor</TableHeaderCell>
                    <TableHeaderCell>Validações pendentes</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-semibold">{item.numeroItem}. {item.descricao}</p>
                        <p className="text-xs text-[var(--text-muted)]">{item.quantidade} {item.unidade} · {item.unidadeRequisitante ?? item.secretariaRequisitante ?? "Unidade não informada"}</p>
                      </TableCell>
                      <TableCell>{item.grauPrioridade}</TableCell>
                      <TableCell>{item.valorEstimado ? formatCurrencyBRL(item.valorEstimado) : "-"}</TableCell>
                      <TableCell>{item.pendencias.length ? item.pendencias.join(", ") : "Sem pendências"}</TableCell>
                    </TableRow>
                  ))}
                  {!detail.itens.length ? <TableRow><TableCell colSpan={4}>Inclua itens a partir de DFDs para montar o PCA.</TableCell></TableRow> : null}
                </TableBody>
              </Table>

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={approvePca} disabled={approveMutation.isPending || detail.resumo.pendencias > 0 || !detail.resumo.totalItens}>Aprovar PCA</Button>
                <Button type="button" onClick={() => selectedPlanoId && preparePublicationMutation.mutate({ planoId: selectedPlanoId, canal: "PNCP" })} disabled={preparePublicationMutation.isPending || detail.plano.status !== "APROVADO"}>Preparar publicação</Button>
              </div>
            </div>
          ) : <Alert variant="info">Selecione ou crie um PCA para iniciar a visão anual.</Alert>}
        </SectionCard>
      </div>
    </div>
  );
}
