import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/shared/section-card";

export function FolgasPeopleAdmin({
  campaignId,
  open,
}: {
  campaignId: number;
  open: boolean;
}) {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const isAdmin = me.data?.user.role === "admin";
  const [search, setSearch] = useState("");
  const [newPerson, setNewPerson] = useState({
    nome: "",
    cpf: "",
    matricula: "",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const people = trpc.folgas.adminSearchPeople.useQuery(
    { search },
    { enabled: isAdmin && search.trim().length >= 2 },
  );
  const dashboard = trpc.folgas.adminDashboard.useQuery({ campaignId });
  const [participantId, setParticipantId] = useState("");
  const [dates, setDates] = useState("");
  const refresh = async () => {
    setError("");
    await Promise.all([
      utils.folgas.adminDashboard.invalidate(),
      utils.folgas.overview.invalidate(),
      utils.folgas.adminSearchPeople.invalidate(),
    ]);
  };
  const participant = trpc.folgas.adminSetParticipant.useMutation({
    onSuccess: refresh,
    onError: (e) => setError(e.message),
  });
  const create = trpc.folgas.adminCreatePerson.useMutation({
    onSuccess: async () => {
      setSearch(newPerson.nome);
      setCreating(false);
      setNewPerson({ nome: "", cpf: "", matricula: "" });
      await refresh();
    },
    onError: (e) => setError(e.message),
  });
  const reserve = trpc.folgas.adminSetReservations.useMutation({
    onSuccess: refresh,
    onError: (e) => setError(e.message),
  });
  if (!isAdmin) return null;
  return (
    <SectionCard
      title="Pessoas da Licitação"
      description="Inclua pessoas do cadastro do SIREL. Para quem não tem conta, o administrador registra as folgas abaixo."
    >
      {error && (
        <p role="alert" className="mb-3 text-sm text-[var(--danger-color)]">
          {error}
        </p>
      )}
      <Input
        aria-label="Pesquisar pessoa"
        placeholder="Pesquisar pelo nome (mínimo 2 letras)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="my-3 space-y-2">
        {people.data?.map((p) => {
          const included = dashboard.data?.participants.some(
            (x) => x.pessoaId === p.id && x.ativo,
          );
          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-2"
            >
              <span className="min-w-0 break-words text-sm">{p.nome}</span>
              <Button
                size="sm"
                disabled={included || open || participant.isPending}
                onClick={() =>
                  participant.mutate({
                    campaignId,
                    pessoaId: p.id,
                    ativo: true,
                  })
                }
              >
                {included ? "Incluída" : "Incluir pessoa"}
              </Button>
            </div>
          );
        })}
      </div>
      {people.error && <p role="alert">{people.error.message}</p>}
      {search.trim().length >= 2 &&
        !people.isFetching &&
        people.data?.length === 0 && (
          <p className="my-3 text-sm">Nenhuma pessoa encontrada.</p>
        )}
      <Button
        variant="outline"
        disabled={open}
        onClick={() => {
          setCreating(!creating);
          setNewPerson((p) => ({ ...p, nome: search }));
        }}
      >
        Cadastrar nova pessoa
      </Button>
      {creating && (
        <form
          className="mt-4 grid gap-3 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(newPerson);
          }}
        >
          <label className="text-sm">
            Nome
            <Input
              required
              minLength={3}
              value={newPerson.nome}
              onChange={(e) =>
                setNewPerson((p) => ({ ...p, nome: e.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            CPF (opcional)
            <Input
              value={newPerson.cpf}
              onChange={(e) =>
                setNewPerson((p) => ({ ...p, cpf: e.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            Matrícula (opcional)
            <Input
              value={newPerson.matricula}
              onChange={(e) =>
                setNewPerson((p) => ({ ...p, matricula: e.target.value }))
              }
            />
          </label>
          <Button type="submit" disabled={create.isPending}>
            Salvar no cadastro de pessoas
          </Button>
        </form>
      )}
      <div className="mt-5 space-y-2">
        {dashboard.data?.participants
          .filter((p) => p.pessoaId)
          .map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-2"
            >
              <span className="min-w-0 break-words text-sm">
                {p.userName}
                {!p.userId ? " · sem conta" : ""}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={open || participant.isPending}
                onClick={() =>
                  participant.mutate({
                    campaignId,
                    pessoaId: p.pessoaId!,
                    ativo: !p.ativo,
                    limiteFolgas: p.limiteFolgas,
                  })
                }
              >
                {p.ativo ? "Retirar da campanha" : "Reincluir"}
              </Button>
            </div>
          ))}
      </div>
      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          reserve.mutate({
            campaignId,
            participantId: Number(participantId),
            dates: dates
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean),
          });
        }}
      >
        <h3 className="font-bold">Registrar folgas para um participante</h3>
        <label className="block text-sm">
          Participante
          <select
            required
            aria-label="Participante para reserva administrativa"
            className="mt-1 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3"
            value={participantId}
            onChange={(e) => {
              setParticipantId(e.target.value);
              setDates(
                dashboard.data?.reservations
                  .filter((r) => r.participantId === Number(e.target.value))
                  .map((r) => r.data)
                  .join(", ") ?? "",
              );
            }}
          >
            <option value="">Selecione</option>
            {dashboard.data?.participants
              .filter((p) => p.ativo)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.userName}
                </option>
              ))}
          </select>
        </label>
        <label className="block text-sm">
          Datas (AAAA-MM-DD, separadas por vírgula)
          <Input
            placeholder="2026-09-16, 2026-09-23"
            value={dates}
            onChange={(e) => setDates(e.target.value)}
          />
        </label>
        <p className="text-xs text-[var(--text-secondary)]">
          O conjunto informado substitui as folgas desse participante. Deixe
          vazio para remover todas. Valem o período de escolha e as mesmas
          regras do calendário.
        </p>
        <Button
          type="submit"
          disabled={!open || !participantId || reserve.isPending}
        >
          Confirmar folgas do participante
        </Button>
      </form>
    </SectionCard>
  );
}
