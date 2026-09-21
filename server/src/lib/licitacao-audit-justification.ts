import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { requireDb } from "../db/client.js";
import {
  auditoriaLog,
  licitacoes,
  movimentacoesWorkflow,
} from "../db/schema.js";

type AuditDb = Pick<ReturnType<typeof requireDb>, "select" | "insert">;
const registration = "Justificativa permanente de processo fora do fluxo";
const legacyMarker = " | Justificativa: ";

export async function getProcessAuditJustification(
  db: AuditDb,
  processoId: number,
) {
  const [saved] = await db
    .select({ value: movimentacoesWorkflow.observacao })
    .from(movimentacoesWorkflow)
    .where(
      and(
        eq(movimentacoesWorkflow.processoId, processoId),
        eq(movimentacoesWorkflow.descricao, registration),
      ),
    )
    .orderBy(desc(movimentacoesWorkflow.id))
    .limit(1);
  if (saved?.value?.trim()) return saved.value.trim();

  // Recover the original justification from existing detailed audit records.
  // Checklist exceptions have their own reasons and must not become process reasons.
  const [legacy] = await db
    .select({ description: auditoriaLog.descricao })
    .from(auditoriaLog)
    .where(
      and(
        or(
          and(
            eq(auditoriaLog.tabela, "processos"),
            eq(auditoriaLog.registroId, processoId),
          ),
          and(
            eq(auditoriaLog.tabela, "licitacoes"),
            inArray(
              auditoriaLog.registroId,
              db
                .select({ id: licitacoes.id })
                .from(licitacoes)
                .where(eq(licitacoes.processoId, processoId)),
            ),
          ),
        ),
        or(
          ...["Configuração", "Publicação", "Alteração", "Homologação"].map(
            (prefix) =>
              ilike(
                auditoriaLog.descricao,
                `${prefix} fora do fluxo:%${legacyMarker}%`,
              ),
          ),
        ),
      ),
    )
    .orderBy(asc(auditoriaLog.id))
    .limit(1);
  const description = legacy?.description ?? "";
  const markerIndex = description.indexOf(legacyMarker);
  return markerIndex < 0
    ? null
    : description.slice(markerIndex + legacyMarker.length).trim() || null;
}

export async function saveProcessAuditJustification(
  db: AuditDb,
  processoId: number,
  value: string,
  usuarioId: number | null,
) {
  const justification = value.trim();
  if (!justification) throw new Error("Informe a justificativa de auditoria.");
  const current = await getProcessAuditJustification(db, processoId);
  if (current === justification) return justification;
  await db.insert(movimentacoesWorkflow).values({
    processoId,
    moduloOrigem: "LICITACAO",
    moduloDestino: "LICITACAO",
    descricao: registration,
    observacao: justification,
    usuarioId,
  });
  return justification;
}
