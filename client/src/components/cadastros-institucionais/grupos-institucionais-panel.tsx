import { FileText, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  type GrupoInstitucionalSaveInput,
  type GrupoInstitucionalTipo,
} from "@sirel/shared/schemas/cadastros-institucionais";

import {
  MembrosEditor,
  type GrupoMembroForm,
  type PessoaOption,
} from "./membros-editor";
import { Alert } from "@/components/ui/alert";
import { AsyncCombobox } from "@/components/ui/async-combobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

interface GruposInstitucionaisPanelProps {
  tipo: GrupoInstitucionalTipo;
  title: string;
  emptyLabel: string;
}

interface GrupoFormState {
  id?: number;
  nome: string;
  sigla: string;
  secretariaId: string;
  atoDesignacaoId: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  versao: string;
  substituiGrupoId: string;
  observacao: string;
  ativo: boolean;
  membros: GrupoMembroForm[];
  secretariaOption: SecretariaOption | null;
}

interface SecretariaOption {
  id: number;
  label: string;
  subtitle?: string;
  metadata?: { sigla?: string | null };
}

function toSecretariaOption(
  item: Record<string, unknown>,
): SecretariaOption {
  const metadata =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : {};
  return {
    id: Number(item.id),
    label: String(item.label ?? ""),
    subtitle: item.subtitle ? String(item.subtitle) : undefined,
    metadata: {
      sigla: metadata.sigla ? String(metadata.sigla) : null,
    },
  };
}

function createGrupoFormState(): GrupoFormState {
  return {
    nome: "",
    sigla: "",
    secretariaId: "",
    atoDesignacaoId: "",
    vigenciaInicio: "",
    vigenciaFim: "",
    versao: "1",
    substituiGrupoId: "",
    observacao: "",
    ativo: true,
    membros: [],
    secretariaOption: null,
  };
}

function toDateInput(value: unknown) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

export function GruposInstitucionaisPanel({
  tipo,
  title,
  emptyLabel,
}: GruposInstitucionaisPanelProps) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<GrupoFormState>(() => createGrupoFormState());
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const atosQuery = trpc.cadastrosInstitucionais.atos.list.useQuery(
    { ativo: true, page: 1, pageSize: 100 },
    { retry: false },
  );
  const listProcedure =
    tipo === "COMISSAO_CONTRATACAO"
      ? trpc.cadastrosInstitucionais.comissoes.list
      : trpc.cadastrosInstitucionais.equipesApoio.list;
  const saveProcedure =
    tipo === "COMISSAO_CONTRATACAO"
      ? trpc.cadastrosInstitucionais.comissoes.save
      : trpc.cadastrosInstitucionais.equipesApoio.save;
  const inactivateProcedure =
    tipo === "COMISSAO_CONTRATACAO"
      ? trpc.cadastrosInstitucionais.comissoes.inactivate
      : trpc.cadastrosInstitucionais.equipesApoio.inactivate;

  const listQuery = listProcedure.useQuery(
    {
      search: search.trim() || undefined,
      ativo: undefined,
      somenteVigentes: false,
      page: 1,
      pageSize: 50,
    },
    { retry: false, placeholderData: (previous) => previous },
  );
  const saveMutation = saveProcedure.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.cadastrosInstitucionais.comissoes.list.invalidate(),
        utils.cadastrosInstitucionais.equipesApoio.list.invalidate(),
        utils.cadastrosInstitucionais.designacoes.availableForProcess.invalidate(),
      ]);
      setForm(createGrupoFormState());
      setEditing(false);
      setFeedback(`${title} salvo.`);
      setError(null);
    },
    onError: (cause) => setError(cause.message),
  });
  const inactivateMutation = inactivateProcedure.useMutation({
    onSuccess: async () => {
      await listQuery.refetch();
      setFeedback(`${title} inativado.`);
    },
    onError: (cause) => setError(cause.message),
  });

  const atos = atosQuery.data?.items ?? [];
  const rows = listQuery.data?.items ?? [];
  const validMembers = useMemo(
    () => form.membros.filter((member) => member.pessoaId > 0),
    [form.membros],
  );
  const hasDuplicateMembers = useMemo(() => {
    const selectedIds = validMembers.map((member) => member.pessoaId);
    return new Set(selectedIds).size !== selectedIds.length;
  }, [validMembers]);

  function patch(patchValue: Partial<GrupoFormState>) {
    setForm((current) => ({ ...current, ...patchValue }));
  }

  function edit(row: any) {
    setForm({
      id: row.id,
      nome: row.nome ?? "",
      sigla: row.sigla ?? "",
      secretariaId: row.secretariaId ? String(row.secretariaId) : "",
      atoDesignacaoId: row.atoDesignacaoId ? String(row.atoDesignacaoId) : "",
      vigenciaInicio: toDateInput(row.vigenciaInicio),
      vigenciaFim: toDateInput(row.vigenciaFim),
      versao: String(row.versao ?? 1),
      substituiGrupoId: row.substituiGrupoId ? String(row.substituiGrupoId) : "",
      observacao: row.observacao ?? "",
      ativo: Boolean(row.ativo),
      membros: (row.membros ?? []).map((member: any, index: number) => ({
        pessoaId: Number(member.pessoaId),
        pessoaOption: {
          id: Number(member.pessoaId),
          label: member.pessoaNome ?? `Pessoa #${member.pessoaId}`,
          metadata: {
            cargoNome: member.pessoaCargo ?? null,
          },
        } satisfies PessoaOption,
        funcao: member.funcao,
        ordem: Number(member.ordem ?? index),
        titular: Boolean(member.titular),
        ativo: member.ativo !== false,
      })),
      secretariaOption: row.secretariaId
        ? {
            id: Number(row.secretariaId),
            label:
              row.secretariaNome ?? `Secretaria #${row.secretariaId}`,
            subtitle: row.secretariaSigla ?? undefined,
            metadata: { sigla: row.secretariaSigla ?? null },
          }
        : null,
    });
    setEditing(true);
    setFeedback(null);
    setError(null);
  }

  async function save() {
    if (!form.nome.trim() || !form.atoDesignacaoId || !validMembers.length) {
      setError("Informe nome, ato e ao menos um membro.");
      return;
    }
    if (hasDuplicateMembers) {
      setError("A mesma pessoa nao pode aparecer mais de uma vez na composicao.");
      return;
    }
    const payload: GrupoInstitucionalSaveInput = {
      id: form.id,
      tipo,
      nome: form.nome.trim(),
      sigla: form.sigla.trim(),
      secretariaId: form.secretariaId ? Number(form.secretariaId) : null,
      atoDesignacaoId: Number(form.atoDesignacaoId),
      vigenciaInicio: form.vigenciaInicio,
      vigenciaFim: form.vigenciaFim,
      versao: Number(form.versao || 1),
      substituiGrupoId: form.substituiGrupoId
        ? Number(form.substituiGrupoId)
        : null,
      observacao: form.observacao.trim(),
      ativo: form.ativo,
      membros: validMembers.map((member) => ({
        pessoaId: member.pessoaId,
        funcao: member.funcao,
        ordem: member.ordem,
        titular: member.titular,
        ativo: member.ativo,
      })),
    };
    await saveMutation.mutateAsync(payload);
  }

  return (
    <div className="space-y-4">
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card
        title={editing ? `Editar ${title}` : `Novo ${title}`}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            icon={<RefreshCcw className="h-4 w-4" />}
            onClick={() => {
              setForm(createGrupoFormState());
              setEditing(false);
            }}
          >
            Limpar
          </Button>
        }
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_150px_220px_220px]">
          <FormField label="Nome">
            <Input
              value={form.nome}
              onChange={(event) => patch({ nome: event.target.value })}
            />
          </FormField>
          <FormField label="Sigla">
            <Input
              value={form.sigla}
              onChange={(event) => patch({ sigla: event.target.value })}
            />
          </FormField>
          <FormField label="Secretaria ou escopo">
            <AsyncCombobox<SecretariaOption>
              value={form.secretariaId ? Number(form.secretariaId) : null}
              initialOption={form.secretariaOption}
              onChange={(secretaria) =>
                patch({
                  secretariaId: secretaria ? String(secretaria.id) : "",
                  secretariaOption: secretaria,
                })
              }
              query={async (search, limit) => {
                const result = await utils.client.cadastros.lookup.query({
                  entity: "secretarias",
                  search: search || undefined,
                  page: 1,
                  pageSize: limit,
                  activeOnly: true,
                });
                return result.items.map(toSecretariaOption);
              }}
              getOptionValue={(secretaria) => secretaria.id}
              getOptionLabel={(secretaria) =>
                [secretaria.metadata?.sigla ?? secretaria.subtitle, secretaria.label]
                  .filter(Boolean)
                  .join(" - ")
              }
              placeholder="Geral (sem secretaria)"
              searchPlaceholder="Buscar secretaria por nome ou sigla"
              allowClear
              ariaLabel="Secretaria ou escopo"
            />
          </FormField>
          <FormField label="Ato de designacao">
            <Select
              value={form.atoDesignacaoId}
              onChange={(event) =>
                patch({ atoDesignacaoId: event.target.value })
              }
            >
              <option value="">Selecione</option>
              {atos.map((ato) => (
                <option key={ato.id} value={ato.id}>
                  {ato.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[160px_160px_120px_1fr]">
          <FormField label="Vigencia inicio">
            <Input
              type="date"
              value={form.vigenciaInicio}
              onChange={(event) => patch({ vigenciaInicio: event.target.value })}
            />
          </FormField>
          <FormField label="Vigencia fim">
            <Input
              type="date"
              value={form.vigenciaFim}
              onChange={(event) => patch({ vigenciaFim: event.target.value })}
            />
          </FormField>
          <FormField label="Versao">
            <Input
              type="number"
              value={form.versao}
              onChange={(event) => patch({ versao: event.target.value })}
            />
          </FormField>
          <FormField label="Observacao">
            <Textarea
              rows={2}
              value={form.observacao}
              onChange={(event) => patch({ observacao: event.target.value })}
            />
          </FormField>
        </div>

        <div className="mt-4">
          <MembrosEditor
            value={form.membros}
            onChange={(membros) => patch({ membros })}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <Checkbox
              checked={form.ativo}
              onCheckedChange={(checked) => patch({ ativo: checked })}
            />
            Ativo
          </label>
          <Button
            type="button"
            onClick={() => void save()}
            loading={saveMutation.isPending}
            icon={<Plus className="h-4 w-4" />}
          >
            Salvar {title}
          </Button>
        </div>
      </Card>

      <Card
        title={`${title}s cadastrados`}
        action={
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar"
              className="h-9 w-56"
            />
          </div>
        }
      >
        {listQuery.isLoading ? (
          <div className="text-sm text-[var(--text-secondary)]">
            Carregando...
          </div>
        ) : rows.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">
                      {row.nome}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {row.sigla ? `${row.sigla} | ` : ""}
                      {row.ato?.label ?? "Ato nao informado"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {row.membros?.length ?? 0} membro(s)
                      {row.secretariaNome ? ` | ${row.secretariaNome}` : " | escopo geral"}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                    {row.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.ato?.arquivoUrl ? (
                    <a href={row.ato.arquivoUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" icon={<FileText className="h-4 w-4" />}>
                        Ver ato
                      </Button>
                    </a>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Pencil className="h-4 w-4" />}
                    onClick={() => edit(row)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    icon={<Trash2 className="h-4 w-4" />}
                    loading={inactivateMutation.isPending}
                    onClick={() => void inactivateMutation.mutateAsync({ id: row.id })}
                  >
                    Inativar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-8 text-sm text-[var(--text-secondary)]">
            {emptyLabel}
          </div>
        )}
      </Card>
    </div>
  );
}
