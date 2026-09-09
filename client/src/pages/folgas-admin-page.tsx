import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarClock,
  CalendarOff,
  ChevronLeft,
  CircleAlert,
  Download,
  RefreshCcw,
  Save,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Link } from "wouter";

import { FolgasPeopleAdmin } from "@/components/folgas-people-admin";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const inputClass =
  "h-10 w-full rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-color)]";

function isoToLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const blankCampaign = {
  id: undefined as number | undefined,
  nome: "Folgas 7 de setembro",
  calendarioConfirmado: false,
  ano: 2026,
  dataInicio: "2026-09-08",
  dataFim: "2026-12-31",
  selecaoInicio: "",
  selecaoFim: "",
  maxFolgas: 2,
  maxDiasConsecutivos: 3,
  status: "RASCUNHO" as "RASCUNHO" | "ABERTA" | "FECHADA" | "ARQUIVADA",
};

export function FolgasAdminPage() {
  const utils = trpc.useUtils();
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [creatingNew, setCreatingNew] = useState(false);
  const dashboardQuery = trpc.folgas.adminDashboard.useQuery(
    selectedCampaignId ? { campaignId: selectedCampaignId } : undefined,
    { retry: false },
  );
  const [campaignForm, setCampaignForm] = useState(blankCampaign);
  const [nonWorkingForm, setNonWorkingForm] = useState({
    data: "2026-09-07",
    tipo: "FERIADO" as "FERIADO" | "PONTO_FACULTATIVO" | "BLOQUEIO_ADMIN",
    descricao: "Independência do Brasil",
    bloqueiaSelecao: true,
    contaComoSemExpediente: true,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reportMutation = trpc.folgas.adminExportPdf.useMutation({
    onSuccess: (report) => {
      const bytes = Uint8Array.from(atob(report.base64), (char) =>
        char.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: report.mimeType }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = report.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError(null);
      setMessage(
        "Relatório PDF gerado com as reservas confirmadas da campanha.",
      );
    },
    onError: (mutationError) => {
      setMessage(null);
      setError(mutationError.message);
    },
  });

  const invalidate = async () => {
    await Promise.all([
      utils.folgas.adminDashboard.invalidate(),
      utils.folgas.overview.invalidate(),
    ]);
  };

  const campaignMutation = trpc.folgas.adminSaveCampaign.useMutation({
    onSuccess: async (saved) => {
      setCreatingNew(false);
      setSelectedCampaignId(saved.id);
      setMessage("Campanha salva com sucesso.");
      setError(null);
      await invalidate();
    },
    onError: (mutationError) => {
      setMessage(null);
      setError(mutationError.message);
    },
  });
  const participantMutation = trpc.folgas.adminSetParticipant.useMutation({
    onSuccess: invalidate,
    onError: (mutationError) => setError(mutationError.message),
  });
  const nonWorkingMutation = trpc.folgas.adminSaveNonWorkingDay.useMutation({
    onSuccess: async () => {
      setMessage("Calendário de dias não úteis atualizado.");
      setError(null);
      await invalidate();
    },
    onError: (mutationError) => {
      setMessage(null);
      setError(mutationError.message);
    },
  });
  const deleteNonWorkingMutation =
    trpc.folgas.adminDeleteNonWorkingDay.useMutation({
      onSuccess: invalidate,
      onError: (e) => setError(e.message),
    });
  const removeReservationMutation =
    trpc.folgas.adminRemoveReservation.useMutation({
      onSuccess: invalidate,
      onError: (e) => setError(e.message),
    });

  useEffect(() => {
    if (
      !creatingNew &&
      !selectedCampaignId &&
      dashboardQuery.data?.campaigns[0]?.id
    ) {
      setSelectedCampaignId(dashboardQuery.data.campaigns[0].id);
    }
  }, [creatingNew, dashboardQuery.data?.campaigns, selectedCampaignId]);

  useEffect(() => {
    if (creatingNew) return;
    const campaign = dashboardQuery.data?.selectedCampaign;
    if (!campaign) return;
    setCampaignForm({
      id: campaign.id,
      calendarioConfirmado: false,
      nome: campaign.nome,
      ano: campaign.ano,
      dataInicio: campaign.dataInicio,
      dataFim: campaign.dataFim,
      selecaoInicio: isoToLocal(campaign.selecaoInicio),
      selecaoFim: isoToLocal(campaign.selecaoFim),
      maxFolgas: campaign.maxFolgas,
      maxDiasConsecutivos: campaign.maxDiasConsecutivos,
      status: campaign.status as typeof blankCampaign.status,
    });
  }, [
    creatingNew,
    dashboardQuery.data?.selectedCampaign?.id,
    dashboardQuery.data?.selectedCampaign?.updatedAt,
  ]);

  const participantByUser = useMemo(
    () =>
      new Map(
        (dashboardQuery.data?.participants ?? []).map((item) => [
          item.userId,
          item,
        ]),
      ),
    [dashboardQuery.data?.participants],
  );

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    campaignMutation.mutate({
      id: campaignForm.id,
      calendarioConfirmado: campaignForm.calendarioConfirmado,
      nome: campaignForm.nome,
      ano: Number(campaignForm.ano),
      dataInicio: campaignForm.dataInicio,
      dataFim: campaignForm.dataFim,
      selecaoInicio: localToIso(campaignForm.selecaoInicio),
      selecaoFim: localToIso(campaignForm.selecaoFim),
      maxFolgas: Number(campaignForm.maxFolgas),
      maxDiasConsecutivos: Number(campaignForm.maxDiasConsecutivos),
      status: campaignForm.status,
    });
  }

  async function addNonWorking(event: FormEvent) {
    event.preventDefault();
    if (!selectedCampaignId) return;
    setMessage(null);
    setError(null);
    nonWorkingMutation.mutate({
      campaignId: selectedCampaignId,
      ...nonWorkingForm,
    });
  }

  if (dashboardQuery.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32" />
        <Skeleton className="h-[700px]" />
      </div>
    );
  }

  if (dashboardQuery.error) {
    return (
      <SectionCard
        title="Administração de folgas"
        description="Acesso restrito a administradores e gestores."
      >
        <div className="rounded-[18px] border border-[var(--danger-color)]/30 bg-[var(--danger-bg)] p-4 text-sm text-[var(--danger-color)]">
          {dashboardQuery.error.message}
        </div>
      </SectionCard>
    );
  }

  const data = dashboardQuery.data!;

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[var(--border-soft-contrast)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)] md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent-color)]">
              <CalendarClock className="h-4 w-4" /> Administração
            </div>
            <h1 className="mt-2 font-[var(--font-heading)] text-3xl font-black tracking-[-0.04em] text-[var(--text-primary)]">
              Configuração das folgas
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
              Defina campanha, participantes, feriados, pontos facultativos e
              acompanhe as reservas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-2"
              disabled={
                creatingNew || !selectedCampaignId || reportMutation.isPending
              }
              onClick={() => {
                if (!selectedCampaignId) return;
                setMessage(null);
                setError(null);
                reportMutation.mutate({ campaignId: selectedCampaignId });
              }}
            >
              <Download className="h-4 w-4" />
              {reportMutation.isPending
                ? "Gerando PDF..."
                : "Baixar relatório PDF"}
            </Button>
            <Link href="/folgas">
              <Button variant="outline" className="gap-2">
                <ChevronLeft className="h-4 w-4" /> Voltar ao calendário
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {message ? (
        <div className="rounded-[18px] border border-[var(--success-color)]/30 bg-[var(--success-bg)] px-4 py-3 text-sm font-medium text-[var(--success-color)]">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="flex gap-2 rounded-[18px] border border-[var(--danger-color)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm font-medium text-[var(--danger-color)]">
          <CircleAlert className="mt-0.5 h-4 w-4" /> {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-5">
          <SectionCard
            title="Campanhas"
            description="Selecione uma campanha existente ou crie uma nova."
          >
            <div className="space-y-2">
              {data.campaigns.map((campaign) => (
                <button
                  type="button"
                  key={campaign.id}
                  onClick={() => {
                    setCreatingNew(false);
                    setSelectedCampaignId(campaign.id);
                  }}
                  className={[
                    "w-full rounded-[16px] border px-3 py-3 text-left transition",
                    selectedCampaignId === campaign.id
                      ? "border-[var(--accent-color)] bg-[var(--surface-highlight)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]",
                  ].join(" ")}
                >
                  <p className="font-bold text-[var(--text-primary)]">
                    {campaign.nome}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span>{campaign.ano}</span>
                    <span>{campaign.status}</span>
                  </div>
                </button>
              ))}
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  setCreatingNew(true);
                  setSelectedCampaignId(null);
                  setCampaignForm({ ...blankCampaign });
                }}
              >
                <CalendarClock className="h-4 w-4" /> Nova campanha
              </Button>
            </div>
          </SectionCard>

          {selectedCampaignId ? (
            <SectionCard
              title="Resumo"
              description="Ocupação atual da campanha."
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[16px] bg-[var(--surface-soft)] p-3">
                  <p className="text-xs text-[var(--text-muted)]">
                    Participantes
                  </p>
                  <p className="mt-1 text-2xl font-black">
                    {data.participants.filter((x) => x.ativo).length}
                  </p>
                </div>
                <div className="rounded-[16px] bg-[var(--surface-soft)] p-3">
                  <p className="text-xs text-[var(--text-muted)]">Reservas</p>
                  <p className="mt-1 text-2xl font-black">
                    {data.reservations.length}
                  </p>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-5">
          <SectionCard
            title="Dados da campanha"
            description="Mantenha em rascunho até concluir participantes e calendário de feriados."
          >
            <form
              onSubmit={saveCampaign}
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              <label className="md:col-span-2 xl:col-span-2">
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                  Nome
                </span>
                <Input
                  value={campaignForm.nome}
                  onChange={(e) =>
                    setCampaignForm((c) => ({ ...c, nome: e.target.value }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                  Ano
                </span>
                <Input
                  type="number"
                  value={campaignForm.ano}
                  onChange={(e) =>
                    setCampaignForm((c) => ({
                      ...c,
                      ano: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                  Primeira data permitida
                </span>
                <Input
                  type="date"
                  value={campaignForm.dataInicio}
                  onChange={(e) =>
                    setCampaignForm((c) => ({
                      ...c,
                      dataInicio: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                  Última data permitida
                </span>
                <Input
                  type="date"
                  value={campaignForm.dataFim}
                  onChange={(e) =>
                    setCampaignForm((c) => ({ ...c, dataFim: e.target.value }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                  Máx. folgas por pessoa
                </span>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={campaignForm.maxFolgas}
                  onChange={(e) =>
                    setCampaignForm((c) => ({
                      ...c,
                      maxFolgas: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                  Abertura da escolha
                </span>
                <Input
                  type="datetime-local"
                  value={campaignForm.selecaoInicio}
                  onChange={(e) =>
                    setCampaignForm((c) => ({
                      ...c,
                      selecaoInicio: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                  Encerramento da escolha
                </span>
                <Input
                  type="datetime-local"
                  value={campaignForm.selecaoFim}
                  onChange={(e) =>
                    setCampaignForm((c) => ({
                      ...c,
                      selecaoFim: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                  Máx. dias consecutivos sem expediente
                </span>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={campaignForm.maxDiasConsecutivos}
                  onChange={(e) =>
                    setCampaignForm((c) => ({
                      ...c,
                      maxDiasConsecutivos: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                  Situação
                </span>
                <select
                  className={inputClass}
                  value={campaignForm.status}
                  onChange={(e) =>
                    setCampaignForm((c) => ({
                      ...c,
                      status: e.target.value as typeof c.status,
                    }))
                  }
                >
                  <option value="RASCUNHO">Rascunho</option>
                  <option value="ABERTA">Aberta</option>
                  <option value="FECHADA">Fechada</option>
                  <option value="ARQUIVADA">Arquivada</option>
                </select>
              </label>
              <label className="col-span-full flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={campaignForm.calendarioConfirmado}
                  onChange={(e) =>
                    setCampaignForm((c) => ({
                      ...c,
                      calendarioConfirmado: e.target.checked,
                    }))
                  }
                />
                Revisei os participantes e o calendário institucional, inclusive
                os dias sem expediente antes e depois do período. Obrigatório
                para abrir.
              </label>
              <div className="flex items-end">
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={campaignMutation.isPending}
                >
                  <Save className="h-4 w-4" />{" "}
                  {campaignMutation.isPending
                    ? "Salvando..."
                    : "Salvar campanha"}
                </Button>
              </div>
            </form>
          </SectionCard>

          {selectedCampaignId ? (
            <>
              <FolgasPeopleAdmin
                campaignId={selectedCampaignId}
                open={data.selectedCampaign?.status === "ABERTA"}
              />
              <SectionCard
                title="Participantes com conta"
                description="A autenticação é a mesma do SIREL; aqui você apenas habilita quem participa desta campanha."
              >
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {data.users.map((user) => {
                    const participant = participantByUser.get(user.id);
                    const active = Boolean(participant?.ativo);
                    return (
                      <div
                        key={user.id}
                        className="flex items-center justify-between gap-3 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                            {user.name}
                          </p>
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {user.username}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={active ? "outline" : "default"}
                          disabled={
                            participantMutation.isPending ||
                            data.selectedCampaign?.status === "ABERTA"
                          }
                          onClick={() =>
                            participantMutation.mutate({
                              campaignId: selectedCampaignId,
                              userId: user.id,
                              ativo: !active,
                              limiteFolgas: participant?.limiteFolgas ?? null,
                            })
                          }
                          className="gap-1.5"
                        >
                          {active ? (
                            <Users className="h-3.5 w-3.5" />
                          ) : (
                            <UserPlus className="h-3.5 w-3.5" />
                          )}
                          {active ? "Incluído" : "Incluir"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard
                title="Feriados, pontos facultativos e bloqueios"
                description="Cadastre também dias próximos ao início/fim do período, pois eles entram no cálculo das sequências de 4 dias ou mais."
              >
                <form
                  onSubmit={addNonWorking}
                  className="grid gap-3 md:grid-cols-2 xl:grid-cols-[160px_200px_minmax(0,1fr)_auto]"
                >
                  <Input
                    aria-label="Data sem expediente"
                    type="date"
                    value={nonWorkingForm.data}
                    onChange={(e) =>
                      setNonWorkingForm((c) => ({ ...c, data: e.target.value }))
                    }
                  />
                  <select
                    aria-label="Tipo de dia sem expediente"
                    className={inputClass}
                    value={nonWorkingForm.tipo}
                    onChange={(e) =>
                      setNonWorkingForm((c) => ({
                        ...c,
                        tipo: e.target.value as typeof c.tipo,
                      }))
                    }
                  >
                    <option value="FERIADO">Feriado</option>
                    <option value="PONTO_FACULTATIVO">Ponto facultativo</option>
                    <option value="BLOQUEIO_ADMIN">
                      Bloqueio administrativo
                    </option>
                  </select>
                  <Input
                    aria-label="Descrição do dia sem expediente"
                    value={nonWorkingForm.descricao}
                    placeholder="Descrição"
                    onChange={(e) =>
                      setNonWorkingForm((c) => ({
                        ...c,
                        descricao: e.target.value,
                      }))
                    }
                  />
                  <Button
                    type="submit"
                    className="gap-2"
                    disabled={
                      nonWorkingMutation.isPending ||
                      data.selectedCampaign?.status === "ABERTA"
                    }
                  >
                    <CalendarOff className="h-4 w-4" /> Adicionar
                  </Button>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={nonWorkingForm.bloqueiaSelecao}
                      onChange={(e) =>
                        setNonWorkingForm((c) => ({
                          ...c,
                          bloqueiaSelecao: e.target.checked,
                        }))
                      }
                    />
                    Bloqueia seleção
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={nonWorkingForm.contaComoSemExpediente}
                      onChange={(e) =>
                        setNonWorkingForm((c) => ({
                          ...c,
                          contaComoSemExpediente: e.target.checked,
                        }))
                      }
                    />
                    Conta como dia sem expediente
                  </label>
                </form>
                <div className="mt-4 space-y-2">
                  {data.nonWorkingDays.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 rounded-[16px] border border-[var(--border-subtle)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-bold text-[var(--text-primary)]">
                          {item.data} · {item.descricao}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {item.tipo} ·{" "}
                          {item.contaComoSemExpediente
                            ? "conta como dia sem expediente"
                            : "apenas bloqueio"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() =>
                          deleteNonWorkingMutation.mutate({
                            campaignId: selectedCampaignId,
                            id: item.id,
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </Button>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard
                title="Reservas confirmadas"
                description="Relação administrativa das datas já ocupadas."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => dashboardQuery.refetch()}
                  >
                    <RefreshCcw className="h-3.5 w-3.5" /> Atualizar
                  </Button>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        <th className="px-2 py-3">Data</th>
                        <th className="px-2 py-3">Servidor</th>
                        <th className="px-2 py-3">Usuário</th>
                        <th className="px-2 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reservations.map((reservation) => (
                        <tr
                          key={reservation.id}
                          className="border-b border-[var(--border-subtle)]"
                        >
                          <td className="px-2 py-3 font-bold">
                            {reservation.data}
                          </td>
                          <td className="px-2 py-3">{reservation.userName}</td>
                          <td className="px-2 py-3 text-[var(--text-secondary)]">
                            {reservation.username}
                          </td>
                          <td className="px-2 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() =>
                                removeReservationMutation.mutate({
                                  campaignId: selectedCampaignId,
                                  reservationId: reservation.id,
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remover
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!data.reservations.length ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-2 py-8 text-center text-[var(--text-muted)]"
                          >
                            Nenhuma reserva confirmada.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
