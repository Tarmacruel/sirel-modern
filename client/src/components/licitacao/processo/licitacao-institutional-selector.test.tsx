import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LicitacaoInstitutionalSelector } from "./licitacao-institutional-selector";

afterEach(cleanup);
const defaults = {
  kind: "comissao" as const,
  title: "Comissão",
  selected: null,
  options: [],
  onSelect: vi.fn(),
  onOpenCadastros: vi.fn(),
};

it("permite ampliar o escopo vazio sem selecionar automaticamente", async () => {
  const user = userEvent.setup();
  const changeScope = vi.fn();
  const select = vi.fn();
  const props = {
    ...defaults,
    onSelect: select,
    onIncludeOtherSecretariatsChange: changeScope,
  };
  const view = render(<LicitacaoInstitutionalSelector {...props} />);
  await user.click(
    screen.getByRole("button", { name: "Selecionar", exact: true }),
  );
  await user.click(
    screen.getByRole("button", { name: "Ver todas as secretarias" }),
  );
  expect(changeScope).toHaveBeenCalledWith(true);
  view.rerender(
    <LicitacaoInstitutionalSelector
      {...props}
      includeOtherSecretariats
      options={[
        { id: 1, nome: "Comissão municipal", secretariaNome: "Administração" },
      ]}
    />,
  );
  expect(screen.getByText("Administração")).toBeTruthy();
  expect(select).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Selecionar para o processo" }),
  );
  expect(select).toHaveBeenCalledWith(1, false);
});

it("mostra falhas de carregamento e permite tentar novamente", async () => {
  const user = userEvent.setup();
  const retry = vi.fn();
  render(
    <LicitacaoInstitutionalSelector
      {...defaults}
      error="Falha de conexão"
      onRetry={retry}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Selecionar", exact: true }),
  );
  expect(screen.getByRole("alert").textContent).toContain("Falha de conexão");
  expect(screen.queryByText(/Nenhum registro vigente/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("limpa buscas ao reabrir o seletor e ao trocar de catálogo", async () => {
  const user = userEvent.setup();
  const view = render(<LicitacaoInstitutionalSelector {...defaults} />);
  await user.click(
    screen.getByRole("button", { name: "Selecionar", exact: true }),
  );
  await user.type(screen.getByRole("textbox"), "comissão inexistente");
  await user.keyboard("{Escape}");
  await user.click(
    screen.getByRole("button", { name: "Selecionar", exact: true }),
  );
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  await user.type(screen.getByRole("textbox"), "comissão");
  view.rerender(
    <LicitacaoInstitutionalSelector
      {...defaults}
      kind="ordenadorDespesa"
      title="Ordenador"
      options={[{ id: 13, pessoaNome: "Ordenador da Saúde" }]}
    />,
  );
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
  expect(screen.getByText("Ordenador da Saúde")).toBeTruthy();
});
