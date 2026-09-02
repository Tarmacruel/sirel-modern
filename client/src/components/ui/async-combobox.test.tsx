import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AsyncCombobox } from "./async-combobox";
import { Modal } from "../shared/modal";

interface Option {
  id: number;
  name: string;
}

const options: Option[] = [
  { id: 1, name: "Ana Silva" },
  { id: 2, name: "Bruno Lima" },
  { id: 3, name: "Carla Souza" },
];

const getOptionValue = (option: Option) => option.id;
const getOptionLabel = (option: Option) => option.name;

async function advanceDebounce(milliseconds = 250) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AsyncCombobox", () => {
  it("aplica debounce, informa o limite e descarta resultados excedentes", async () => {
    vi.useFakeTimers();
    const query = vi.fn().mockResolvedValue(options);

    render(
      <AsyncCombobox
        value={null}
        onChange={vi.fn()}
        query={query}
        getOptionValue={getOptionValue}
        getOptionLabel={getOptionLabel}
        debounceMs={250}
        limit={2}
        ariaLabel="Pessoa"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Pessoa" });
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "ana" } });

    expect(query).not.toHaveBeenCalled();
    await advanceDebounce(249);
    expect(query).not.toHaveBeenCalled();
    await advanceDebounce(1);

    expect(query).toHaveBeenCalledWith("ana", 2);
    expect(screen.getByRole("option", { name: "Ana Silva" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bruno Lima" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Carla Souza" })).not.toBeInTheDocument();
  });

  it("seleciona por teclado e fecha com Tab ou Escape", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    render(
      <AsyncCombobox
        value={null}
        onChange={onChange}
        query={vi.fn().mockResolvedValue(options)}
        getOptionValue={getOptionValue}
        getOptionLabel={getOptionLabel}
        ariaLabel="Servidor"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Servidor" });
    fireEvent.click(input);
    await advanceDebounce();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(options[0]);
    expect(input).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(input);
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("mantém a opção inicial visível fora da consulta e permite limpar", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const initialOption = options[0];

    render(
      <AsyncCombobox
        value={initialOption.id}
        initialOption={initialOption}
        onChange={onChange}
        query={vi.fn().mockResolvedValue([options[1]])}
        getOptionValue={getOptionValue}
        getOptionLabel={getOptionLabel}
        allowClear
        ariaLabel="Pessoa vinculada"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Pessoa vinculada" });
    expect(input).toHaveValue("Ana Silva");

    fireEvent.click(input);
    await advanceDebounce();
    expect(screen.getByRole("option", { name: "Ana Silva" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "Bruno Lima" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("preserva o rótulo quando o formulário armazena um ID numérico como texto", () => {
    render(
      <AsyncCombobox
        value="1"
        initialOption={options[0]}
        onChange={vi.fn()}
        query={vi.fn().mockResolvedValue(options)}
        getOptionValue={getOptionValue}
        getOptionLabel={getOptionLabel}
        ariaLabel="Secretaria"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Secretaria" })).toHaveValue(
      "Ana Silva",
    );
  });

  it("só altera o rótulo depois que o pai confirma o novo valor", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(
      <AsyncCombobox
        value={1}
        initialOption={options[0]}
        onChange={onChange}
        query={vi.fn().mockResolvedValue(options)}
        getOptionValue={getOptionValue}
        getOptionLabel={getOptionLabel}
        ariaLabel="Pessoa controlada"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Pessoa controlada" });
    fireEvent.click(input);
    await advanceDebounce();
    fireEvent.click(screen.getByRole("option", { name: "Bruno Lima" }));

    expect(onChange).toHaveBeenCalledWith(options[1]);
    expect(input).toHaveValue("Ana Silva");

    rerender(
      <AsyncCombobox
        value={2}
        initialOption={options[1]}
        onChange={onChange}
        query={vi.fn().mockResolvedValue(options)}
        getOptionValue={getOptionValue}
        getOptionLabel={getOptionLabel}
        ariaLabel="Pessoa controlada"
      />,
    );
    expect(input).toHaveValue("Bruno Lima");
  });

  it("impede submit com Enter enquanto a lista está aberta", async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <AsyncCombobox
          value={null}
          onChange={onChange}
          query={vi.fn().mockResolvedValue(options)}
          getOptionValue={getOptionValue}
          getOptionLabel={getOptionLabel}
          ariaLabel="Pessoa no formulário"
        />
      </form>,
    );

    const input = screen.getByRole("combobox", { name: "Pessoa no formulário" });
    fireEvent.click(input);
    await advanceDebounce();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(options[0]);
  });

  it("fecha somente a lista com Escape quando está dentro de um modal", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Modal open title="Cadastro" onClose={onClose}>
        <AsyncCombobox
          value={null}
          onChange={vi.fn()}
          query={vi.fn().mockResolvedValue(options)}
          getOptionValue={getOptionValue}
          getOptionLabel={getOptionLabel}
          ariaLabel="Pessoa no modal"
        />
      </Modal>,
    );

    const input = screen.getByRole("combobox", { name: "Pessoa no modal" });
    fireEvent.click(input);
    await advanceDebounce();
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("oferece ação explícita quando a busca não encontra opções", async () => {
    vi.useFakeTimers();
    const onCreateOption = vi.fn();
    render(
      <AsyncCombobox
        value={null}
        onChange={vi.fn()}
        query={vi.fn().mockResolvedValue([])}
        getOptionValue={getOptionValue}
        getOptionLabel={getOptionLabel}
        createOptionLabel="Cadastrar nova pessoa"
        onCreateOption={onCreateOption}
        ariaLabel="Pessoa inexistente"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Pessoa inexistente" });
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "Nova Pessoa" } });
    await advanceDebounce();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar nova pessoa" }));

    expect(onCreateOption).toHaveBeenCalledWith("Nova Pessoa");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("abre e inicia a busca ao digitar com o campo fechado", async () => {
    vi.useFakeTimers();
    const query = vi.fn().mockResolvedValue(options);

    render(
      <AsyncCombobox
        value={null}
        onChange={vi.fn()}
        query={query}
        getOptionValue={getOptionValue}
        getOptionLabel={getOptionLabel}
        ariaLabel="Pessoa"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Pessoa" });
    fireEvent.keyDown(input, { key: "a" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveValue("a");
    await advanceDebounce();
    expect(query).toHaveBeenCalledWith("a", 20);
  });

  it("respeita o mínimo de busca, oculta detalhes técnicos e oferece nova tentativa após erro", async () => {
    vi.useFakeTimers();
    const technicalError = "Failed query: select pessoas.id from pessoas";
    const query = vi
      .fn<() => Promise<Option[]>>()
      .mockRejectedValueOnce(new Error(technicalError))
      .mockResolvedValueOnce([options[2]]);

    render(
      <AsyncCombobox
        value={null}
        onChange={vi.fn()}
        query={query}
        getOptionValue={getOptionValue}
        getOptionLabel={getOptionLabel}
        minSearchLength={2}
        ariaLabel="Cargo"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Cargo" });
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "a" } });
    expect(screen.getByText("Digite pelo menos 2 caracteres para buscar.")).toBeInTheDocument();
    await advanceDebounce();
    expect(query).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "ad" } });
    await advanceDebounce();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as opções. Tente novamente.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(technicalError);

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await advanceDebounce();
    expect(query).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("option", { name: "Carla Souza" })).toBeInTheDocument();
  });

  it("não fecha ao interagir com a área rolável do popover", async () => {
    vi.useFakeTimers();

    render(
      <AsyncCombobox
        value={null}
        onChange={vi.fn()}
        query={vi.fn().mockResolvedValue(options)}
        getOptionValue={getOptionValue}
        getOptionLabel={getOptionLabel}
        ariaLabel="Função"
      />,
    );

    const input = screen.getByRole("combobox", { name: "Função" });
    fireEvent.click(input);
    await advanceDebounce();
    fireEvent.pointerDown(screen.getByRole("listbox"));

    expect(input).toHaveAttribute("aria-expanded", "true");
  });
});
