import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gavel, Users } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import {
  LicitacaoPhaseWorkspace,
  type WorkspaceTab,
} from "./licitacao-phase-workspace";

afterEach(cleanup);

function DisputeHost({ withBids = true }: { withBids?: boolean }) {
  const [tab, setTab] = useState<WorkspaceTab>("documents");
  return (
    <LicitacaoPhaseWorkspace
      phase="dispute"
      activeTab={tab}
      onTabChange={setTab}
      items={[
        {
          category: "ata",
          label: "Ata da sessão",
          concluido: false,
          statusLabel: "Obrigatório · Pendente",
        },
      ]}
      activeCategory="ata"
      onSelectCategory={() => {}}
      editor={
        <label>
          Arquivo da ata
          <input type="file" />
        </label>
      }
      operationTabs={[
        {
          value: "bidders",
          label: "Licitantes",
          icon: Users,
          count: 2,
          content: (
            <label>
              Fornecedor selecionado
              <input />
            </label>
          ),
        },
        ...(withBids
          ? [
              {
                value: "bids" as const,
                label: "Lances",
                icon: Gavel,
                count: 0,
                content: <p>Lances da sessão</p>,
              },
            ]
          : []),
      ]}
      footer={<button disabled>Avançar para julgamento</button>}
    />
  );
}

describe("workspace da disputa", () => {
  it("preserva os rascunhos ao navegar por teclado entre documentos e participantes", async () => {
    const user = userEvent.setup();
    render(<DisputeHost />);
    const file = new File(["ata"], "ata.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Arquivo da ata"), file);
    screen.getByRole("tab", { name: /Documentos/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Licitantes 2" })).toHaveFocus();
    await user.type(
      screen.getByLabelText("Fornecedor selecionado"),
      "Fornecedor escolhido",
    );
    await user.click(screen.getByRole("tab", { name: /Documentos/ }));
    expect(
      (screen.getByLabelText("Arquivo da ata") as HTMLInputElement).files?.[0],
    ).toBe(file);
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Lances 0" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByLabelText("Fornecedor selecionado")).toHaveValue(
      "Fornecedor escolhido",
    );
    expect(
      screen.getByRole("button", { name: "Avançar para julgamento" }),
    ).toBeDisabled();
  });

  it("retorna aos documentos quando a modalidade deixa de permitir lances", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DisputeHost />);
    await user.click(screen.getByRole("tab", { name: "Lances 0" }));
    rerender(<DisputeHost withBids={false} />);
    expect(
      screen.queryByRole("tab", { name: /Lances/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Documentos/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("list", { name: "Documentos da disputa" }),
    ).toBeVisible();
  });
});
