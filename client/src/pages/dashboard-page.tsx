import { ArrowRight, BarChart3, BellRing, BriefcaseBusiness, CheckSquare, Clock3, FolderOpenDot, Landmark, Search, Workflow } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Link, useLocation } from "wouter";

import { SimpleBarChart } from "@/components/dashboard/simple-bar-chart";
import { SimpleDonutChart } from "@/components/dashboard/simple-donut-chart";
import { SimpleLineChart } from "@/components/dashboard/simple-line-chart";
import { ProcessoCreateModal } from "@/components/processos/processo-create-modal";
import { ActionStrip } from "@/components/shared/action-strip";
import { ContextEmptyState } from "@/components/shared/context-empty-state";
import { CriticalAlertRail } from "@/components/shared/critical-alert-rail";
import { MetricTile } from "@/components/shared/metric-tile";
import { PageIntro } from "@/components/shared/page-intro";
import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatCurrencyBRL, formatShortDateTimeBR } from "@/lib/formatters";
import { roleLabel } from "@/lib/entry-experience";
import { cleanDisplayText } from "@/lib/text";
import { trpc } from "@/lib/trpc";

const agendaTypeLabels = {
  PRAZO: "Prazo",
  MOVIMENTACAO: "Movimentação",
  DOCUMENTO: "Documento",
  SISTEMA: "Sistema",
} as const;

const priorityLabels = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
} as const;

const entryIconMap = {
  processos: <FolderOpenDot className="h-4 w-4" />,
  prazos: <Clock3 className="h-4 w-4" />,
  compras: <Workflow className="h-4 w-4" />,
  licitacao: <BarChart3 className="h-4 w-4" />,
  relatorios: <BarChart3 className="h-4 w-4" />,
  contratos: <BriefcaseBusiness className="h-4 w-4" />,
  usuarios: <BellRing className="h-4 w-4" />,
  parametros: <Search className="h-4 w-4" />,
  importacoes: <Workflow className="h-4 w-4" />,
  auditoria: <Search className="h-4 w-4" />,
  consultas: <Search className="h-4 w-4" />,
  dossie: <BarChart3 className="h-4 w-4" />,
  notificacoes: <BellRing className="h-4 w-4" />,
  workflow: <Workflow className="h-4 w-4" />,
  dashboard: <BarChart3 className="h-4 w-4" />,
  cadastros: <BellRing className="h-4 w-4" />,
} as const;

function greetingLabel() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function buildSearchHref(row: { id: number; moduloAtual: string }) {
  return row.moduloAtual === "LICITACAO" ? `/licitacao/${row.id}` : `/processos/${row.id}`;
}

export function DashboardPage() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchStatusId, setSearchStatusId] = useState("");
  const [searchModalidadeId, setSearchModalidadeId] = useState("");
  const [filterYear, setFilterYear] = useState<number | null>(new Date().getFullYear());
  const [selectedSecretariaId, setSelectedSecretariaId] = useState<number | null>(null);
  const [selectedModalidadeId, setSelectedModalidadeId] = useState<number | null>(null);
  const [selectedCondutorId, setSelectedCondutorId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const deferredSearch = useDeferredValue(searchTerm.trim());

  const entryQuery = trpc.dashboard.entry.useQuery(undefined, { retry: false, staleTime: 30_000 });
  const summaryQuery = trpc.dashboard.summary.useQuery(
    {
      ano: filterYear,
      modalidadeId: selectedModalidadeId ?? undefined,
      condutorId: selectedCondutorId ?? undefined,
      secretariaId: selectedSecretariaId ?? undefined,
    },
    { retry: false, refetchInterval: 30_000, refetchOnWindowFocus: true },
  );
  const recentProcesses = trpc.processos.list.useQuery({ page: 1, pageSize: 6 }, { retry: false });
  const catalogos = trpc.cadastros.formOptions.useQuery(undefined, { retry: false });
  const quickSearchQuery = trpc.consultas.search.useQuery(
    {
      termo: deferredSearch || undefined,
      statusId: searchStatusId ? Number(searchStatusId) : undefined,
      modalidadeId: searchModalidadeId ? Number(searchModalidadeId) : undefined,
      pagina: 1,
      limite: 5,
    },
    {
      retry: false,
      enabled: Boolean(deferredSearch || searchStatusId || searchModalidadeId),
      placeholderData: (previous) => previous,
    },
  );

  const data = summaryQuery.data ?? {
    processosAtivos: 0,
    contratosVigentes: 0,
    valorGlobalEstimado: 0,
    prazosHoje: 0,
    prazos24h: 0,
    prazos48h: 0,
    prazosAtrasados: 0,
    tarefasPendentesUsuario: 0,
    movimentacoesUltimas24h: 0,
    porModulo: [],
    processosPorSecretaria: [],
    modalidadesMaisUtilizadas: [],
    evolucaoMensal: [],
    rankingCondutores: [],
    minhaAgenda: [],
    agendaCritica: [],
    ultimasMovimentacoes: [],
  };
  const entry = entryQuery.data;

  const introMeta = entry
    ? [
        { label: "Perfil", value: roleLabel(entry.userContext.role) },
        { label: "Secretaria", value: entry.userContext.secretaria ?? "Sem vínculo" },
        {
          label: "Último acesso",
          value: entry.userContext.lastSignedIn
            ? formatShortDateTimeBR(entry.userContext.lastSignedIn)
            : "Primeira sessão registrada",
        },
      ]
    : [];

  const actionItems = (entry?.recommendedActions ?? []).map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    href: item.href,
    badge: item.badge,
    icon: entryIconMap[item.iconKey as keyof typeof entryIconMap] ?? <ArrowRight className="h-4 w-4" />,
  }));

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Entrada operacional"
        title={`${greetingLabel()}, ${entry?.userContext.nome.split(" ")[0] ?? "equipe"}. O que importa hoje já está visível.`}
        description="A primeira dobra reúne contexto do usuário, prioridades do dia e caminhos rápidos para a próxima ação útil dentro do SIREL. A leitura analítica continua abaixo sem disputar atenção com a operação imediata."
        meta={introMeta}
        dataTourId="dashboard-entry-intro"
        aside={
          <div className="rounded-[26px] border border-white/12 bg-white/[0.06] p-4 text-white backdrop-blur-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-100/70">Leitura imediata</p>
            <p className="mt-3 text-2xl font-black tracking-[-0.04em]">{entry?.criticalCounts.notificacoesNaoLidas ?? 0}</p>
            <p className="mt-1 text-sm text-white/78">
              notificação(ões) não lidas e {entry?.criticalCounts.prazosHoje ?? 0} compromisso(s) previstos para hoje.
            </p>
          </div>
        }
      />

      <CriticalAlertRail
        title="O que merece atenção imediata"
        description="Antes dos gráficos, a faixa crítica aponta o que pode mudar o ritmo da operação nas próximas horas."
        items={
          entry
            ? [
                {
                  id: "overdue",
                  eyebrow: "Janela crítica",
                  title: `${entry.criticalCounts.prazosAtrasados} prazo(s) em atraso`,
                  description: "Casos que já ultrapassaram a data prevista e precisam de correção prioritária.",
                  href: "/prazos",
                  tone: entry.criticalCounts.prazosAtrasados > 0 ? "danger" : "info",
                },
                {
                  id: "today",
                  eyebrow: "Hoje",
                  title: `${entry.criticalCounts.prazosHoje} compromisso(s) do dia`,
                  description: "Itens com virada operacional na data atual para ordenar a fila logo na abertura.",
                  href: "/prazos",
                  tone: "warning",
                },
                {
                  id: "notifications",
                  eyebrow: "Equipe e sistema",
                  title: `${entry.criticalCounts.notificacoesNaoLidas} notificação(ões) pendentes`,
                  description: "Mensagens operacionais e alertas do sistema que ainda precisam de leitura ou tratamento.",
                  href: "/notificacoes",
                  tone: entry.criticalCounts.notificacoesNaoLidas > 0 ? "info" : "success",
                },
              ]
            : []
        }
        dataTourId="dashboard-critical"
      />

      <ActionStrip
        title="Próximos passos mais prováveis"
        description="Sugestões orientadas pelo seu perfil para encurtar o caminho até o módulo certo."
        items={actionItems}
        dataTourId="dashboard-actions"
      />

      <SectionCard title="Continue de onde parou" description="Processos recentes para retomada rápida entre sessões.">
        <div data-tour-id="dashboard-continue">
          {entryQuery.isLoading ? (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-[24px]" />
              ))}
            </div>
          ) : entry?.continueItems.length ? (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {entry.continueItems.map((item) => (
                <Link key={item.processoId} href={item.href}>
                  <article className="h-full rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-soft)]">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">{item.moduloAtual}</p>
                    <h3 className="mt-2 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{item.numeroSirel}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {cleanDisplayText(item.objeto).length > 96
                        ? `${cleanDisplayText(item.objeto).slice(0, 93)}...`
                        : cleanDisplayText(item.objeto)}
                    </p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{cleanDisplayText(item.secretaria)}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {cleanDisplayText(item.etapaAtual)} • {item.atualizadoEm ? formatShortDateTimeBR(item.atualizadoEm) : "Sem atualização recente"}
                    </p>
                  </article>
                </Link>
              ))}
            </div>
          ) : (
            <ContextEmptyState
              title="Nada pendente para retomada imediata"
              description="Quando houver processos recentes ou fluxos retomáveis, eles aparecerão aqui para encurtar sua volta ao trabalho."
              actionLabel="Abrir processos"
              actionHref="/processos"
              icon={<FolderOpenDot className="h-5 w-5" />}
            />
          )}
        </div>
      </SectionCard>

      <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)]" data-tour-id="dashboard-filters">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-3 whitespace-nowrap">
            <span className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Ano de leitura</span>
            <select
              value={filterYear ?? "all"}
              onChange={(e) => setFilterYear(e.target.value === "all" ? null : Number(e.target.value))}
              className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--surface-highlight)]"
            >
              <option value="all">Todos os anos</option>
              {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 9 + i).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <div className="flex-1" />
          <p className="text-xs leading-6 text-[var(--text-muted)]">
            Os filtros abaixo continuam afetando KPIs e gráficos sem alterar a faixa inicial de urgência.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
        <MetricTile label="Processos ativos" value={String(data.processosAtivos)} description="Base viva em andamento no SIREL." icon={<FolderOpenDot className="h-6 w-6" />} />
        <MetricTile label="Contratos vigentes" value={String(data.contratosVigentes)} description="Contratos ligados a processos formalizados." icon={<BriefcaseBusiness className="h-6 w-6" />} />
        <MetricTile label="Tarefas pendentes" value={String(data.tarefasPendentesUsuario)} description="Pendências pessoais ainda sem leitura final." icon={<CheckSquare className="h-6 w-6" />} />
        <MetricTile label="Movimentações 24h" value={String(data.movimentacoesUltimas24h)} description="Atualizações recentes do workflow." icon={<Workflow className="h-6 w-6" />} />
        <MetricTile label="Valor global" value={formatCurrencyBRL(data.valorGlobalEstimado)} description="Soma dos valores estimados registrados." icon={<Landmark className="h-6 w-6" />} />
        <MetricTile label="Prazos em atraso" value={String(data.prazosAtrasados)} description="Volume que merece correção prioritária." icon={<Clock3 className="h-6 w-6" />} accent={data.prazosAtrasados > 0} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard
          title="Busca global inteligente"
          description="Localize processos por SIREL, protocolo, número administrativo, edital, objeto, fornecedor e filtros rápidos."
          action={
            <Link href="/consultas">
              <Button variant="outline" size="sm">
                Ir para Consultas
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.7fr))]">
            <FormField label="Busca textual">
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="SIREL, protocolo, administrativo, edital, objeto ou fornecedor" />
            </FormField>
            <FormField label="Status">
              <Select value={searchStatusId} onChange={(event) => setSearchStatusId(event.target.value)}>
                <option value="">Todos</option>
                {catalogos.data?.statusProcesso.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Modalidade">
              <Select value={searchModalidadeId} onChange={(event) => setSearchModalidadeId(event.target.value)}>
                <option value="">Todas</option>
                {catalogos.data?.modalidades.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="mt-4 space-y-3">
            {quickSearchQuery.isLoading && (deferredSearch || searchStatusId || searchModalidadeId)
              ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-[24px]" />)
              : quickSearchQuery.data?.dados.map((row) => (
                  <Link key={row.id} href={buildSearchHref(row)}>
                    <button type="button" className="w-full rounded-[24px] border border-[rgba(204,225,255,0.85)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(230,240,255,0.66))] px-4 py-4 text-left transition hover:border-[rgba(65,105,225,0.45)] hover:bg-white">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--color-primary-900)] px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">{row.numeroSirel}</span>
                        <span className="rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-xs font-bold text-[var(--color-primary-800)]">{row.modalidade}</span>
                        <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-bold text-[var(--color-neutral-700)]">{row.status}</span>
                      </div>
                      <p className="mt-3 text-sm font-bold text-[var(--color-primary-900)]">{cleanDisplayText(row.objetoResumo)}</p>
                      <p className="mt-1 text-xs text-[var(--color-neutral-500)]">
                        {cleanDisplayText(row.secretariaNome)} • módulo: {cleanDisplayText(row.moduloAtual)} • documentos: {row.documentos}
                      </p>
                    </button>
                  </Link>
                ))}
            {!quickSearchQuery.isLoading && !quickSearchQuery.data?.dados.length && (deferredSearch || searchStatusId || searchModalidadeId) ? (
              <Alert variant="info">Nenhum processo localizado com os filtros informados.</Alert>
            ) : null}
            {!deferredSearch && !searchStatusId && !searchModalidadeId ? (
              <Alert variant="info">Digite um termo ou aplique filtros para receber sugestões rápidas com debounce automático.</Alert>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Minha agenda"
          description="Próximas tarefas do usuário e atalhos frequentes para operação."
          action={
            <Link href="/notificacoes">
              <Button variant="outline" size="sm">
                Central de Notificações
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        >
          <div className="space-y-3">
            {summaryQuery.isLoading
              ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-[24px]" />)
              : data.minhaAgenda.map((item) => (
                  <div key={item.id} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--color-primary-100)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-800)]">
                        {agendaTypeLabels[item.type as keyof typeof agendaTypeLabels] ?? item.type}
                      </span>
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]",
                          item.priority === "URGENTE"
                            ? "bg-rose-100 text-rose-800"
                            : item.priority === "ALTA"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700",
                        ].join(" ")}
                      >
                        {priorityLabels[item.priority as keyof typeof priorityLabels] ?? item.priority}
                      </span>
                    </div>
                    <p className="mt-3 font-black text-[var(--text-primary)]">{cleanDisplayText(item.title)}</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{cleanDisplayText(item.message)}</p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{formatShortDateTimeBR(item.createdAt)}</p>
                  </div>
                ))}
            {!summaryQuery.isLoading && !data.minhaAgenda.length ? <Alert variant="info">Nenhuma tarefa pendente no momento.</Alert> : null}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button size="sm" onClick={() => setCreateModalOpen(true)}>
              Novo processo
            </Button>
            <Link href="/prazos">
              <Button size="sm" variant="outline">
                Abrir prazos
              </Button>
            </Link>
            <Link href="/relatorios">
              <Button size="sm" variant="outline">
                Gerar relatório
              </Button>
            </Link>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Indicadores analíticos" description="A leitura gerencial continua disponível abaixo da faixa operacional inicial.">
        <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.92fr)_minmax(0,0.93fr)]">
          <div className="min-h-[320px] min-w-0">
            {summaryQuery.isLoading ? (
              <Skeleton className="h-full w-full rounded-[28px]" />
            ) : (
              <SimpleDonutChart
                items={data.processosPorSecretaria.map((item) => ({ id: item.secretariaId, label: item.secretaria, value: item.total }))}
                selected={selectedSecretariaId}
                onSliceClick={(item) => {
                  setSelectedSecretariaId(item.id as number);
                  setSelectedModalidadeId(null);
                  setSelectedCondutorId(null);
                }}
              />
            )}
          </div>
          <div className="min-h-[320px] min-w-0">
            {summaryQuery.isLoading ? <Skeleton className="h-full w-full rounded-[28px]" /> : <SimpleLineChart items={data.evolucaoMensal.map((item) => ({ label: item.mes, value: item.total }))} />}
          </div>
          <div className="min-h-[320px] min-w-0 xl:col-span-2 2xl:col-span-1">
            {summaryQuery.isLoading ? (
              <Skeleton className="h-full w-full rounded-[28px]" />
            ) : (
              <SimpleBarChart
                items={data.modalidadesMaisUtilizadas.map((item) => ({ label: item.modalidade, value: item.total, id: item.modalidadeId }))}
                onBarClick={(item) => {
                  setSelectedModalidadeId(item.id as number);
                  setSelectedCondutorId(null);
                }}
                selected={selectedModalidadeId}
              />
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Processos recentes" description="Amostra operacional dos últimos processos cadastrados ou atualizados.">
        <div className="overflow-hidden rounded-[28px] border border-[var(--border-subtle)]">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Processo</TableHeaderCell>
                <TableHeaderCell>Objeto</TableHeaderCell>
                <TableHeaderCell>Módulo</TableHeaderCell>
                <TableHeaderCell>Valor estimado</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {recentProcesses.isLoading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={4}>
                        <Skeleton className="h-12 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : recentProcesses.data?.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-bold text-[var(--text-primary)]">{row.numeroSirel}</div>
                        <div className="text-xs text-[var(--text-muted)]">{cleanDisplayText(row.secretaria)}</div>
                      </TableCell>
                      <TableCell className="max-w-[320px]">{cleanDisplayText(row.objeto)}</TableCell>
                      <TableCell>{cleanDisplayText(row.moduloAtual ?? "Sem workflow")}</TableCell>
                      <TableCell>{row.valorEstimado ? formatCurrencyBRL(Number(row.valorEstimado)) : "-"}</TableCell>
                    </TableRow>
                  ))}
              {!recentProcesses.isLoading && !recentProcesses.data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-[var(--text-muted)]">
                    Nenhum processo criado ainda na base do SIREL.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <ProcessoCreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={(created) => setLocation(`/processos/${created.id}`)}
      />
    </div>
  );
}
