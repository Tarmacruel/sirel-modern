import { auditoriaLog } from "./schema.js";
import type { AppContext } from "../_core/context.js";
import { requireDb } from "./client.js";
import { sanitizeAuditData } from "../lib/audit-data.js";

interface AuditEntry {
  tabela: string;
  registroId: number;
  acao: "CREATE" | "UPDATE" | "DELETE";
  dadosAnteriores?: unknown;
  dadosNovos?: unknown;
  descricao?: string;
}

export async function logAuditoria(ctx: AppContext, payload: AuditEntry) {
  const db = requireDb();
  await db.insert(auditoriaLog).values({
    usuarioId: ctx.user?.id ?? null,
    tabela: payload.tabela,
    registroId: payload.registroId,
    acao: payload.acao,
    dadosAnteriores: sanitizeAuditData(payload.dadosAnteriores ?? null),
    dadosNovos: sanitizeAuditData(payload.dadosNovos ?? null),
    descricao: payload.descricao ?? null
  });
}

