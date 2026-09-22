import { Building2, CheckCircle2, FileText, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { grupoInstitucionalMembroFuncaoLabels } from "@sirel/shared/schemas/cadastros-institucionais";
import { formatShortDateBR } from "@/lib/formatters";

import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resolveServerAssetUrl } from "@/lib/document-upload";

export type LicitacaoInstitutionalKind =
  | "agenteContratacao"
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
  error?: string;
  onRetry?: () => void;
  includeOtherSecretariats?: boolean;
  onIncludeOtherSecretariatsChange?: (include: boolean) => void;
  referenceDate?: string | Date;
  processSecretariat?: string;
  suggestedConductor?: SuggestedConductor | null;
  onSelect: (id: number, applySuggestedConductor: boolean) => void;
  onOpenCadastros: () => void;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  return formatShortDateBR(value);
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
        [
          member.pessoaNome,
          grupoInstitucionalMembroFuncaoLabels[
            member.funcao as keyof typeof grupoInstitucionalMembroFuncaoLabels
          ] ?? member.funcao,
        ]
          .filter(Boolean)
          .join(" - "),
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
  error,
  onRetry,
  includeOtherSecretariats = false,
  onIncludeOtherSecretariatsChange,
  referenceDate,
  processSecretariat,
  suggestedConductor,
  onSelect,
  onOpenCadastros,
}: LicitacaoInstitutionalSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [applyConductor, setApplyConductor] = useState(false);
  useEffect(() => {
    setSearch("");
    setApplyConductor(false);
  }, [kind, open]);
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
              <Button
                size="sm"
                variant="outline"
                icon={<FileText className="h-4 w-4" />}
              >
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
          {kind === "agenteContratacao" ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Ao selecionar um agente, ele será definido como condutor do
              processo.
            </p>
          ) : null}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2">
              <Search className="h-4 w-4 text-[var(--text-secondary)]" />
              <input
                aria-label="Buscar designações"
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

          {onIncludeOtherSecretariatsChange ? (
            <div className="space-y-2 text-sm text-[var(--text-secondary)]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeOtherSecretariats}
                  onChange={(event) =>
                    onIncludeOtherSecretariatsChange(event.target.checked)
                  }
                />
                Consultar todas as secretarias
              </label>
              <p>
                {includeOtherSecretariats
                  ? "Exibindo registros de todas as secretarias. Confira o escopo do ato ao selecionar."
                  : `Secretaria do processo: ${processSecretariat ?? "não informada"}.`}
                {referenceDate
                  ? ` Vigência em ${formatDate(referenceDate)}.`
                  : ""}
              </p>
            </div>
          ) : null}

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

          {error ? (
            <div
              role="alert"
              className="space-y-3 rounded-lg border border-[var(--border-subtle)] p-4 text-sm"
            >
              <p>Não foi possível carregar as designações. {error}</p>
              {onRetry ? (
                <Button type="button" variant="outline" onClick={onRetry}>
                  Tentar novamente
                </Button>
              ) : null}
            </div>
          ) : isLoading ? (
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
              <p>
                {search.trim()
                  ? "Nenhum registro corresponde à busca."
                  : "Nenhum registro vigente encontrado neste escopo."}
              </p>
              {search.trim() ? (
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => setSearch("")}
                >
                  Limpar busca
                </Button>
              ) : !includeOtherSecretariats &&
                onIncludeOtherSecretariatsChange ? (
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => onIncludeOtherSecretariatsChange(true)}
                >
                  Ver todas as secretarias
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </Modal>
    </Card>
  );
}
