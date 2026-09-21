import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { Input } from "../components/ui/input";
import { maskCurrencyInputBR, normalizeCurrencyInputBR } from "./formatters";

function CurrencyField() {
  const [value, setValue] = useState("");
  return (
    <Input
      aria-label="Valor unitario proposto"
      value={value}
      onChange={(event) => setValue(maskCurrencyInputBR(event.target.value))}
    />
  );
}

afterEach(cleanup);

describe("digitação de valores monetários", () => {
  it("acumula os dígitos em centavos sem perder teclas por arredondamento", async () => {
    const user = userEvent.setup();
    render(<CurrencyField />);
    const input = screen.getByRole("textbox") as HTMLInputElement;

    for (const [digit, amount] of [
      ["1", 0.01],
      ["2", 0.12],
      ["3", 1.23],
      ["4", 12.34],
      ["5", 123.45],
    ] as const) {
      await user.type(input, digit);
      expect(normalizeCurrencyInputBR(input.value)).toBe(amount);
    }

    await user.type(input, "{Backspace}");
    expect(normalizeCurrencyInputBR(input.value)).toBe(12.34);
    await user.clear(input);
    expect(input.value).toBe("");
    await user.type(input, "30000");
    expect(normalizeCurrencyInputBR(input.value)).toBe(300);
  });

  it.each(["123456", "1234,56", "1234.56", "R$ 1.234,56"])(
    "aceita colar %s e mantém o valor enviado ao salvar",
    async (text) => {
      const user = userEvent.setup();
      render(<CurrencyField />);
      const input = screen.getByRole("textbox") as HTMLInputElement;
      await user.click(input);
      await user.paste(text);
      expect(normalizeCurrencyInputBR(input.value)).toBe(1234.56);
    },
  );
});
