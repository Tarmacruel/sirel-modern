import { Plus, Trash2 } from "lucide-react";

import {
  grupoInstitucionalMembroFuncaoLabels,
  grupoInstitucionalMembroFuncaoOptions,
  type GrupoInstitucionalMembroFuncao,
} from "@sirel/shared/schemas/cadastros-institucionais";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";

export interface PessoaOption {
  id: number;
  nome: string;
  cargo: string | null;
  secretariaId?: number | null;
}

export interface GrupoMembroForm {
  pessoaId: number;
  funcao: GrupoInstitucionalMembroFuncao;
  ordem: number;
  titular: boolean;
  ativo: boolean;
}

interface MembrosEditorProps {
  pessoas: PessoaOption[];
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

export function MembrosEditor({ pessoas, value, onChange }: MembrosEditorProps) {
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
              <Select
                value={member.pessoaId ? String(member.pessoaId) : ""}
                onChange={(event) =>
                  updateMember(index, {
                    pessoaId: Number(event.target.value || 0),
                  })
                }
                aria-label="Pessoa do membro"
              >
                <option value="">Pessoa</option>
                {pessoas.map((pessoa) => (
                  <option
                    key={pessoa.id}
                    value={pessoa.id}
                    disabled={
                      selectedPessoaIds.has(pessoa.id) &&
                      pessoa.id !== member.pessoaId
                    }
                  >
                    {pessoa.nome}
                    {pessoa.cargo ? ` - ${pessoa.cargo}` : ""}
                  </option>
                ))}
              </Select>
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
