import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import {
  situacaoAtual,
  situacaoLabels,
} from "@sirel/shared/licitacao-situacao";
import { requireDb } from "../db/client.js";
import { getCriticalStatusKind } from "./process-status-critical.js";

export async function assertProcessOperational(
  db: any,
  processoId: number,
  itemIds: number[] = [],
) {
  const result = await db.execute(
    sql`select situacao_procedimento,status_licitacao from licitacoes where processo_id=${processoId}`,
  );
  const row = result.rows[0];
  const current = situacaoAtual(
    row?.situacao_procedimento,
    row?.status_licitacao,
  );
  if (current !== "EM_ANDAMENTO")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Processo ${situacaoLabels[current] ?? current}. Solicite a retomada ou reabertura antes de alterar o andamento.`,
    });
  if (itemIds.length) {
    const closed = await db.execute(
      sql`select item_processo_id from itens_processo_valores where item_processo_id in (${sql.join(
        itemIds.map((id) => sql`${id}`),
        sql`,`,
      )}) and (resultado_licitacao is not null or item_fracassado or item_deserto)`,
    );
    if (closed.rows.length)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "O item está encerrado. Reabra-o antes de alterar propostas, lances ou contratação.",
      });
  }
}

// Shared by the public business endpoints, including alternate workflow routes.
export async function guardOperationalMutation(path: string, raw: unknown) {
  if (
    !/^(licitacao\.|workflow\.|planejamento\.|processos\.|contratos\.|cadastrosInstitucionais\.designacoes\.select)/.test(
      path,
    )
  )
    return;
  if (
    path.startsWith("licitacao.situacao.") ||
    /saveChecklist|saveAudit|generateDocumento|generatePcaDocumento/.test(path)
  )
    return;
  const input = (raw ?? {}) as Record<string, any>;
  const positive = (value: unknown): value is number =>
    Number.isInteger(value) && Number(value) > 0;
  const db = requireDb();
  let processoId = positive(input.processoId) ? input.processoId : null;
  let itemId =
    positive(input.itemId) && !path.startsWith("contratos.")
      ? input.itemId
      : null;
  const query = async (q: any) => (await db.execute(q)).rows[0] as any;
  if (positive(input.statusId)) {
    const selectedStatus = await query(
      sql`select codigo,nome from status_processo where id=${input.statusId}`,
    );
    const kind = getCriticalStatusKind(selectedStatus);
    if (kind && kind !== "HOMOLOGACAO")
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Registre essa situação em Licitação > Definir situação, com data e justificativa.",
      });
  }
  if (positive(input.propostaId)) {
    const p = await query(
      sql`select i.processo_id,p.item_id from propostas_licitacao p join itens_processo i on i.id=p.item_id where p.id=${input.propostaId}`,
    );
    processoId = p?.processo_id ?? processoId;
    itemId = p?.item_id ?? itemId;
  } else if (positive(input.licitanteId)) {
    const p = await query(
      sql`select l.processo_id from licitantes b join licitacoes l on l.id=b.licitacao_id where b.id=${input.licitanteId}`,
    );
    processoId = p?.processo_id ?? processoId;
  }
  if (!itemId && path === "planejamento.deleteItem" && positive(input.id))
    itemId = input.id;
  if (itemId)
    processoId =
      (
        await query(
          sql`select processo_id from itens_processo where id=${itemId}`,
        )
      )?.processo_id ?? processoId;
  if (!processoId && path.startsWith("processos.") && positive(input.id))
    processoId = input.id;
  if (!processoId && positive(input.contratoId))
    processoId = (
      await query(
        sql`select processo_id from contratos where id=${input.contratoId}`,
      )
    )?.processo_id;
  const affectedIds = [
    itemId,
    positive(input.itemId) ? input.itemId : null,
  ].filter((id): id is number => !!id);
  if (processoId) await assertProcessOperational(db, processoId, affectedIds);
  if (
    path === "licitacao.advanceStage" &&
    ["FRACASSADA", "CANCELADA"].includes(input.statusLicitacao)
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Use Definir situação, com data e justificativa.",
    });
}
