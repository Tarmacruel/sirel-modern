import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LicitacaoProcessHeader } from "./licitacao-process-header";
import type { LicitacaoProcessHeaderModel } from "@/lib/licitacao-processo-view-model";

const model: LicitacaoProcessHeaderModel = {
  numero: "0140/2026",
  modalidade: "Dispensa Simplificada",
  secretaria: "Secretaria de Administração",
  responsavel: "Responsável de teste",
  currentPhaseLabel: "Preparação",
  pendingLabel: "8 pendências abertas",
  checklistProgressLabel: "4/12 concluídos",
  documentsLabel: "1 documento",
  isForaDoFluxo: true,
};

describe("cabecalho compacto do processo", () => {
  afterEach(cleanup);
  it("preserva as acoes do processo no disclosure e fecha apos selecionar", () => {
    const documents = vi.fn();
    render(<LicitacaoProcessHeader compact model={model} onOpenDossie={vi.fn()} onOpenDocumentos={documents}
      onOpenHistory={vi.fn()} onBackToQueue={vi.fn()} auditAction={<button>Auditoria registrada</button>} />);
    expect(screen.getByRole("heading", { name: "0140/2026" })).toBeInTheDocument();
    expect(screen.queryByText(model.pendingLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Todos os documentos" })).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Mais ações" });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Auditoria registrada" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Todos os documentos" }));
    expect(documents).toHaveBeenCalledOnce();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("fecha as acoes com Escape e devolve foco ao botao", () => {
    render(<LicitacaoProcessHeader compact model={model} onOpenDossie={vi.fn()} onOpenDocumentos={vi.fn()}
      onOpenHistory={vi.fn()} onBackToQueue={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: "Mais ações" });
    fireEvent.click(toggle);
    const history = screen.getByRole("button", { name: "Histórico" });
    history.focus();
    fireEvent.keyDown(history, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });
});
