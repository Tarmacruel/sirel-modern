import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LicitacaoAuditDrawer } from "./licitacao-audit-drawer";

afterEach(cleanup);

describe("justificativa fora do fluxo", () => {
  it("nao apresenta um rascunho como auditoria registrada e salva ao concluir", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <LicitacaoAuditDrawer
        visible
        value="Cadastro retroativo"
        savedValue=""
        saving={false}
        onChange={vi.fn()}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Fora do fluxo" }));
    await user.click(
      screen.getByRole("button", { name: "Salvar justificativa" }),
    );
    expect(onSave).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument(),
    );
  });

  it("mostra a justificativa persistida ao reabrir", async () => {
    const user = userEvent.setup();
    render(
      <LicitacaoAuditDrawer
        visible
        value="Cadastro retroativo"
        savedValue="Cadastro retroativo"
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Auditoria registrada" }),
    );
    expect(screen.getByRole("textbox")).toHaveValue("Cadastro retroativo");
  });

  it("mantem o texto e informa a falha quando nao consegue salvar", async () => {
    const user = userEvent.setup();
    render(
      <LicitacaoAuditDrawer
        visible
        value="Cadastro retroativo"
        savedValue=""
        saving={false}
        onChange={vi.fn()}
        onSave={vi.fn().mockRejectedValue(new Error("Falha de conexao"))}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Fora do fluxo" }));
    await user.click(
      screen.getByRole("button", { name: "Salvar justificativa" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha de conexao",
    );
    expect(screen.getByRole("textbox")).toHaveValue("Cadastro retroativo");
    expect(
      screen.queryByRole("button", { name: "Auditoria registrada" }),
    ).not.toBeInTheDocument();
  });
});
