import { Building2, CheckCircle2, FileText, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resolveServerAssetUrl } from "@/lib/document-upload";

export type LicitacaoInstitutionalKind =
  | "comissao"
  | "equipeApoio"
  | "ordenadorDespesa";

interface InstitutionalOption {
  id: number;
  nome?: string | null;
  pessoa?: { nome?: string | null; cargo?: string | null } | null;
  pessoaNome?: string | null;
  ato?: {
    label?: string | null;
    arquivoUrl?: string | null;
  } | null;
  vigenciaInicio?: string | Date | null;
  vigenciaFim?: string | Date | null;
  secretariaNome?: string | null;
  membros?: Array<{
    pessoaNome?: string | null;
    funcao?: string | null;
  }>;
  secretarias?: Array<{
    secretariaNome?: string | null;
    secretariaSigla?: string | null;
  }>;
}

interface SuggestedConductor {
  id: number;
  nome: string;
  cargo: string | null;
  funcao: string;
}

interface LicitacaoInstitutionalSelectorProps {
  kind: LicitacaoInstitutionalKind;
  title: string;
  selected: InstitutionalOption | null;
  options: InstitutionalOption[];
  isLoading?: boolean;
  isSaving?: boolean;
  suggestedConductor?: SuggestedConductor | null;
  onSelect: (id: number, applySuggestedConductor: boolean) => void;
  onOpenCadastros: () => void;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  return String(value).slice(0, 10).split("-").reverse().join("/");
}

function optionName(option: InstitutionalOption) {
  return (
    option.nome ??
    option.pessoa?.nome ??
    option.pessoaNome ??
    `Registro #${option.id}`
  );
}

function optionScope(option: InstitutionalOption) {
  if (option.secretariaNome) return option.secretariaNome;
  const secretarias = option.secretarias ?? [];
  if (secretarias.length) {
    return secretarias
      .map((item) => item.secretariaSigla ?? item.secretariaNome)
      .filter(Boolean)
      .join(", ");
  }
  return "Escopo geral";
}

function optionComposition(option: InstitutionalOption) {
  if (option.membros?.length) {
    return option.membros
      .slice(0, 4)
      .map((member) =>
        [member.pessoaNome, member.funcao].filter(Boolean).join(" - "),
      )
      .join("; ");
  }
  return option.pessoa?.cargo ?? "Composicao registrada";
}

export function LicitacaoInstitutionalSelector({
  kind,
  title,
  selected,
  options,
  isLoading = false,
  isSaving = false,
  suggestedConductor,
  onSelect,
  onOpenCadastros,
}: LicitacaoInstitutionalSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [applyConductor, setApplyConductor] = useState(false);
  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) =>
      [
        optionName(option),
        option.ato?.label,
        optionScope(option),
        optionComposition(option),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [options, search]);
  const selectedAtoUrl = resolveServerAssetUrl(selected?.ato?.arquivoUrl);

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--surface-card)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            <Building2 className="h-4 w-4" />
            Catalogo institucional
          </div>
          <h5 className="mt-2 text-base font-semibold text-[var(--text-primary)]">
            {selected ? optionName(selected) : `${title} nao selecionado`}
          </h5>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {selected
              ? `${selected.ato?.label ?? "Ato nao informado"} | ${formatDate(selected.vigenciaInicio)} a ${formatDate(selected.vigenciaFim)}`
              : "Selecione um registro institucional vigente para concluir este requisito."}
          </p>
          {selected ? (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {optionScope(selected)} | {optionComposition(selected)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedAtoUrl ? (
            <a href={selectedAtoUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" icon={<FileText className="h-4 w-4" />}>
                Ver ato
              </Button>
            </a>
          ) : null}
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            icon={<Users className="h-4 w-4" />}
          >
            {selected ? "Trocar" : "Selecionar"}
          </Button>
        </div>
      </div>

      {suggestedConductor && kind === "comissao" ? (
        <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3 text-sm text-[var(--text-secondary)]">
          Condutor sugerido:{" "}
          <span className="font-semibold text-[var(--text-primary)]">
            {suggestedConductor.nome}
          </span>{" "}
          ({suggestedConductor.funcao}). A aplicacao depende de confirmacao na
          selecao.
        </div>
      ) : null}

      <Modal
        open={open}
        title={`Selecionar ${title}`}
        description="Filtre os registros vigentes e escolha a designacao formal para este processo."
        onClose={() => setOpen(false)}
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2">
              <Search className="h-4 w-4 text-[var(--text-secondary)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, ato ou secretaria"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--text-primary)] outline-none"
              />
            </div>
            <Button variant="outline" onClick={onOpenCadastros}>
              Abrir Cadastros
            </Button>
          </div>

          {suggestedConductor && kind === "comissao" ? (
            <label className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-3 text-sm font-semibold text-[var(--text-secondary)]">
              <Input
                type="checkbox"
                className="h-4 w-4"
                checked={applyConductor}
                onChange={(event) => setApplyConductor(event.target.checked)}
              />
              Aplicar {suggestedConductor.nome} como condutor do processo
            </label>
          ) : null}

          {isLoading ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-8 text-sm text-[var(--text-secondary)]">
              Carregando registros...
            </div>
          ) : filteredOptions.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredOptions.map((option) => (
                <div
                  key={option.id}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">
                        {optionName(option)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {option.ato?.label ?? "Ato nao informado"} |{" "}
                        {formatDate(option.vigenciaInicio)} a{" "}
                        {formatDate(option.vigenciaFim)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {optionScope(option)}
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {optionComposition(option)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      loading={isSaving}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      onClick={() => {
                        onSelect(option.id, applyConductor);
                        setOpen(false);
                      }}
                    >
                      Selecionar para o processo
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-8 text-sm text-[var(--text-secondary)]">
              Nenhum registro encontrado para os filtros atuais.
            </div>
          )}
        </div>
      </Modal>
    </Card>
  );
}
