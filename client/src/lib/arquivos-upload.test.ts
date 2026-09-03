import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadArquivo } from "./arquivos-upload";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("uploadArquivo", () => {
  it("envia a pasta atual e o arquivo com a sessão autenticada", async () => {
    const responsePayload = {
      success: true,
      name: "edital.pdf",
      relativePath: "2026/edital.pdf",
      size: 3,
      modifiedAt: "2026-09-03T12:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => responsePayload,
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["pdf"], "edital.pdf", { type: "application/pdf" });
    const result = await uploadArquivo({ path: "2026", arquivo: file });

    expect(result).toEqual(responsePayload);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/arquivos\/upload$/);
    expect(request.method).toBe("POST");
    expect(request.credentials).toBe("include");

    const formData = request.body as FormData;
    expect(formData.get("path")).toBe("2026");
    expect(formData.get("arquivo")).toBe(file);
  });
});
