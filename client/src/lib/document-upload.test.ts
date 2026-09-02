import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isPdfFile,
  processAtaSessaoDocumento,
  uploadProcessoDocumento,
} from "./document-upload";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("processAtaSessaoDocumento", () => {
  it("envia a Ata e a SD nos campos multipart esperados", async () => {
    const responsePayload = {
      sourceFile: "tmp/ata.pdf",
      outputDir: "tmp/output",
      generatedAt: "2026-08-12T12:00:00.000Z",
      originalFileName: "ATA BLL.pdf",
      originalSdFileName: "SD 123-2026.pdf",
      estimatedValueReconciliation: null,
      summary: {
        totalLotes: 0,
        emAndamento: 0,
        adjudicados: 0,
        faseRecursal: 0,
        malsucedidos: 0,
        warnings: 0,
        parsingErrors: 0,
      },
      artifacts: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => responsePayload,
    });
    vi.stubGlobal("fetch", fetchMock);

    const ata = new File(["ata"], "ATA BLL.pdf", {
      type: "application/pdf",
    });
    const sd = new File(["sd"], "SD 123-2026.pdf", {
      type: "application/pdf",
    });

    const result = await processAtaSessaoDocumento(ata, sd, {
      edital: "PE 42/2026",
    });

    expect(result).toEqual(responsePayload);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/relatorios\/ata-sessao\/processar$/);
    expect(request.method).toBe("POST");
    expect(request.body).toBeInstanceOf(FormData);

    const formData = request.body as FormData;
    expect(formData.get("arquivo")).toBe(ata);
    expect(formData.get("sdArquivo")).toBe(sd);
    expect(formData.get("edital")).toBe("PE 42/2026");
  });
});

describe("isPdfFile", () => {
  it.each(["", "application/octet-stream", "application/pdf"])(
    "aceita PDF por extensão com MIME %s",
    (type) => {
      expect(isPdfFile(new File(["pdf"], "documento.PDF", { type }))).toBe(
        true,
      );
    },
  );

  it("rejeita extensão ou MIME incompatível", () => {
    expect(
      isPdfFile(
        new File(["pdf"], "documento.txt", { type: "application/pdf" }),
      ),
    ).toBe(false);
    expect(
      isPdfFile(new File(["texto"], "documento.pdf", { type: "text/plain" })),
    ).toBe(false);
  });
});

describe("uploadProcessoDocumento", () => {
  it("envia a classificacao e a linhagem sem flags de acesso no multipart", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 42,
        processoId: 7,
        titulo: "Documento de teste",
        categoria: null,
        tipo: "OUTRO",
        arquivoUrl: "/api/planejamento/documentos/42/download",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await uploadProcessoDocumento({
      processoId: 7,
      documentoAnteriorId: 41,
      tipo: "OUTRO",
      classificacaoId: 3,
      titulo: "Documento de teste",
      palavrasChave: ["rascunho"],
      arquivo: new File(["conteúdo"], "teste.pdf", {
        type: "application/pdf",
      }),
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const formData = request.body as FormData;
    expect(formData.get("processoId")).toBe("7");
    expect(formData.get("documentoAnteriorId")).toBe("41");
    expect(formData.get("classificacaoId")).toBe("3");
    expect(formData.get("publico")).toBeNull();
    expect(formData.get("restritoA")).toBeNull();
  });
});
