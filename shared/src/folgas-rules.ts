export type FolgaRuleViolationCode =
  | "INVALID_DATE"
  | "WEEKEND"
  | "NON_WORKING_DAY"
  | "MAX_CONSECUTIVE"
  | "DUPLICATE_DATE";

export type FolgaRuleViolation = {
  code: FolgaRuleViolationCode;
  message: string;
  date?: string;
  sequenceStart?: string;
  sequenceEnd?: string;
  sequenceLength?: number;
};

export type FolgaRulesInput = {
  selectedDates: string[];
  nonWorkingDates?: Iterable<string>;
  maxConsecutiveOffDays?: number;
  rejectWeekendSelection?: boolean;
  rejectNonWorkingSelection?: boolean;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function normalizeDateOnly(value: string) {
  return String(value ?? "").slice(0, 10);
}

export function isValidDateOnly(value: string) {
  if (!DATE_ONLY_RE.test(value)) return false;
  const date = dateOnlyToUtc(value);
  return !Number.isNaN(date.getTime()) && utcToDateOnly(date) === value;
}

export function dateOnlyToUtc(value: string) {
  if (!DATE_ONLY_RE.test(value)) return new Date(Number.NaN);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

export function utcToDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addDaysDateOnly(value: string, days: number) {
  const date = dateOnlyToUtc(value);
  if (Number.isNaN(date.getTime())) return value;
  return utcToDateOnly(new Date(date.getTime() + days * DAY_MS));
}

export function isWeekendDate(value: string) {
  const date = dateOnlyToUtc(value);
  if (Number.isNaN(date.getTime())) return false;
  const weekday = date.getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function compareDateOnly(left: string, right: string) {
  return normalizeDateOnly(left).localeCompare(normalizeDateOnly(right));
}

export function buildOffDayPredicate(
  selectedDates: Iterable<string>,
  nonWorkingDates: Iterable<string> = [],
) {
  const selected = new Set(Array.from(selectedDates, normalizeDateOnly));
  const nonWorking = new Set(Array.from(nonWorkingDates, normalizeDateOnly));

  return (date: string) => {
    const normalized = normalizeDateOnly(date);
    return (
      selected.has(normalized) ||
      nonWorking.has(normalized) ||
      isWeekendDate(normalized)
    );
  };
}

export function getConsecutiveOffSequence(
  anchorDate: string,
  selectedDates: Iterable<string>,
  nonWorkingDates: Iterable<string> = [],
) {
  const anchor = normalizeDateOnly(anchorDate);
  const isOff = buildOffDayPredicate(selectedDates, nonWorkingDates);

  if (!isOff(anchor)) {
    return { start: anchor, end: anchor, length: 0 };
  }

  let start = anchor;
  let end = anchor;
  let guard = 0;

  while (guard++ < 370) {
    const previous = addDaysDateOnly(start, -1);
    if (!isOff(previous)) break;
    start = previous;
  }

  guard = 0;
  while (guard++ < 370) {
    const next = addDaysDateOnly(end, 1);
    if (!isOff(next)) break;
    end = next;
  }

  const startTime = dateOnlyToUtc(start).getTime();
  const endTime = dateOnlyToUtc(end).getTime();
  const length = Math.floor((endTime - startTime) / DAY_MS) + 1;

  return { start, end, length };
}

export function validateFolgaSelection(input: FolgaRulesInput): {
  valid: boolean;
  violations: FolgaRuleViolation[];
} {
  const maxConsecutive = input.maxConsecutiveOffDays ?? 3;
  const nonWorking = new Set(
    Array.from(input.nonWorkingDates ?? [], normalizeDateOnly),
  );
  const normalized = input.selectedDates;
  const unique = new Set<string>();
  const violations: FolgaRuleViolation[] = [];

  for (const date of normalized) {
    if (!isValidDateOnly(date)) {
      violations.push({
        code: "INVALID_DATE",
        date,
        message: `Data inválida: ${date}.`,
      });
      continue;
    }

    if (unique.has(date)) {
      violations.push({
        code: "DUPLICATE_DATE",
        date,
        message: `A data ${date} foi selecionada mais de uma vez.`,
      });
      continue;
    }
    unique.add(date);

    if ((input.rejectWeekendSelection ?? true) && isWeekendDate(date)) {
      violations.push({
        code: "WEEKEND",
        date,
        message: `A data ${date} é sábado ou domingo e não pode ser escolhida como folga.`,
      });
    }

    if ((input.rejectNonWorkingSelection ?? true) && nonWorking.has(date)) {
      violations.push({
        code: "NON_WORKING_DAY",
        date,
        message: `A data ${date} já é feriado, ponto facultativo ou outro dia sem expediente.`,
      });
    }
  }

  if (violations.length) {
    return { valid: false, violations };
  }

  for (const date of unique) {
    const sequence = getConsecutiveOffSequence(date, unique, nonWorking);
    if (sequence.length > maxConsecutive) {
      violations.push({
        code: "MAX_CONSECUTIVE",
        date,
        sequenceStart: sequence.start,
        sequenceEnd: sequence.end,
        sequenceLength: sequence.length,
        message:
          `A escolha de ${date} formaria ${sequence.length} dias consecutivos sem expediente ` +
          `(${sequence.start} a ${sequence.end}). O limite permitido é de ${maxConsecutive} dias consecutivos.`,
      });
    }
  }

  return { valid: violations.length === 0, violations };
}

export function canAddFolgaDate(
  candidateDate: string,
  selectedDates: Iterable<string>,
  nonWorkingDates: Iterable<string> = [],
  maxConsecutiveOffDays = 3,
) {
  const next = [...Array.from(selectedDates), normalizeDateOnly(candidateDate)];
  return validateFolgaSelection({
    selectedDates: next,
    nonWorkingDates,
    maxConsecutiveOffDays,
  });
}
