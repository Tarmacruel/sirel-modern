import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trpcMocks = vi.hoisted(() => ({
  processosUseQuery: vi.fn(),
  documentosUseQuery: vi.fn(),
  classificacoesUseQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
  trpcClient: {},
}));

vi.mock("@/lib/portal-publico-trpc", () => ({
  portalPublicoTrpc: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    portalPublico: {
      processos: { useQuery: trpcMocks.processosUseQuery },
      documentos: { useQuery: trpcMocks.documentosUseQuery },
      classificacoes: { useQuery: trpcMocks.classificacoesUseQuery },
    },
  },
  portalPublicoTrpcClient: {},
  portalPublicoQueryClient: {},
}));

import { shouldRenderPortalPublico } from "./App";
import { PortalPublicoApp } from "./portal-publico-app";

const publishedProcess = {
  numero: "SIREL-2026-001",
  edital: "PE 001/2026",
  objeto: "Aquisição de merenda escolar",
  dataPublicacao: "2026-09-01",
  secretaria: "Secretaria Municipal de Educação",
  modalidade: "Pregão Eletrônico",
};

const publicDocument = {
  titulo: "Edital de abertura",
  tipo: "EDITAL",
  categoria: "Licitação",
  versao: 1,
  dataReferencia: "2026-09-01",
  criadoEm: "2026-09-01T12:00:00.000Z",
  downloadUrl: "/api/publico/documentos/link-opaco/download",
};

function successfulQuery<T>(data: T) {
  return {
    data,
    isPending: false,
    isFetching: false,
    isError: false,
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.removeItem("sirel-transparencia-theme");
  trpcMocks.processosUseQuery.mockReset();
  trpcMocks.documentosUseQuery.mockReset();
  trpcMocks.classificacoesUseQuery.mockReset();
});

beforeEach(() => {
  trpcMocks.classificacoesUseQuery.mockReturnValue(successfulQuery([]));
});

describe("shouldRenderPortalPublico", () => {
  it("seleciona o portal apenas no hostname público e em aliases locais de desenvolvimento", () => {
    expect(
      shouldRenderPortalPublico("transparencia.sirel.com.br", {
        isDevelopment: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderPortalPublico("transparencia.sirel.com.br.", {
        isDevelopment: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderPortalPublico("transparencia.localhost", {
        isDevelopment: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderPortalPublico("transparencia.localhost", {
        isDevelopment: true,
      }),
    ).toBe(true);
    expect(
      shouldRenderPortalPublico("www.sirel.com.br", { isDevelopment: true }),
    ).toBe(false);
  });

  it("filtra os documentos aprovados por tipo e classificacao", async () => {
    const user = userEvent.setup();
    trpcMocks.processosUseQuery.mockReturnValue(
      successfulQuery({
        pagina: 1,
        limite: 12,
        total: 1,
        itens: [publishedProcess],
      }),
    );
    trpcMocks.classificacoesUseQuery.mockReturnValue(
      successfulQuery([{ codigo: "EDITAL", nome: "Edital" }]),
    );
    trpcMocks.documentosUseQuery.mockReturnValue(
      successfulQuery({ pagina: 1, limite: 50, total: 0, itens: [] }),
    );

    render(<PortalPublicoApp />);
    await user.click(
      screen.getByRole("button", {
        name: /Consultar documentos/,
      }),
    );
    await user.selectOptions(screen.getByLabelText("Tipo"), "EDITAL");
    await user.selectOptions(screen.getByLabelText(/Classifica/), "EDITAL");

    await waitFor(() => {
      expect(trpcMocks.documentosUseQuery).toHaveBeenLastCalledWith(
        {
          pagina: 1,
          limite: 50,
          numeroProcesso: publishedProcess.numero,
          tipo: "EDITAL",
          classificacao: "EDITAL",
        },
        expect.objectContaining({ enabled: true }),
      );
    });
  });
});

describe("PortalPublicoApp", () => {
  it("permite alternar entre modo claro e modo escuro sem afetar a consulta", async () => {
    const user = userEvent.setup();
    trpcMocks.processosUseQuery.mockReturnValue(
      successfulQuery({
        pagina: 1,
        limite: 12,
        total: 0,
        itens: [],
      }),
    );
    trpcMocks.documentosUseQuery.mockReturnValue(
      successfulQuery({ pagina: 1, limite: 50, total: 0, itens: [] }),
    );

    render(<PortalPublicoApp />);

    const portal = screen.getByTestId("portal-publico");
    expect(portal).toHaveAttribute("data-portal-theme", "light");

    await user.click(screen.getByRole("button", { name: "Escuro" }));
    expect(portal).toHaveAttribute("data-portal-theme", "dark");
    expect(window.localStorage.getItem("sirel-transparencia-theme")).toBe(
      "dark",
    );

    await user.click(screen.getByRole("button", { name: "Claro" }));
    expect(portal).toHaveAttribute("data-portal-theme", "light");
  });

  it("consulta somente os processos publicados e revela os documentos públicos selecionados", async () => {
    const user = userEvent.setup();
    trpcMocks.processosUseQuery.mockReturnValue(
      successfulQuery({
        pagina: 1,
        limite: 12,
        total: 1,
        itens: [publishedProcess],
      }),
    );
    trpcMocks.documentosUseQuery.mockImplementation(
      (input: { numeroProcesso: string }) =>
        successfulQuery(
          input.numeroProcesso === publishedProcess.numero
            ? { pagina: 1, limite: 50, total: 1, itens: [publicDocument] }
            : { pagina: 1, limite: 50, total: 0, itens: [] },
        ),
    );

    render(<PortalPublicoApp />);

    expect(
      screen.getByRole("heading", {
        name: "Processos e documentos publicados",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(publishedProcess.objeto)).toBeInTheDocument();
    expect(screen.queryByText("Entrar no SIREL")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: `Consultar documentos públicos do processo ${publishedProcess.numero}`,
      }),
    );

    expect(
      screen.getByRole("link", { name: new RegExp(publicDocument.titulo) }),
    ).toHaveAttribute("href", publicDocument.downloadUrl);
    expect(trpcMocks.documentosUseQuery).toHaveBeenLastCalledWith(
      { pagina: 1, limite: 50, numeroProcesso: publishedProcess.numero },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("envia a busca pública sem manter a seleção anterior", async () => {
    const user = userEvent.setup();
    trpcMocks.processosUseQuery.mockReturnValue(
      successfulQuery({
        pagina: 1,
        limite: 12,
        total: 0,
        itens: [],
      }),
    );
    trpcMocks.documentosUseQuery.mockReturnValue(
      successfulQuery({ pagina: 1, limite: 50, total: 0, itens: [] }),
    );

    render(<PortalPublicoApp />);

    await user.type(
      screen.getByRole("searchbox", {
        name: "Buscar por número SIREL, edital ou objeto",
      }),
      "merenda",
    );
    await user.click(screen.getByRole("button", { name: "Pesquisar" }));

    await waitFor(() => {
      expect(trpcMocks.processosUseQuery).toHaveBeenLastCalledWith(
        { pagina: 1, limite: 12, busca: "merenda" },
        expect.objectContaining({ staleTime: 30_000 }),
      );
    });
    expect(
      screen.getByText(
        "Nenhum processo publicado foi encontrado para esta busca.",
      ),
    ).toBeInTheDocument();
  });
});
