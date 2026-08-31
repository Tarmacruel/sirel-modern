import { FileText, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ordenadorTipoVinculoLabels,
  ordenadorTipoVinculoOptions,
  type OrdenadorDespesaSaveInput,
  type OrdenadorTipoVinculo,
} from "@sirel/shared/schemas/cadastros-institucionais";

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

interface OrdenadorFormState {
  id?: number;
  pessoaId: string;
  secretariaIds: number[];
  atoDesignacaoId: string;
  tipoVinculo: OrdenadorTipoVinculo;
  vigenciaInicio: string;
  vigenciaFim: string;
  versao: string;
  observacao: string;
  ativo: boolean;
  pessoaOption: PessoaLookupOption | null;
  secretariaOptions: SecretariaLookupOption[];
}

interface PessoaLookupOption {
  id: number;
  label: string;
  subtitle?: string;
  metadata?: { cargoNome?: string | null };
}

interface SecretariaLookupOption {
  id: number;
  label: string;
  subtitle?: string;
  metadata?: { sigla?: string | null };
}

function toPessoaLookupOption(
  item: Record<string, unknown>,
): PessoaLookupOption {
  const metadata =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : {};
  return {
    id: Number(item.id),
    label: String(item.label ?? ""),
    subtitle: item.subtitle ? String(item.subtitle) : undefined,
    metadata: {
      cargoNome: metadata.cargoNome ? String(metadata.cargoNome) : null,
    },
  };
}

function toSecretariaLookupOption(
  item: Record<string, unknown>,
): SecretariaLookupOption {
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

function createOrdenadorFormState(): OrdenadorFormState {
  return {
    pessoaId: "",
    secretariaIds: [],
    atoDesignacaoId: "",
    tipoVinculo: "TITULAR",
    vigenciaInicio: "",
    vigenciaFim: "",
    versao: "1",
    observacao: "",
    ativo: true,
    pessoaOption: null,
    secretariaOptions: [],
  };
}

function toDateInput(value: unknown) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

export function OrdenadoresPanel() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<OrdenadorFormState>(() =>
    createOrdenadorFormState(),
  );
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const atosQuery = trpc.cadastrosInstitucionais.atos.list.useQuery(
    { ativo: true, page: 1, pageSize: 100 },
    { retry: false },
  );
  const listQuery = trpc.cadastrosInstitucionais.ordenadores.list.useQuery(
    {
      search: search.trim() || undefined,
      ativo: undefined,
      somenteVigentes: false,
      page: 1,
      pageSize: 50,
    },
    { retry: false, placeholderData: (previous) => previous },
  );
  const saveMutation = trpc.cadastrosInstitucionais.ordenadores.save.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.cadastrosInstitucionais.ordenadores.list.invalidate(),
        utils.cadastrosInstitucionais.designacoes.availableForProcess.invalidate(),
      ]);
      setForm(createOrdenadorFormState());
      setEditing(false);
      setFeedback("Ordenador salvo.");
      setError(null);
    },
    onError: (cause) => setError(cause.message),
  });
  const inactivateMutation =
    trpc.cadastrosInstitucionais.ordenadores.inactivate.useMutation({
      onSuccess: async () => {
        await listQuery.refetch();
        setFeedback("Ordenador inativado.");
      },
      onError: (cause) => setError(cause.message),
    });

  const atos = atosQuery.data?.items ?? [];
  const rows = listQuery.data?.items ?? [];
  const selectedSecretarias = useMemo(
    () => new Set(form.secretariaIds),
    [form.secretariaIds],
  );

  function patch(patchValue: Partial<OrdenadorFormState>) {
    setForm((current) => ({ ...current, ...patchValue }));
  }

  function addSecretaria(secretaria: SecretariaLookupOption | null) {
    if (!secretaria || selectedSecretarias.has(secretaria.id)) return;
    patch({
      secretariaIds: [...form.secretariaIds, secretaria.id],
      secretariaOptions: [...form.secretariaOptions, secretaria],
    });
  }

  function removeSecretaria(secretariaId: number) {
    patch({
      secretariaIds: form.secretariaIds.filter((id) => id !== secretariaId),
      secretariaOptions: form.secretariaOptions.filter(
        (secretaria) => secretaria.id !== secretariaId,
      ),
    });
  }

  function edit(row: any) {
    setForm({
      id: row.id,
      pessoaId: row.pessoaId ? String(row.pessoaId) : "",
      secretariaIds: (row.secretarias ?? []).map((item: any) =>
        Number(item.secretariaId),
      ),
      atoDesignacaoId: row.atoDesignacaoId ? String(row.atoDesignacaoId) : "",
      tipoVinculo: row.tipoVinculo,
      vigenciaInicio: toDateInput(row.vigenciaInicio),
      vigenciaFim: toDateInput(row.vigenciaFim),
      versao: String(row.versao ?? 1),
      observacao: row.observacao ?? "",
      ativo: Boolean(row.ativo),
      pessoaOption: row.pessoaId
        ? {
            id: Number(row.pessoaId),
            label:
              row.pessoa?.nome ??
              row.pessoaNome ??
              `Pessoa #${row.pessoaId}`,
            metadata: {
              cargoNome: row.pessoa?.cargo ?? row.pessoaCargo ?? null,
            },
          }
        : null,
      secretariaOptions: (row.secretarias ?? []).map((item: any) => ({
        id: Number(item.secretariaId),
        label:
          item.secretariaNome ?? `Secretaria #${item.secretariaId}`,
        subtitle: item.secretariaSigla ?? undefined,
        metadata: { sigla: item.secretariaSigla ?? null },
      })),
    });
    setEditing(true);
    setFeedback(null);
    setError(null);
  }

  async function save() {
    if (!form.pessoaId || !form.atoDesignacaoId || !form.secretariaIds.length) {
      setError("Informe pessoa, ato e ao menos uma secretaria.");
      return;
    }
    const payload: OrdenadorDespesaSaveInput = {
      id: form.id,
      pessoaId: Number(form.pessoaId),
      secretariaIds: form.secretariaIds,
      atoDesignacaoId: Number(form.atoDesignacaoId),
      tipoVinculo: form.tipoVinculo,
      vigenciaInicio: form.vigenciaInicio,
      vigenciaFim: form.vigenciaFim,
      versao: Number(form.versao || 1),
      observacao: form.observacao.trim(),
      ativo: form.ativo,
    };
    await saveMutation.mutateAsync(payload);
  }

  return (
    <div className="space-y-4">
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card
        title={editing ? "Editar Ordenador" : "Novo Ordenador"}
        action={
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCcw className="h-4 w-4" />}
            onClick={() => {
              setForm(createOrdenadorFormState());
              setEditing(false);
            }}
          >
            Limpar
          </Button>
        }
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_170px]">
          <FormField label="Pessoa">
            <AsyncCombobox<PessoaLookupOption>
              value={form.pessoaId ? Number(form.pessoaId) : null}
              initialOption={form.pessoaOption}
              onChange={(pessoa) =>
                patch({
                  pessoaId: pessoa ? String(pessoa.id) : "",
                  pessoaOption: pessoa,
                })
              }
              query={async (search, limit) => {
                const result = await utils.client.cadastros.lookup.query({
                  entity: "pessoas",
                  search: search || undefined,
                  page: 1,
                  pageSize: limit,
                  activeOnly: true,
                });
                return result.items.map(toPessoaLookupOption);
              }}
              getOptionValue={(pessoa) => pessoa.id}
              getOptionLabel={(pessoa) => pessoa.label}
              renderOption={(pessoa) => (
                <span className="min-w-0">
                  <span className="block truncate">{pessoa.label}</span>
                  {pessoa.metadata?.cargoNome || pessoa.subtitle ? (
                    <span className="block truncate text-xs font-normal text-[var(--text-secondary)]">
                      {pessoa.metadata?.cargoNome ?? pessoa.subtitle}
                    </span>
                  ) : null}
                </span>
              )}
              placeholder="Selecione a pessoa"
              searchPlaceholder="Buscar por nome, CPF, matrícula ou cargo"
              allowClear
              ariaLabel="Pessoa do ordenador"
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
          <FormField label="Tipo de vinculo">
            <Select
              value={form.tipoVinculo}
              onChange={(event) =>
                patch({ tipoVinculo: event.target.value as OrdenadorTipoVinculo })
              }
            >
              {ordenadorTipoVinculoOptions.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ordenadorTipoVinculoLabels[tipo]}
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

        <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Secretarias abrangidas
          </p>
          <div className="mt-3 max-w-xl">
            <AsyncCombobox<SecretariaLookupOption>
              value={null}
              initialOption={null}
              onChange={addSecretaria}
              query={async (search, limit) => {
                const result = await utils.client.cadastros.lookup.query({
                  entity: "secretarias",
                  search: search || undefined,
                  page: 1,
                  pageSize: limit,
                  excludeIds: form.secretariaIds,
                  activeOnly: true,
                });
                return result.items.map(toSecretariaLookupOption);
              }}
              getOptionValue={(secretaria) => secretaria.id}
              getOptionLabel={(secretaria) =>
                [secretaria.metadata?.sigla ?? secretaria.subtitle, secretaria.label]
                  .filter(Boolean)
                  .join(" - ")
              }
              placeholder="Adicionar secretaria"
              searchPlaceholder="Buscar secretaria por nome ou sigla"
              ariaLabel="Adicionar secretaria abrangida"
            />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {form.secretariaOptions.map((secretaria) => (
              <div
                key={secretaria.id}
                className="flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-secondary)]"
              >
                <span className="min-w-0 truncate">
                  {[
                    secretaria.metadata?.sigla ?? secretaria.subtitle,
                    secretaria.label,
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Remover ${secretaria.label}`}
                  onClick={() => removeSecretaria(secretaria.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {!form.secretariaOptions.length ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Nenhuma secretaria selecionada.
              </p>
            ) : null}
          </div>
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
            onClick={() => void save()}
            loading={saveMutation.isPending}
            icon={<Plus className="h-4 w-4" />}
          >
            Salvar ordenador
          </Button>
        </div>
      </Card>

      <Card
        title="Ordenadores cadastrados"
        action={
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar"
            className="h-9 w-56"
          />
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
                      {row.pessoa?.nome ?? row.pessoaNome}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {ordenadorTipoVinculoLabels[row.tipoVinculo as OrdenadorTipoVinculo]} |{" "}
                      {row.ato?.label ?? "Ato nao informado"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Versao {row.versao ?? 1}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {(row.secretarias ?? [])
                        .map((item: any) => item.secretariaSigla ?? item.secretariaNome)
                        .filter(Boolean)
                        .join(", ") || "Sem secretaria"}
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
            Nenhum ordenador cadastrado.
          </div>
        )}
      </Card>
    </div>
  );
}
