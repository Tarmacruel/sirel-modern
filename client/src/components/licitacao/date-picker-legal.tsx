import { useMemo } from "react";

import {
  calcularPrazoLegalMinimo,
  differenceInBusinessDays,
  startOfDay,
} from "@sirel/shared/prazos-legais";

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
  feriadosLocais?: Array<string | Date>;
  comparisonDate?: string | Date | null;
  comparisonLabel?: string;
  justificationValue?: string;
  onJustificationChange?: (value: string) => void;
  label?: string;
}

function parseFlexibleDate(value?: string | Date | null) {
  if (!value) return null;
  const parsed =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00`)
        : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseHolidayDates(values: Array<string | Date> = []) {
  return values
    .map((value) => parseFlexibleDate(value))
    .filter((value): value is Date => Boolean(value));
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
  feriadosLocais = [],
  comparisonDate,
  comparisonLabel = "Sessao / disputa",
  justificationValue = "",
  onJustificationChange,
  label = "Data de publicacao no PNCP",
}: DatePickerLegalProps) {
  const dataPublicacao = useMemo(() => parseFlexibleDate(value), [value]);
  const comparison = useMemo(
    () => parseFlexibleDate(comparisonDate),
    [comparisonDate],
  );
  const holidayDates = useMemo(
    () => parseHolidayDates(feriadosLocais),
    [feriadosLocais],
  );

  const regra = useMemo(() => {
    if (!dataPublicacao || !modalidadeCodigo) return null;
    return calcularPrazoLegalMinimo({
      dataPublicacaoPNCP: dataPublicacao,
      modalidadeCodigo,
      tipoObjeto,
      criterioJulgamento,
      feriadosLocais: holidayDates,
      acrescimoMunicipal,
      publicarNoDou,
      publicarEmJornal,
    });
  }, [
    acrescimoMunicipal,
    criterioJulgamento,
    dataPublicacao,
    holidayDates,
    modalidadeCodigo,
    publicarEmJornal,
    publicarNoDou,
    tipoObjeto,
  ]);

  const comparisonBeforeMinimum = Boolean(
    regra &&
      comparison &&
      startOfDay(comparison).getTime() < regra.dataMinima.getTime(),
  );
  const diasAposMinimo =
    regra && comparison
      ? differenceInBusinessDays(startOfDay(comparison), regra.dataMinima)
      : 0;

  return (
    <div className="space-y-3">
      <FormField label={label}>
        <Input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </FormField>

      {!regra ? (
        <Alert variant="info">
          Selecione a data de publicacao para o SIREL calcular automaticamente o
          prazo minimo legal conforme a Lei 14.133/2021.
        </Alert>
      ) : (
        <>
          <div
            className={[
              "rounded-[14px] border px-3 py-2 text-sm",
              comparisonBeforeMinimum
                ? "border-[var(--notice-warning-border)] bg-[var(--notice-warning-bg)] text-[var(--notice-warning-text)]"
                : "border-[var(--notice-success-border)] bg-[var(--notice-success-bg)] text-[var(--notice-success-text)]",
            ].join(" ")}
          >
            <div className="font-semibold">
              {comparison
                ? comparisonBeforeMinimum
                  ? "Fora do prazo minimo legal"
                  : diasAposMinimo > 10
                    ? `Prazo estendido em ${diasAposMinimo} dia(s) util(eis)`
                    : "Prazo legal valido"
                : `Prazo minimo calculado para ${comparisonLabel.toLowerCase()}`}
            </div>
            <div className="mt-1">
              {comparison
                ? `${comparisonLabel}: ${formatShortDateTimeBR(comparison)} - minima legal: ${formatShortDateBR(regra.dataMinima)}`
                : `Minima legal: ${formatShortDateBR(regra.dataMinima)}`}
            </div>
          </div>

          <details className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            <summary className="cursor-pointer font-semibold text-[var(--text-primary)]">
              Ver calculo legal
            </summary>
            <div className="mt-2 space-y-1">
              <div>
                {regra.regraAplicada.baseLegal}
                {regra.regraAplicada.observacao
                  ? ` - ${regra.regraAplicada.observacao}`
                  : ""}
              </div>
              <div className="text-[var(--text-muted)]">
                Publicacao: {formatShortDateBR(dataPublicacao)} - Inicio da
                contagem: {formatShortDateBR(regra.dataInicioContagem)} - Prazo:{" "}
                {regra.diasUteisTotais} dia(s) util(eis)
              </div>
              <div className="text-[var(--text-muted)]">
                Modalidade: {getModalidadeNome(modalidadeCodigo)} - Minima
                legal: {formatShortDateBR(regra.dataMinima)}
              </div>
              {holidayDates.length ? (
                <div className="text-[var(--text-muted)]">
                  Feriados locais considerados: {holidayDates.length}
                </div>
              ) : null}
            </div>
          </details>

          {foraDoFluxo && comparisonBeforeMinimum && onJustificationChange ? (
            <FormField label="Justificativa de prazo extemporaneo">
              <Textarea
                rows={3}
                value={justificationValue}
                onChange={(event) => onJustificationChange(event.target.value)}
                placeholder="Explique por que a agenda manual ficou anterior ao prazo minimo legal."
              />
            </FormField>
          ) : null}
        </>
      )}
    </div>
  );
}
