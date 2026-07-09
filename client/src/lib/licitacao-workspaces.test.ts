import { describe, expect, it } from "vitest";

import {
  buildLicitacaoWorkspaceHref,
  getLicitacaoWorkspaceModalidadeGrupo,
  getLicitacaoWorkspaceUnsupportedMessage,
  isLicitacaoWorkspaceFilterSupported,
  resolveLicitacaoWorkspaceRoute,
} from "@/lib/licitacao-workspaces";

describe("licitacao workspaces", () => {
  it("mantem /licitacao como hub por padrao", () => {
    const state = resolveLicitacaoWorkspaceRoute("");

    expect(state.showHub).toBe(true);
    expect(state.workspace).toBeNull();
  });

  it("resolve workspace por query string", () => {
    const state = resolveLicitacaoWorkspaceRoute("?hub=0&workspace=dispensas");

    expect(state.showHub).toBe(false);
    expect(state.workspace?.key).toBe("dispensas");
    expect(getLicitacaoWorkspaceModalidadeGrupo(state.workspace)).toBe(
      "DISPENSA",
    );
  });

  it("permite abrir a consulta geral diretamente por workspace=todos", () => {
    const state = resolveLicitacaoWorkspaceRoute("?workspace=todos");

    expect(state.showHub).toBe(false);
    expect(state.workspace?.key).toBe("todos");
    expect(
      getLicitacaoWorkspaceModalidadeGrupo(state.workspace),
    ).toBeUndefined();
  });

  it("mapeia modalidades operacionais para modalidadeGrupo", () => {
    const expected = {
      credenciamentos: "CREDENCIAMENTO",
      dispensas: "DISPENSA",
      inexigibilidades: "INEXIGIBILIDADE",
      pregoes: "PREGAO",
      concorrencias: "CONCORRENCIA",
    } as const;

    for (const [workspaceKey, modalidadeGrupo] of Object.entries(expected)) {
      const state = resolveLicitacaoWorkspaceRoute(
        `?hub=0&workspace=${workspaceKey}`,
      );

      expect(getLicitacaoWorkspaceModalidadeGrupo(state.workspace)).toBe(
        modalidadeGrupo,
      );
    }
  });

  it("isola atas e adesoes como filtro ainda nao suportado", () => {
    const state = resolveLicitacaoWorkspaceRoute(
      "?hub=0&workspace=atas-adesoes",
    );

    expect(state.workspace?.key).toBe("atas-adesoes");
    expect(isLicitacaoWorkspaceFilterSupported(state.workspace)).toBe(false);
    expect(getLicitacaoWorkspaceUnsupportedMessage(state.workspace)).toContain(
      "classificacao propria",
    );
  });

  it("gera href recomendado para abrir fila filtrada", () => {
    expect(buildLicitacaoWorkspaceHref("pregoes")).toBe(
      "/licitacao?hub=0&workspace=pregoes",
    );
  });
});
