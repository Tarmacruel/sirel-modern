import { Upload } from "lucide-react";

import {
  atoDesignacaoTipoLabels,
  atoDesignacaoTipoOptions,
  type AtoDesignacaoTipo,
} from "@sirel/shared/schemas/cadastros-institucionais";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface AtoDesignacaoFormState {
  id?: number;
  numero: string;
  ano: string;
  tipo: AtoDesignacaoTipo;
  ementa: string;
  dataEmissao: string;
  dataPublicacao: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  arquivoUrl: string;
  arquivoChave: string;
  mimeType: string;
  tamanhoBytes: number | null;
  hashArquivo: string;
  ativo: boolean;
}

interface AtoDesignacaoFormProps {
  value: AtoDesignacaoFormState;
  onChange: (value: AtoDesignacaoFormState) => void;
  onSubmit: () => void;
  onUpload: (file: File) => void;
  isSaving?: boolean;
  isUploading?: boolean;
}

export function createAtoDesignacaoFormState(): AtoDesignacaoFormState {
  return {
    numero: "",
    ano: String(new Date().getFullYear()),
    tipo: "DECRETO",
    ementa: "",
    dataEmissao: "",
    dataPublicacao: "",
    vigenciaInicio: "",
    vigenciaFim: "",
    arquivoUrl: "",
    arquivoChave: "",
    mimeType: "",
    tamanhoBytes: null,
    hashArquivo: "",
    ativo: true,
  };
}

export function AtoDesignacaoForm({
  value,
  onChange,
  onSubmit,
  onUpload,
  isSaving = false,
  isUploading = false,
}: AtoDesignacaoFormProps) {
  function patch(patchValue: Partial<AtoDesignacaoFormState>) {
    onChange({ ...value, ...patchValue });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_130px_180px]">
        <FormField label="Numero">
          <Input
            value={value.numero}
            onChange={(event) => patch({ numero: event.target.value })}
          />
        </FormField>
        <FormField label="Ano">
          <Input
            type="number"
            value={value.ano}
            onChange={(event) => patch({ ano: event.target.value })}
          />
        </FormField>
        <FormField label="Tipo">
          <Select
            value={value.tipo}
            onChange={(event) =>
              patch({ tipo: event.target.value as AtoDesignacaoTipo })
            }
          >
            {atoDesignacaoTipoOptions.map((tipo) => (
              <option key={tipo} value={tipo}>
                {atoDesignacaoTipoLabels[tipo]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField label="Ementa">
        <Textarea
          rows={3}
          value={value.ementa}
          onChange={(event) => patch({ ementa: event.target.value })}
        />
      </FormField>

      <div className="grid gap-3 md:grid-cols-4">
        <FormField label="Emissao">
          <Input
            type="date"
            value={value.dataEmissao}
            onChange={(event) => patch({ dataEmissao: event.target.value })}
          />
        </FormField>
        <FormField label="Publicacao">
          <Input
            type="date"
            value={value.dataPublicacao}
            onChange={(event) => patch({ dataPublicacao: event.target.value })}
          />
        </FormField>
        <FormField label="Vigencia inicio">
          <Input
            type="date"
            value={value.vigenciaInicio}
            onChange={(event) => patch({ vigenciaInicio: event.target.value })}
          />
        </FormField>
        <FormField label="Vigencia fim">
          <Input
            type="date"
            value={value.vigenciaFim}
            onChange={(event) => patch({ vigenciaFim: event.target.value })}
          />
        </FormField>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
        <FormField label="Arquivo do ato">
          <Input
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
            }}
          />
        </FormField>
        {value.arquivoUrl ? (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Arquivo vinculado: {value.mimeType || "tipo nao informado"} -{" "}
            {value.tamanhoBytes ?? 0} bytes
          </p>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            O ato pode ser salvo sem arquivo e receber o arquivo depois.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
        <Checkbox
          checked={value.ativo}
          onCheckedChange={(checked) => patch({ ativo: checked })}
        />
        Ato ativo
      </label>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onSubmit}
          loading={isSaving || isUploading}
          icon={<Upload className="h-4 w-4" />}
        >
          Salvar ato
        </Button>
      </div>
    </div>
  );
}
