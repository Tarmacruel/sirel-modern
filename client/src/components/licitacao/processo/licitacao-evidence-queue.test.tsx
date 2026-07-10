import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LicitacaoEvidenceQueue } from "./licitacao-evidence-queue";
import type { LicitacaoEvidenceItem } from "./licitacao-evidence-row";
import type { LicitacaoEvidenceUploadState } from "./licitacao-evidence-editor";

const items: LicitacaoEvidenceItem[] = [
  {
    category: "ata-disputa",
    order: 20,
    label: "Ata da disputa",
    description: "Ata emitida pela plataforma.",
    obrigatorio: true,
    concluido: false,
    documentos: [],
  },
  {
    category: "julgamento",
    order: 10,
    label: "Julgamento",
    description: "Resultado do julgamento.",
    obrigatorio: true,
    concluido: false,
    documentos: [],
  },
  {
    category: "publicacao",
    order: 30,
    label: "Publicacao",
    description: "Comprovante de publicacao.",
    obrigatorio: true,
    concluido: true,
    documentos: [
      {
        id: 1,
        categoria: "publicacao",
        titulo: "Publicacao inicial",
        arquivoUrl: "/uploads/publicacao.pdf",
        criadoEm: "2026-07-01T12:00:00.000Z",
      },
    ],
  },
];

function EvidenceQueueHost() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [uploadStates, setUploadStates] = useState<
    Record<string, LicitacaoEvidenceUploadState | undefined>
  >({});

  return (
    <LicitacaoEvidenceQueue
      items={items}
      activeCategory={activeCategory}
      uploadStates={uploadStates}
      resolveDocumentUrl={(url) => url}
      onActiveCategoryChange={setActiveCategory}
      onTitleChange={(category, value) =>
        setUploadStates((current) => ({
          ...current,
          [category]: {
            ...(current[category] ?? { descricao: "", arquivo: null }),
            titulo: value,
          },
        }))
      }
      onDescriptionChange={(category, value) =>
        setUploadStates((current) => ({
          ...current,
          [category]: {
            ...(current[category] ?? { titulo: "", arquivo: null }),
            descricao: value,
          },
        }))
      }
      onFileSelect={vi.fn()}
      onUpload={vi.fn()}
    />
  );
}

describe("LicitacaoEvidenceQueue", () => {
  it("abre a proxima pendencia visivel e mantem somente um editor", async () => {
    const user = userEvent.setup();

    render(<EvidenceQueueHost />);

    await user.click(screen.getByRole("button", { name: "Concluidos 1" }));
    expect(screen.getByText("Publicacao")).toBeInTheDocument();
    expect(screen.queryByText("Ata da disputa")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Resolver proxima pendencia" }),
    );

    expect(screen.getByRole("button", { name: "Pendentes 2" })).toBeInTheDocument();
    expect(screen.getByText("Evidencia 1/3")).toBeInTheDocument();
    expect(screen.getAllByText(/^Evidencia \d\/3$/)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /Ata da disputa/ }));

    expect(screen.getByText("Evidencia 2/3")).toBeInTheDocument();
    expect(screen.getAllByText(/^Evidencia \d\/3$/)).toHaveLength(1);
  });
});
