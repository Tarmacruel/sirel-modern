import { Plus, Trash2 } from "lucide-react";

import {
  grupoInstitucionalMembroFuncaoLabels,
  grupoInstitucionalMembroFuncaoOptions,
  type GrupoInstitucionalMembroFuncao,
} from "@sirel/shared/schemas/cadastros-institucionais";

import { Button } from "@/components/ui/button";
import { AsyncCombobox } from "@/components/ui/async-combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

export interface PessoaOption {
  id: number;
  label: string;
  subtitle?: string;
  metadata?: {
    cargoNome?: string | null;
    secretariaNome?: string | null;
  };
}

function toPessoaOption(item: Record<string, unknown>): PessoaOption {
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
      secretariaNome: metadata.secretariaNome
        ? String(metadata.secretariaNome)
        : null,
    },
  };
}

export interface GrupoMembroForm {
  pessoaId: number;
  funcao: GrupoInstitucionalMembroFuncao;
  ordem: number;
  titular: boolean;
  ativo: boolean;
  pessoaOption?: PessoaOption | null;
}

interface MembrosEditorProps {
  value: GrupoMembroForm[];
  onChange: (value: GrupoMembroForm[]) => void;
}

function createMember(ordem: number): GrupoMembroForm {
  return {
    pessoaId: 0,
    funcao: "MEMBRO",
    ordem,
    titular: true,
    ativo: true,
  };
}

export function MembrosEditor({ value, onChange }: MembrosEditorProps) {
  const utils = trpc.useUtils();
  const selectedPessoaIds = new Set(
    value.map((member) => member.pessoaId).filter((pessoaId) => pessoaId > 0),
  );

  function updateMember(index: number, patch: Partial<GrupoMembroForm>) {
    onChange(
      value.map((member, currentIndex) =>
        currentIndex === index ? { ...member, ...patch } : member,
      ),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Composicao
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Selecione pessoas existentes e defina a funcao formal.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => onChange([...value, createMember(value.length)])}
        >
          Membro
        </Button>
      </div>

      {value.length ? (
        <div className="space-y-2">
          {value.map((member, index) => (
            <div
              key={`${member.pessoaId}-${index}`}
              className="grid gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3 lg:grid-cols-[minmax(220px,1fr)_190px_90px_120px_40px]"
            >
              <AsyncCombobox<PessoaOption>
                value={member.pessoaId || null}
                initialOption={member.pessoaOption ?? null}
                onChange={(pessoa) =>
                  updateMember(index, {
                    pessoaId: pessoa?.id ?? 0,
                    pessoaOption: pessoa,
                  })
                }
                query={async (search, limit) => {
                  const result = await utils.client.cadastros.lookup.query({
                    entity: "pessoas",
                    search: search || undefined,
                    page: 1,
                    pageSize: limit,
                    excludeIds: Array.from(selectedPessoaIds).filter(
                      (pessoaId) => pessoaId !== member.pessoaId,
                    ),
                    activeOnly: true,
                  });
                  return result.items.map(toPessoaOption);
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
                placeholder="Pessoa"
                searchPlaceholder="Buscar por nome, CPF, matrícula ou cargo"
                allowClear
                ariaLabel="Pessoa do membro"
              />
              <Select
                value={member.funcao}
                onChange={(event) =>
                  updateMember(index, {
                    funcao: event.target.value as GrupoInstitucionalMembroFuncao,
                  })
                }
                aria-label="Funcao do membro"
              >
                {grupoInstitucionalMembroFuncaoOptions.map((funcao) => (
                  <option key={funcao} value={funcao}>
                    {grupoInstitucionalMembroFuncaoLabels[funcao]}
                  </option>
                ))}
              </Select>
              <Select
                value={String(member.ordem)}
                onChange={(event) =>
                  updateMember(index, { ordem: Number(event.target.value) })
                }
                aria-label="Ordem do membro"
              >
                {Array.from({ length: Math.max(8, value.length + 2) }).map(
                  (_, ordem) => (
                    <option key={ordem} value={ordem}>
                      {ordem + 1}
                    </option>
                  ),
                )}
              </Select>
              <label className="flex min-h-10 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-xs font-semibold text-[var(--text-secondary)]">
                <Checkbox
                  checked={member.titular}
                  onCheckedChange={(checked) =>
                    updateMember(index, { titular: checked })
                  }
                />
                Titular
              </label>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remover membro"
                onClick={() =>
                  onChange(value.filter((_, currentIndex) => currentIndex !== index))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-5 text-sm text-[var(--text-secondary)]">
          Nenhum membro adicionado.
        </div>
      )}
    </div>
  );
}
