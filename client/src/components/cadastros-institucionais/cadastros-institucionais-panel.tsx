import { FileText, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import type { AtoDesignacaoSaveInput } from "@sirel/shared/schemas/cadastros-institucionais";

import {
  AtoDesignacaoForm,
  createAtoDesignacaoFormState,
  type AtoDesignacaoFormState,
} from "./ato-designacao-form";
import { ComissoesPanel } from "./comissoes-panel";
import { EquipesApoioPanel } from "./equipes-apoio-panel";
import { OrdenadoresPanel } from "./ordenadores-panel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { uploadAtoDesignacao } from "@/lib/cadastros-upload";
import { trpc } from "@/lib/trpc";

function toDateInput(value: unknown) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function mapAtoToForm(row: any): AtoDesignacaoFormState {
  return {
    id: row.id,
    numero: row.numero ?? "",
    ano: String(row.ano ?? new Date().getFullYear()),
    tipo: row.tipo ?? "DECRETO",
    ementa: row.ementa ?? "",
    dataEmissao: toDateInput(row.dataEmissao),
    dataPublicacao: toDateInput(row.dataPublicacao),
    vigenciaInicio: toDateInput(row.vigenciaInicio),
    vigenciaFim: toDateInput(row.vigenciaFim),
    arquivoUrl: row.arquivoUrl ?? "",
    arquivoChave: row.arquivoChave ?? "",
    mimeType: row.mimeType ?? "",
    tamanhoBytes: row.tamanhoBytes ?? null,
    hashArquivo: row.hashArquivo ?? "",
    ativo: row.ativo !== false,
  };
}

function AtosDesignacaoPanel() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<AtoDesignacaoFormState>(() =>
    createAtoDesignacaoFormState(),
  );
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listQuery = trpc.cadastrosInstitucionais.atos.list.useQuery(
    {
      search: search.trim() || undefined,
      ativo: undefined,
      page: 1,
      pageSize: 80,
    },
    { retry: false, placeholderData: (previous) => previous },
  );
  const saveMutation = trpc.cadastrosInstitucionais.atos.save.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.cadastrosInstitucionais.atos.list.invalidate(),
        utils.cadastrosInstitucionais.comissoes.list.invalidate(),
        utils.cadastrosInstitucionais.equipesApoio.list.invalidate(),
        utils.cadastrosInstitucionais.ordenadores.list.invalidate(),
      ]);
      setForm(createAtoDesignacaoFormState());
      setEditing(false);
      setFeedback("Ato salvo.");
      setError(null);
    },
    onError: (cause) => setError(cause.message),
  });
  const inactivateMutation =
    trpc.cadastrosInstitucionais.atos.inactivate.useMutation({
      onSuccess: async () => {
        await listQuery.refetch();
        setFeedback("Ato inativado.");
      },
      onError: (cause) => setError(cause.message),
    });

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const result = await uploadAtoDesignacao(file);
      setForm((current) => ({
        ...current,
        arquivoUrl: result.arquivoUrl,
        arquivoChave: result.arquivoChave,
        mimeType: result.mimeType,
        tamanhoBytes: result.tamanhoBytes,
        hashArquivo: result.hashArquivo,
      }));
      setFeedback("Arquivo do ato enviado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha no upload.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.numero.trim() || !form.ementa.trim() || !form.ano) {
      setError("Informe numero, ano e ementa do ato.");
      return;
    }
    const payload: AtoDesignacaoSaveInput = {
      id: form.id,
      numero: form.numero.trim(),
      ano: Number(form.ano),
      tipo: form.tipo,
      ementa: form.ementa.trim(),
      dataEmissao: form.dataEmissao,
      dataPublicacao: form.dataPublicacao,
      vigenciaInicio: form.vigenciaInicio,
      vigenciaFim: form.vigenciaFim,
      arquivoUrl: form.arquivoUrl,
      arquivoChave: form.arquivoChave,
      mimeType: form.mimeType,
      tamanhoBytes: form.tamanhoBytes,
      hashArquivo: form.hashArquivo,
      ativo: form.ativo,
    };
    await saveMutation.mutateAsync(payload);
  }

  const rows = listQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card
        title={editing ? "Editar Ato de Designacao" : "Novo Ato de Designacao"}
        action={
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCcw className="h-4 w-4" />}
            onClick={() => {
              setForm(createAtoDesignacaoFormState());
              setEditing(false);
            }}
          >
            Limpar
          </Button>
        }
      >
        <AtoDesignacaoForm
          value={form}
          onChange={setForm}
          onSubmit={() => void save()}
          onUpload={(file) => void handleUpload(file)}
          isSaving={saveMutation.isPending}
          isUploading={uploading}
        />
      </Card>

      <Card
        title="Atos cadastrados"
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
                      {row.label}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {row.ementa}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Vigencia: {toDateInput(row.vigenciaInicio) || "-"} a{" "}
                      {toDateInput(row.vigenciaFim) || "-"}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                    {row.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.arquivoUrl ? (
                    <a href={row.arquivoUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" icon={<FileText className="h-4 w-4" />}>
                        Abrir arquivo
                      </Button>
                    </a>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Pencil className="h-4 w-4" />}
                    onClick={() => {
                      setForm(mapAtoToForm(row));
                      setEditing(true);
                      setError(null);
                    }}
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
            Nenhum ato cadastrado.
          </div>
        )}
      </Card>
    </div>
  );
}

export function CadastrosInstitucionaisPanel() {
  return (
    <Card
      title="Cadastros institucionais"
      action={
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
          <Plus className="h-4 w-4" />
          Designacoes
        </div>
      }
    >
      <Tabs
        items={[
          {
            value: "atos",
            label: "Atos",
            content: <AtosDesignacaoPanel />,
          },
          {
            value: "comissoes",
            label: "Comissoes",
            content: <ComissoesPanel />,
          },
          {
            value: "equipes",
            label: "Equipes de Apoio",
            content: <EquipesApoioPanel />,
          },
          {
            value: "ordenadores",
            label: "Ordenadores",
            content: <OrdenadoresPanel />,
          },
        ]}
      />
    </Card>
  );
}
