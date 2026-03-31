import { useMemo } from "react";

import { calcularPrazoLegalMinimo, differenceInBusinessDays, startOfDay } from "@sirel/shared/prazos-legais";

import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatShortDateBR, formatShortDateTimeBR } from "@/lib/formatters";

interface DatePickerLegalProps {
  value: string;
  onChange: (value: string) => void;
  modalidadeCodigo?: string | null;
  tipoObjeto?: string | null;
  criterioJulgamento?: string | null;
  publicarNoDou?: boolean;
  publicarEmJornal?: boolean;
  foraDoFluxo?: boolean;
  acrescimoMunicipal?: number;
  comparisonDate?: string | Date | null;
  comparisonLabel?: string;
  justificationValue?: string;
  onJustificationChange?: (value: string) => void;
  label?: string;
}

function parseFlexibleDate(value?: string | Date | null) {
  if (!value) return null;
  const parsed = value instanceof Date
    ? value
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00`)
      : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getModalidadeNome(modalidadeCodigo?: string | null) {
  if (!modalidadeCodigo) return "a modalidade selecionada";
  return modalidadeCodigo
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

export function DatePickerLegal({
  value,
  onChange,
  modalidadeCodigo,
  tipoObjeto,
  criterioJulgamento,
  publicarNoDou = false,
  publicarEmJornal = false,
  foraDoFluxo = false,
  acrescimoMunicipal = 1,
  comparisonDate,
  comparisonLabel = "Sessão / disputa",
  justificationValue = "",
  onJustificationChange,
  label = "Data de publicação no PNCP",
}: DatePickerLegalProps) {
  const dataPublicacao = useMemo(() => parseFlexibleDate(value), [value]);
  const comparison = useMemo(() => parseFlexibleDate(comparisonDate), [comparisonDate]);

  const regra = useMemo(() => {
    if (!dataPublicacao || !modalidadeCodigo) return null;
    return calcularPrazoLegalMinimo({
      dataPublicacaoPNCP: dataPublicacao,
      modalidadeCodigo,
      tipoObjeto,
      criterioJulgamento,
      acrescimoMunicipal,
      publicarNoDou,
      publicarEmJornal,
    });
  }, [
    acrescimoMunicipal,
    criterioJulgamento,
    dataPublicacao,
    modalidadeCodigo,
    publicarEmJornal,
    publicarNoDou,
    tipoObjeto,
  ]);

  const comparisonBeforeMinimum = Boolean(regra && comparison && startOfDay(comparison).getTime() < regra.dataMinima.getTime());
  const diasAposMinimo = regra && comparison ? differenceInBusinessDays(startOfDay(comparison), regra.dataMinima) : 0;

  return (
    <div className="space-y-3">
      <FormField label={label}>
        <Input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
      </FormField>

      {!regra ? (
        <Alert variant="info">
          Selecione a data de publicação para o SIREL calcular automaticamente o prazo mínimo legal conforme o Art. 55 e a regra de contagem do Art. 183 da Lei 14.133/2021.
        </Alert>
      ) : (
        <>
          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            comparisonBeforeMinimum
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : diasAposMinimo > 10
                ? "border-sky-200 bg-sky-50 text-sky-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}>
            <div className="font-semibold">
              {comparison
                ? comparisonBeforeMinimum
                  ? "Fora do prazo mínimo legal"
                  : diasAposMinimo > 10
                    ? `Prazo estendido em ${diasAposMinimo} dia(s) útil(eis)`
                    : "Dentro do prazo legal"
                : `Prazo mínimo calculado para ${comparisonLabel.toLowerCase()}`}
            </div>
            <div className="mt-1">
              {comparison
                ? `${comparisonLabel}: ${formatShortDateTimeBR(comparison)} · mínima legal: ${formatShortDateBR(regra.dataMinima)}`
                : `Mínima legal: ${formatShortDateBR(regra.dataMinima)}`}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4 py-4 text-sm text-[var(--text-secondary)] shadow-[0_14px_30px_-28px_rgba(15,26,109,0.35)]">
            <div className="font-semibold text-[var(--text-primary)]">Regra aplicada</div>
            <div className="mt-2">
              {regra.regraAplicada.baseLegal}
              {regra.regraAplicada.observacao ? ` · ${regra.regraAplicada.observacao}` : ""}
            </div>
            <div className="mt-2 text-[var(--text-muted)]">
              Publicação: {formatShortDateBR(dataPublicacao)} · Início da contagem: {formatShortDateBR(regra.dataInicioContagem)} · Prazo: {regra.diasUteisTotais} dia(s) útil(eis)
            </div>
            <div className="mt-1 text-[var(--text-muted)]">
              Modalidade: {getModalidadeNome(modalidadeCodigo)} · Mínima legal: {formatShortDateBR(regra.dataMinima)}
            </div>
          </div>

          {foraDoFluxo && comparisonBeforeMinimum && onJustificationChange ? (
            <FormField label="Justificativa de prazo extemporâneo">
              <Textarea
                rows={3}
                value={justificationValue}
                onChange={(event) => onJustificationChange(event.target.value)}
                placeholder="Explique por que a agenda manual ficou anterior ao prazo mínimo legal. Essa justificativa será somada ao rastreio de auditoria."
              />
            </FormField>
          ) : null}
        </>
      )}
    </div>
  );
}
