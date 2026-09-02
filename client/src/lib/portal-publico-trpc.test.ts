import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPortalPublico } from "./portal-publico-trpc";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPortalPublico", () => {
  it("omite credenciais mesmo quando uma opção anterior as informa", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPortalPublico("/api/trpc", {
      credentials: "include",
      headers: { "x-sirel-csrf": "nao-deve-ser-enviado" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trpc",
      expect.objectContaining({ credentials: "omit" }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).has("x-sirel-csrf")).toBe(false);
  });
});
