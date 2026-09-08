import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Info,
  LockKeyhole,
  Settings2,
  UserRoundCheck,
} from "lucide-react";
import { Link } from "wouter";

import {
  canAddFolgaDate,
  compareDateOnly,
  dateOnlyToUtc,
  isWeekendDate,
  utcToDateOnly,
} from "@sirel/shared/folgas-rules";

import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

const WEEKDAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

function formatDateBR(value: string) {
  const date = dateOnlyToUtc(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1, 12));
  return date.toISOString().slice(0, 7);
}

function monthTitle(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

function buildMonthCells(value: string) {
  const [year, month] = value.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const last = new Date(Date.UTC(year, month, 0, 12));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const cells: Array<{ date: string; day: number; currentMonth: boolean }> = [];

  for (let i = 0; i < mondayOffset; i += 1) {
    const date = new Date(first.getTime() - (mondayOffset - i) * 86_400_000);
    cells.push({
      date: utcToDateOnly(date),
      day: date.getUTCDate(),
      currentMonth: false,
    });
  }
  for (let day = 1; day <= last.getUTCDate(); day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    cells.push({ date: utcToDateOnly(date), day, currentMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const previous = dateOnlyToUtc(cells[cells.length - 1]!.date);
    const date = new Date(previous.getTime() + 86_400_000);
    cells.push({
      date: utcToDateOnly(date),
      day: date.getUTCDate(),
      currentMonth: false,
    });
  }
  return cells;
}

function statusClass(
  kind: "available" | "occupied" | "mine" | "blocked" | "holiday",
) {
  if (kind === "available")
    return "bg-[var(--success-bg)] text-[var(--success-color)] border-[var(--success-color)]/30";
  if (kind === "occupied")
    return "bg-[var(--danger-bg)] text-[var(--danger-color)] border-[var(--danger-color)]/30";
  if (kind === "mine")
    return "bg-[var(--info-bg)] text-[var(--info-color)] border-[var(--info-color)]/40";
  if (kind === "holiday")
    return "bg-[var(--warning-bg)] text-[var(--warning-color)] border-[var(--warning-color)]/30";
  return "bg-[var(--surface-soft)] text-[var(--text-muted)] border-[var(--border-subtle)]";
}

export function FolgasPage() {
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const overviewQuery = trpc.folgas.overview.useQuery(undefined, {
    retry: false,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
  const [draftDates, setDraftDates] = useState<string[]>([]);
  const [month, setMonth] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = trpc.folgas.setMyReservations.useMutation({
    onSuccess: async (data) => {
      setDraftDates(data.dates);
      setError(null);
      setFeedback("Suas folgas foram registradas com sucesso.");
      await utils.folgas.overview.invalidate();
    },
    onError: async (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
      await utils.folgas.overview.invalidate();
    },
  });

  const data = overviewQuery.data;
  const campaign = data?.campaign ?? null;
  const currentRole = meQuery.data?.user.role;
  const canAdmin = currentRole === "admin" || currentRole === "gestor";

  useEffect(() => {
    if (!data?.campaign) return;
    setDraftDates([...data.myDates].sort(compareDateOnly));
    setMonth(
      (current) =>
        current || monthKey(data.myDates[0] ?? data.campaign!.dataInicio),
    );
  }, [data?.campaign?.id, data?.myDates.join("|")]);

  const nonWorkingMap = useMemo(
    () =>
      new Map((data?.nonWorkingDays ?? []).map((item) => [item.data, item])),
    [data?.nonWorkingDays],
  );
  const countsAsOff = useMemo(
    () =>
      new Set(
        (data?.nonWorkingDays ?? [])
          .filter((item) => item.contaComoSemExpediente)
          .map((item) => item.data),
      ),
    [data?.nonWorkingDays],
  );
  const occupiedMap = useMemo(
    () => new Map((data?.occupied ?? []).map((item) => [item.date, item])),
    [data?.occupied],
  );
  const draftSet = useMemo(() => new Set(draftDates), [draftDates]);
  const initialDates = useMemo(
    () => [...(data?.myDates ?? [])].sort(compareDateOnly),
    [data?.myDates],
  );
  const dirty =
    JSON.stringify([...draftDates].sort(compareDateOnly)) !==
    JSON.stringify(initialDates);

  const cells = useMemo(() => (month ? buildMonthCells(month) : []), [month]);
  const firstMonth = campaign ? monthKey(campaign.dataInicio) : "";
  const lastMonth = campaign ? monthKey(campaign.dataFim) : "";

  function cellState(date: string) {
    const occupied = occupiedMap.get(date);
    const nonWorking = nonWorkingMap.get(date);
    const selected = draftSet.has(date);
    const insideRange =
      campaign &&
      compareDateOnly(date, campaign.dataInicio) >= 0 &&
      compareDateOnly(date, campaign.dataFim) <= 0;

    if (!insideRange)
      return nonWorking?.contaComoSemExpediente
        ? {
            kind: "holiday" as const,
            label: nonWorking.tipo === "FERIADO" ? "Feriado" : "Sem expediente",
            disabled: true,
            reason: `${nonWorking.descricao}. Fora do período de escolha, mas considerado na regra de continuidade.`,
          }
        : {
            kind: "blocked" as const,
            label: "Fora do período",
            disabled: true,
            reason: "Data fora do período permitido.",
          };
    if (selected)
      return {
        kind: "mine" as const,
        label: "Sua folga",
        disabled: false,
        reason: "Clique para remover da sua seleção.",
      };
    if (occupied && !occupied.mine) {
      return {
        kind: "occupied" as const,
        label: "Ocupado",
        disabled: true,
        reason: occupied.userName
          ? `Data escolhida por ${occupied.userName}.`
          : "Data já escolhida por outra pessoa.",
      };
    }
    if (isWeekendDate(date))
      return {
        kind: "blocked" as const,
        label: "Fim de semana",
        disabled: true,
        reason: "Sábado ou domingo.",
      };
    if (nonWorking?.bloqueiaSelecao) {
      return {
        kind:
          nonWorking.tipo === "BLOQUEIO_ADMIN"
            ? ("blocked" as const)
            : ("holiday" as const),
        label:
          nonWorking.tipo === "FERIADO"
            ? "Feriado"
            : nonWorking.tipo === "PONTO_FACULTATIVO"
              ? "Ponto facultativo"
              : "Bloqueado",
        disabled: true,
        reason: nonWorking.descricao,
      };
    }
    if (!data?.eligible)
      return {
        kind: "blocked" as const,
        label: "Não habilitado",
        disabled: true,
        reason: "Seu usuário não está habilitado nesta campanha.",
      };
    if (!data?.open)
      return {
        kind: "blocked" as const,
        label: "Fechado",
        disabled: true,
        reason: "O período de escolha não está aberto.",
      };
    if (draftDates.length >= (data.limit ?? 0))
      return {
        kind: "blocked" as const,
        label: "Limite atingido",
        disabled: true,
        reason: `Você já selecionou ${data.limit} folga(s).`,
      };

    const check = canAddFolgaDate(
      date,
      draftDates,
      countsAsOff,
      campaign?.maxDiasConsecutivos ?? 3,
    );
    if (!check.valid) {
      return {
        kind: "blocked" as const,
        label: "Bloqueado por regra",
        disabled: true,
        reason:
          check.violations[0]?.message ??
          "A escolha formaria uma sequência de dias sem expediente acima do permitido.",
      };
    }
    return {
      kind: "available" as const,
      label: "Disponível",
      disabled: false,
      reason: "Clique para selecionar esta data.",
    };
  }

  function toggleDate(date: string) {
    const state = cellState(date);
    setFeedback(null);
    setError(null);
    if (!data?.open || !data?.eligible || saveMutation.isPending) {
      setError("A seleção não está disponível neste momento.");
      return;
    }
    if (draftSet.has(date)) {
      setDraftDates((current) => current.filter((item) => item !== date));
      return;
    }
    if (state.disabled) {
      setError(state.reason);
      return;
    }
    setDraftDates((current) => [...current, date].sort(compareDateOnly));
  }

  async function confirmSelection() {
    if (!campaign) return;
    setFeedback(null);
    setError(null);
    saveMutation.mutate({ campaignId: campaign.id, dates: draftDates });
  }

  if (overviewQuery.isLoading || meQuery.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-36" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-[620px]" />
          <Skeleton className="h-[620px]" />
        </div>
      </div>
    );
  }

  if (overviewQuery.error) {
    return (
      <SectionCard
        title="Folgas"
        description="Não foi possível carregar o módulo de folgas."
      >
        <div className="rounded-[20px] border border-[var(--danger-color)]/30 bg-[var(--danger-bg)] p-4 text-sm text-[var(--danger-color)]">
          {overviewQuery.error.message}
        </div>
      </SectionCard>
    );
  }

  if (!campaign) {
    return (
      <SectionCard
        title="Folgas"
        description="Gestão das folgas compensatórias do Sete de Setembro."
      >
        <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-6">
          <div className="flex items-start gap-4">
            <CalendarDays className="mt-1 h-7 w-7 text-[var(--accent-color)]" />
            <div>
              <h2 className="text-lg font-black text-[var(--text-primary)]">
                Nenhuma campanha configurada
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                Um gestor precisa criar a campanha, definir o período,
                participantes, feriados e pontos facultativos antes da abertura.
              </p>
              {canAdmin ? (
                <Link
                  href="/folgas/admin"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent-color)]"
                >
                  <Settings2 className="h-4 w-4" /> Configurar folgas
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[var(--border-soft-contrast)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)] md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent-color)]">
              <CalendarCheck2 className="h-4 w-4" /> SIREL Folgas
            </div>
            <h1 className="mt-2 font-[var(--font-heading)] text-3xl font-black tracking-[-0.04em] text-[var(--text-primary)]">
              {campaign.nome}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
              Escolha suas datas. O sistema impede automaticamente colisões e
              combinações que resultem em mais de {campaign.maxDiasConsecutivos}{" "}
              dias consecutivos sem expediente.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold",
                data?.open
                  ? "border-[var(--success-color)]/30 bg-[var(--success-bg)] text-[var(--success-color)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-muted)]",
              ].join(" ")}
            >
              <span
                className={[
                  "h-2 w-2 rounded-full",
                  data?.open ? "bg-emerald-500" : "bg-slate-400",
                ].join(" ")}
              />
              {data?.open ? "Período aberto" : "Período fechado"}
            </span>
            {canAdmin ? (
              <Link href="/folgas/admin">
                <Button variant="outline" className="gap-2">
                  <Settings2 className="h-4 w-4" /> Administração
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {feedback ? (
        <div className="rounded-[18px] border border-[var(--success-color)]/30 bg-[var(--success-bg)] px-4 py-3 text-sm font-medium text-[var(--success-color)]">
          {feedback}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start gap-3 rounded-[18px] border border-[var(--danger-color)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm font-medium text-[var(--danger-color)]">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-4 md:px-5">
            <Button
              variant="outline"
              size="icon"
              aria-label="Mês anterior"
              disabled={!month || month <= firstMonth}
              onClick={() => setMonth((current) => shiftMonth(current, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-black capitalize text-[var(--text-primary)]">
              {month ? monthTitle(month) : "Calendário"}
            </h2>
            <Button
              variant="outline"
              size="icon"
              aria-label="Próximo mês"
              disabled={!month || month >= lastMonth}
              onClick={() => setMonth((current) => shiftMonth(current, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 border-b border-[var(--border-subtle)] bg-[var(--surface-soft)]">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="px-1 py-3 text-center text-[10px] font-black tracking-[0.16em] text-[var(--text-muted)] md:text-xs"
              >
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const state = cellState(cell.date);
              return (
                <button
                  type="button"
                  key={cell.date}
                  onClick={() => toggleDate(cell.date)}
                  title={state.reason}
                  aria-label={`${cell.date}: ${state.label}. ${state.reason}`}
                  aria-pressed={draftSet.has(cell.date)}
                  aria-disabled={
                    state.disabled || !data?.open || saveMutation.isPending
                  }
                  className={[
                    "group min-h-[92px] border-b border-r border-[var(--border-subtle)] p-1.5 text-left transition md:min-h-[112px] md:p-2.5",
                    !cell.currentMonth
                      ? "bg-[var(--surface-soft)] opacity-45"
                      : "bg-[var(--surface-card)]",
                    !state.disabled || draftSet.has(cell.date)
                      ? "hover:bg-[var(--surface-highlight)]"
                      : "cursor-not-allowed",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-xs font-black text-[var(--text-primary)] md:text-sm">
                      {cell.day}
                    </span>
                    {draftSet.has(cell.date) ? (
                      <UserRoundCheck className="h-3.5 w-3.5 text-[var(--info-color)]" />
                    ) : null}
                  </div>
                  <span
                    className={[
                      "mt-2 inline-flex max-w-full items-center rounded-full border px-1.5 py-1 text-[9px] font-bold leading-tight md:px-2 md:text-[10px]",
                      statusClass(state.kind),
                    ].join(" ")}
                  >
                    <span className="truncate">{state.label}</span>
                  </span>
                  {state.kind === "holiday" &&
                  nonWorkingMap.get(cell.date)?.descricao ? (
                    <p className="mt-1 hidden truncate text-[9px] text-[var(--warning-color)] md:block">
                      {nonWorkingMap.get(cell.date)?.descricao}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="space-y-3 border-t border-[var(--border-subtle)] px-4 py-4 md:px-5">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{" "}
                Disponível
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Ocupado
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Sua folga
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-slate-400" />{" "}
                Bloqueado
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Feriado
                / ponto facultativo
              </span>
            </div>
            <div className="flex items-start gap-2 text-xs leading-5 text-[var(--text-muted)]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              As datas ficam reservadas após a confirmação. Toque em uma data
              bloqueada para consultar o motivo.
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <SectionCard
            title="Suas folgas"
            description={`${draftDates.length} de ${data?.limit ?? 0} selecionada(s)`}
          >
            <div className="space-y-2">
              {draftDates.length ? (
                draftDates.map((date, index) => (
                  <button
                    type="button"
                    key={date}
                    onClick={() => toggleDate(date)}
                    className="flex w-full items-center gap-3 rounded-[18px] border border-[var(--info-color)]/30 bg-[var(--info-bg)] px-3 py-3 text-left transition hover:border-sky-300"
                  >
                    <CalendarCheck2 className="h-5 w-5 shrink-0 text-[var(--info-color)]" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--info-color)]">
                        {index + 1}ª folga
                      </p>
                      <p className="mt-0.5 truncate text-sm font-bold text-[var(--text-primary)]">
                        {formatDateBR(date)}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-[var(--border-strong)] p-4 text-sm text-[var(--text-secondary)]">
                  Nenhuma data selecionada. Clique em uma data disponível no
                  calendário.
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Regras para escolha"
            description="Aplicadas automaticamente em cada confirmação."
          >
            <div className="space-y-3 text-sm leading-5 text-[var(--text-secondary)]">
              <div className="flex gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-color)] text-xs font-black text-white">
                  1
                </span>
                <p>
                  Não pode resultar em {campaign.maxDiasConsecutivos + 1} ou
                  mais dias consecutivos sem expediente, considerando folgas,
                  sábados, domingos, feriados e pontos facultativos.
                </p>
              </div>
              <div className="flex gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-color)] text-xs font-black text-white">
                  2
                </span>
                <p>
                  Uma mesma data não pode ser utilizada por mais de uma pessoa.
                </p>
              </div>
              <div className="flex gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-color)] text-xs font-black text-white">
                  3
                </span>
                <p>
                  Feriados e pontos facultativos não podem ser emendados de
                  forma a prolongar o descanso para{" "}
                  {campaign.maxDiasConsecutivos + 1} dias ou mais.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Período"
            description="Datas configuradas para esta campanha."
          >
            <div className="space-y-2 text-sm text-[var(--text-secondary)]">
              <p>
                <strong className="text-[var(--text-primary)]">Folgas:</strong>{" "}
                {formatDateBR(campaign.dataInicio)} a{" "}
                {formatDateBR(campaign.dataFim)}
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">
                  Situação:
                </strong>{" "}
                {campaign.status}
              </p>
              {!data?.eligible ? (
                <div className="mt-3 flex gap-2 rounded-[16px] border border-[var(--warning-color)]/30 bg-[var(--warning-bg)] p-3 text-[var(--warning-color)]">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> Seu
                  usuário ainda não foi incluído entre os participantes.
                </div>
              ) : null}
            </div>
          </SectionCard>
        </aside>
      </div>

      <div className="sticky bottom-3 z-20 flex justify-end">
        <Button
          size="lg"
          className="min-w-[230px] gap-2 shadow-[var(--shadow-floating)]"
          disabled={
            !dirty || saveMutation.isPending || !data?.eligible || !data?.open
          }
          onClick={confirmSelection}
        >
          <CalendarCheck2 className="h-4 w-4" />
          {saveMutation.isPending
            ? "Confirmando..."
            : "Confirmar minhas folgas"}
        </Button>
      </div>
    </div>
  );
}
