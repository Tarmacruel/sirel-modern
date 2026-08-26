import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AtaSessaoProcessingOverlay } from "./ata-sessao-processing-overlay";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.style.overflow = "";
});

describe("AtaSessaoProcessingOverlay", () => {
  it("bloqueia a tela e apresenta retorno visual imediato", () => {
    render(
      <AtaSessaoProcessingOverlay
        open
        context="preview"
        fileName="ATA DE SESSÃO.pdf"
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Processando ata de sessão",
    });
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Enviando o PDF da ata")).toBeInTheDocument();
    expect(screen.getByText(/ATA DE SESSÃO\.pdf/)).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("atualiza a etapa estimada e restaura a página ao concluir", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <AtaSessaoProcessingOverlay open context="reports" />,
    );

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByText("Conciliar valores")).toBeInTheDocument();
    const elapsedTime = screen.getByText("0:15");
    expect(elapsedTime).toBeInTheDocument();
    expect(elapsedTime.closest('[role="status"]')).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Conciliar valores");

    rerender(<AtaSessaoProcessingOverlay open={false} context="reports" />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("apresenta os dois arquivos e as etapas da conciliação avulsa", () => {
    render(
      <AtaSessaoProcessingOverlay
        open
        context="reports"
        fileName="ATA BLL.pdf"
        sdFileName="SD 123-2026.pdf"
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Processando Ata e SD" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ler Ata")).toBeInTheDocument();
    expect(screen.getByText("ATA BLL.pdf")).toBeInTheDocument();
    expect(screen.getByText("SD 123-2026.pdf")).toBeInTheDocument();
  });
});
