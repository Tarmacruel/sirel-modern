import { describe, expect, it } from "vitest";
import { reconcileFormDraft } from "./reconcile-form-draft";

describe("reconcileFormDraft", () => {
  it("preserva datas, links e campos apagados durante uma atualização de documentos", () => {
    const previous = {
      date: "",
      link: "https://pncp.gov.br/old",
      note: "Original",
      conductor: "1",
    };
    const current = {
      date: "2026-09-15",
      link: "https://pncp.gov.br/new",
      note: "",
      conductor: "1",
    };
    const incoming = { ...previous, conductor: "2" };
    expect(reconcileFormDraft(current, incoming, previous)).toEqual({
      ...current,
      conductor: "2",
    });
    expect(previous.conductor).toBe("1");
  });

  it("carrega o novo processo sem reaproveitar o rascunho do anterior", () => {
    expect(
      reconcileFormDraft({ date: "2026-09-15" }, { date: "2026-10-01" }),
    ).toEqual({ date: "2026-10-01" });
  });

  it("recebe atualizações do servidor depois que o rascunho foi salvo", () => {
    const saved = { date: "2026-09-15" };
    expect(reconcileFormDraft(saved, { date: "2026-09-16" }, saved)).toEqual({
      date: "2026-09-16",
    });
  });
});
