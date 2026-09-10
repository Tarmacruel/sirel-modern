import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LicitacaoPreparationWorkspace, type PreparationWorkspaceItem } from "./licitacao-preparation-workspace";

const items: PreparationWorkspaceItem[] = [
  { category: "reserva", label: "Reserva orçamentária", concluido: true, statusLabel: "Anexado" },
  { category: "autorizacao", label: "Autorização", concluido: false, statusLabel: "A anexar" },
  { category: "pesquisa", label: "Pesquisa de preços", concluido: false, statusLabel: "A anexar" },
  { category: "autoridade", label: "Autoridade competente", concluido: true, statusLabel: "Definida", institutional: true },
  { category: "agente", label: "Agente de contratação", concluido: false, statusLabel: "A definir", institutional: true },
];

afterEach(cleanup);

function WorkspaceHost({ onAdvance = vi.fn(), canAdvance = false }: { onAdvance?: () => void; canAdvance?: boolean }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  return <LicitacaoPreparationWorkspace
    items={items}
    activeCategory={activeCategory}
    onSelectCategory={setActiveCategory}
    editor={<><h3>Editor de {activeCategory}</h3><label>Arquivo do requisito<input type="file" /></label></>}
    itemsContent={<label>Solicitação de despesa<input type="file" /></label>}
    configurationContent={<label>Observação da configuração<input /></label>}
    canAdvance={canAdvance}
    advanceHint="Conclua os requisitos para publicar."
    onAdvance={onAdvance}
  />;
}

describe("LicitacaoPreparationWorkspace", () => {
  it("organiza todos os documentos em uma lista e separa os responsáveis", async () => {
    const user = userEvent.setup();
    render(<WorkspaceHost />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "5");
    const documentList = screen.getByRole("list", { name: "Documentos da preparação" });
    expect(within(documentList).getAllByRole("button")).toHaveLength(3);
    expect(within(documentList).getByRole("button", { name: /Autorização/ })).toHaveAttribute("aria-current", "true");
    expect(within(documentList).queryByText("Autoridade competente")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Responsáveis" }));
    const peopleList = screen.getByRole("list", { name: "Responsáveis da preparação" });
    expect(within(peopleList).getAllByRole("button")).toHaveLength(2);
    expect(within(peopleList).getByRole("button", { name: /Agente de contratação/ })).toHaveAttribute("aria-current", "true");

    await user.click(screen.getByRole("tab", { name: /Documentos/ }));
    await user.click(screen.getByRole("button", { name: "Concluídos" }));
    expect(screen.getByRole("button", { name: /Reserva orçamentária/ })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("button", { name: /Pesquisa de preços/ })).not.toBeInTheDocument();
  });

  it("preserva arquivos ao alternar abas e não reutiliza o input entre documentos", async () => {
    const user = userEvent.setup();
    render(<WorkspaceHost />);

    const evidenceFile = new File(["autorizacao"], "autorizacao.pdf", { type: "application/pdf" });
    const evidenceInput = screen.getByLabelText("Arquivo do requisito") as HTMLInputElement;
    await user.upload(evidenceInput, evidenceFile);

    await user.click(screen.getByRole("tab", { name: "Itens" }));
    const sdFile = new File(["sd"], "sd.pdf", { type: "application/pdf" });
    const sdInput = screen.getByLabelText("Solicitação de despesa") as HTMLInputElement;
    await user.upload(sdInput, sdFile);
    await user.click(screen.getByRole("tab", { name: "Configuração" }));
    await user.type(screen.getByLabelText("Observação da configuração"), "Observação preservada");

    await user.click(screen.getByRole("tab", { name: /Documentos/ }));
    expect(screen.getByLabelText("Arquivo do requisito")).toBe(evidenceInput);
    expect(evidenceInput.files?.[0]).toBe(evidenceFile);
    await user.click(screen.getByRole("button", { name: /Pesquisa de preços/ }));
    const otherInput = screen.getByLabelText("Arquivo do requisito") as HTMLInputElement;
    expect(otherInput).not.toBe(evidenceInput);
    expect(otherInput.files).toHaveLength(0);

    await user.click(screen.getByRole("tab", { name: "Itens" }));
    expect(screen.getByLabelText("Solicitação de despesa")).toBe(sdInput);
    expect(sdInput.files?.[0]).toBe(sdFile);
    await user.click(screen.getByRole("tab", { name: "Configuração" }));
    expect(screen.getByLabelText("Observação da configuração")).toHaveValue("Observação preservada");
  });

  it("oferece navegação das abas por teclado e respeita o bloqueio de avanço", async () => {
    const user = userEvent.setup();
    const onAdvance = vi.fn();
    const { rerender } = render(<WorkspaceHost onAdvance={onAdvance} />);
    const documentsTab = screen.getByRole("tab", { name: /Documentos/ });
    documentsTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Itens" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Itens" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Configuração" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(documentsTab).toHaveFocus();

    const advance = screen.getByRole("button", { name: "Avançar para publicação" });
    expect(advance).toBeDisabled();
    expect(advance).toHaveAccessibleDescription("Conclua os requisitos para publicar.");
    await user.click(advance);
    expect(onAdvance).not.toHaveBeenCalled();
    rerender(<WorkspaceHost onAdvance={onAdvance} canAdvance />);
    await user.click(advance);
    expect(onAdvance).toHaveBeenCalledOnce();
  });
});
