import { describe, expect, it, vi } from "vitest";
import {
  getProcessAuditJustification,
  saveProcessAuditJustification,
} from "../lib/licitacao-audit-justification.js";

function database(results: unknown[][]) {
  const values = vi.fn().mockResolvedValue(undefined);
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn(async () => results.shift() ?? []),
  };
  const select = vi.fn(() => chain);
  const db = { select, insert: vi.fn(() => ({ values })) };
  return {
    db: db as unknown as Parameters<typeof getProcessAuditJustification>[0],
    values,
    select,
  };
}

describe("justificativa permanente fora do fluxo", () => {
  it("recupera a justificativa salva sem depender do navegador", async () => {
    const { db, select } = database([
      [{ value: "Processo iniciado em meio fisico" }],
    ]);
    expect(await getProcessAuditJustification(db, 2567)).toBe(
      "Processo iniciado em meio fisico",
    );
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("recupera justificativas antigas da auditoria", async () => {
    const { db } = database([
      [],
      [
        {
          description:
            "Alteração fora do fluxo: Status ajustado | Justificativa: Cadastro retroativo | documento fisico",
        },
      ],
    ]);
    expect(await getProcessAuditJustification(db, 2567)).toBe(
      "Cadastro retroativo | documento fisico",
    );
  });

  it("nao inventa justificativa para um processo sem registro anterior", async () => {
    const { db } = database([[], []]);
    expect(await getProcessAuditJustification(db, 9)).toBeNull();
  });

  it("salva o texto com processo e autor", async () => {
    const { db, values } = database([[], []]);
    expect(
      await saveProcessAuditJustification(
        db,
        2567,
        "  Cadastro retroativo  ",
        7,
      ),
    ).toBe("Cadastro retroativo");
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        processoId: 2567,
        usuarioId: 7,
        observacao: "Cadastro retroativo",
      }),
    );
  });

  it("nao duplica o registro quando a justificativa e reutilizada", async () => {
    const { db, values } = database([[{ value: "Cadastro retroativo" }]]);
    await saveProcessAuditJustification(db, 2567, "Cadastro retroativo", 8);
    expect(values).not.toHaveBeenCalled();
  });

  it("preserva o historico ao corrigir a justificativa", async () => {
    const { db, values } = database([[{ value: "Texto anterior" }]]);
    await saveProcessAuditJustification(db, 2567, "Texto corrigido", 8);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ observacao: "Texto corrigido" }),
    );
  });

  it("rejeita justificativa vazia", async () => {
    const { db, values } = database([]);
    await expect(
      saveProcessAuditJustification(db, 2567, "   ", 7),
    ).rejects.toThrow(/justificativa/);
    expect(values).not.toHaveBeenCalled();
  });
});
