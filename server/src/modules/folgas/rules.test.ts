import { describe, expect, it } from "vitest";

import {
  canAddFolgaDate,
  validateFolgaSelection,
} from "@sirel/shared/folgas-rules";

describe("regras de folgas", () => {
  it("considera feriado posterior ao intervalo e a virada do ano", () => {
    const result = validateFolgaSelection({
      selectedDates: ["2026-12-31"],
      nonWorkingDates: ["2027-01-01"],
    });
    expect(result.valid).toBe(false);
    expect(result.violations[0].sequenceEnd).toBe("2027-01-03");
  });
  it("rejeita datas inexistentes, lixo e strings com horário", () => {
    for (const date of [
      "2026-02-29",
      "2026-99-99",
      "2026-00-00",
      "2026-09-16T12:00:00Z",
      "texto",
    ]) {
      expect(validateFolgaSelection({ selectedDates: [date] }).valid).toBe(
        false,
      );
    }
  });
  it("reavalia seleção com pontos facultativos e limite configurável", () => {
    expect(
      canAddFolgaDate("2026-09-18", ["2026-09-14"], ["2026-09-17"], 3).valid,
    ).toBe(false);
    expect(canAddFolgaDate("2026-09-18", [], [], 2).valid).toBe(false);
    expect(canAddFolgaDate("2026-09-18", [], [], 3).valid).toBe(true);
    expect(validateFolgaSelection({ selectedDates: [] }).valid).toBe(true);
  });
  it("bloqueia segunda + terça por formar quatro dias com o fim de semana", () => {
    const result = validateFolgaSelection({
      selectedDates: ["2026-09-14", "2026-09-15"],
      maxConsecutiveOffDays: 3,
    });
    expect(result.valid).toBe(false);
    expect(
      result.violations.some((item) => item.code === "MAX_CONSECUTIVE"),
    ).toBe(true);
  });

  it("bloqueia quinta + sexta por formar quatro dias com o fim de semana", () => {
    const result = validateFolgaSelection({
      selectedDates: ["2026-09-17", "2026-09-18"],
      maxConsecutiveOffDays: 3,
    });
    expect(result.valid).toBe(false);
  });

  it("bloqueia sexta + segunda atravessando o fim de semana", () => {
    const result = validateFolgaSelection({
      selectedDates: ["2026-09-18", "2026-09-21"],
      maxConsecutiveOffDays: 3,
    });
    expect(result.valid).toBe(false);
  });

  it("permite segunda + sexta na mesma semana quando nenhuma sequência chega a quatro dias", () => {
    const result = validateFolgaSelection({
      selectedDates: ["2026-09-14", "2026-09-18"],
      maxConsecutiveOffDays: 3,
    });
    expect(result.valid).toBe(true);
  });

  it("considera feriado na continuidade e bloqueia a terça após o feriado de 7 de setembro", () => {
    const result = canAddFolgaDate("2026-09-08", [], ["2026-09-07"], 3);
    expect(result.valid).toBe(false);
    expect(result.violations[0]?.sequenceLength).toBeGreaterThanOrEqual(4);
  });

  it("não permite selecionar sábado ou domingo", () => {
    const result = validateFolgaSelection({ selectedDates: ["2026-09-19"] });
    expect(result.valid).toBe(false);
    expect(result.violations.some((item) => item.code === "WEEKEND")).toBe(
      true,
    );
  });

  it("não permite selecionar o próprio feriado", () => {
    const result = validateFolgaSelection({
      selectedDates: ["2026-09-07"],
      nonWorkingDates: ["2026-09-07"],
    });
    expect(result.valid).toBe(false);
    expect(
      result.violations.some((item) => item.code === "NON_WORKING_DAY"),
    ).toBe(true);
  });

  it("detecta data duplicada", () => {
    const result = validateFolgaSelection({
      selectedDates: ["2026-09-16", "2026-09-16"],
    });
    expect(result.valid).toBe(false);
    expect(
      result.violations.some((item) => item.code === "DUPLICATE_DATE"),
    ).toBe(true);
  });
});
