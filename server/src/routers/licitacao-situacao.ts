import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  decisaoInput,
  situacaoProcessoInput,
  resultadoItensInput,
  reabrirItensInput,
  situacaoAtual,
  situacaoLabels,
  validarResultado,
  type DecisaoLicitacao,
} from "@sirel/shared/licitacao-situacao";
import { requireDb } from "../db/client.js";
import { router, operadorProcedure, gestorProcedure, protectedProcedure } from "../trpc.js";

type Db = ReturnType<typeof requireDb>;
const fail = (message: string): never => {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message });
};
async function rows(db: any, query: any): Promise<any[]> {
  return (await db.execute(query)).rows;
}
async function base(db: any, id: number, lock = false) {
  if (lock) await db.execute(sql`select id from processos where id=${id} for update`);
  const [p] = await rows(
    db,
    sql`select p.id, p.status_id, p.data_encerramento, p.homologado, l.id as licitacao_id, l.status_licitacao, l.situacao_procedimento from processos p left join licitacoes l on l.processo_id=p.id where p.id=${id}`,
  );
  if (!p)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Processo não encontrado.",
    });
  return p;
}
async function items(db: any, id: number) {
  return rows(
    db,
    sql`select i.id, i.numero_item as "numeroItem", i.descricao, coalesce(v.resultado_licitacao, case when v.item_fracassado then 'FRACASSADO' when v.item_deserto then 'DESERTO' end) as resultado, v.resultado_decisao as decisao, (v.item_homologado or v.fornecedor_vencedor_id is not null or nullif(trim(v.fornecedor_vencedor_nome),'') is not null) as homologado from itens_processo i left join itens_processo_valores v on v.item_processo_id=i.id where i.processo_id=${id} order by i.numero_item`,
  );
}
async function evidence(db: any, input: z.infer<typeof decisaoInput>) {
  if (
    input.documentoId &&
    !(
      await rows(
        db,
        sql`select id from documentos where id=${input.documentoId} and processo_id=${input.processoId}`,
      )
    ).length
  )
    fail("O documento deve pertencer ao processo.");
}
async function history(
  db: any,
  processoId: number,
  acao: string,
  ids: number[],
  decisao: any,
  anterior: any,
  userId: number,
) {
  await db.execute(
    sql`insert into licitacao_decisoes(processo_id, acao, item_ids, decisao, anterior, usuario_id) values (${processoId},${acao},${JSON.stringify(ids)}::jsonb,${JSON.stringify(decisao)}::jsonb,${JSON.stringify(anterior)}::jsonb,${userId})`,
  );
  const description = `${acao}: ${situacaoLabels[decisao.situacao] ?? "Em andamento"}${ids.length ? ` (${ids.length} item(ns))` : ""}`;
  await db.execute(
    sql`insert into movimentacoes_workflow(processo_id, modulo_destino, descricao, observacao, usuario_id) values (${processoId},'LICITACAO',${description},${decisao.justificativa},${userId})`,
  );
  await db.execute(
    sql`insert into auditoria_log(usuario_id,tabela,registro_id,acao,dados_anteriores,dados_novos,descricao) values (${userId},'processos',${processoId},'UPDATE',${JSON.stringify(anterior)}::jsonb,${JSON.stringify({ ...decisao, itemIds: ids })}::jsonb,${description})`,
  );
}
async function validateItems(
  db: any,
  processo: any,
  selected: any[],
  resultado: string,
) {
  if (
    processo.homologado ||
    (
      await rows(
        db,
        sql`select id from contratos where processo_id=${processo.id} limit 1`,
      )
    ).length
  )
    fail(
      "O processo já possui homologação ou contratação. O encerramento não pode substituir esses registros.",
    );
  for (const item of selected) {
    const proposals = await rows(
      db,
      sql`select case when b.status_habilitacao='INABILITADO' and p.situacao <> 'VENCEDORA' then 'INABILITADA' else p.situacao::text end as situacao, p.classificacao from propostas_licitacao p join licitantes b on b.id=p.licitante_id where p.item_id=${item.id}`,
    );
    const error = validarResultado(resultado, proposals, item.homologado);
    if (error) fail(`Item ${item.numeroItem}: ${error}`);
  }
}
async function writeItems(
  db: any,
  selected: any[],
  decisao: DecisaoLicitacao | null,
) {
  for (const item of selected)
    await db.execute(sql`insert into itens_processo_valores(item_processo_id,resultado_licitacao,resultado_decisao,item_fracassado,item_deserto,motivo_fracasso,origem_alteracao)
    values (${item.id},${decisao?.situacao ?? null},${JSON.stringify(decisao)}::jsonb,${decisao?.situacao === "FRACASSADO"},${decisao?.situacao === "DESERTO"},${decisao?.justificativa ?? null},'DECISAO_LICITACAO')
    on conflict(item_processo_id) do update set resultado_licitacao=excluded.resultado_licitacao,resultado_decisao=excluded.resultado_decisao,item_fracassado=excluded.item_fracassado,item_deserto=excluded.item_deserto,motivo_fracasso=excluded.motivo_fracasso,origem_alteracao=excluded.origem_alteracao,atualizado_em=now()`);
}
export const licitacaoSituacaoRouter = router({
  get: protectedProcedure
    .input(z.object({ processoId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = requireDb(),
        p = await base(db, input.processoId);
      const itens = await items(db, input.processoId);
      const propostas = await rows(
        db,
        sql`select p.item_id as "itemId", case when b.status_habilitacao='INABILITADO' and p.situacao <> 'VENCEDORA' then 'INABILITADA' else p.situacao::text end as situacao, p.classificacao from propostas_licitacao p join licitantes b on b.id=p.licitante_id join itens_processo i on i.id=p.item_id where i.processo_id=${input.processoId}`,
      );
      const sugestao =
        itens.length &&
        itens.every(
          (item) =>
            !validarResultado(
              "FRACASSADO",
              propostas.filter((p) => p.itemId === item.id),
              item.homologado,
            ),
        )
          ? "FRACASSADO"
          : null;
      return {
        situacao: situacaoAtual(p.situacao_procedimento, p.status_licitacao),
        decisao: p.situacao_procedimento as DecisaoLicitacao | null,
        itens: itens as {
          id: number;
          numeroItem: number;
          descricao: string;
          resultado: string | null;
          decisao: DecisaoLicitacao | null;
        }[],
        sugestao,
        todosEncerrados: itens.length > 0 && itens.every((i) => i.resultado),
        historico: await rows(
          db,
          sql`select d.*, u.name as usuario from licitacao_decisoes d left join users u on u.id=d.usuario_id where processo_id=${input.processoId} order by d.id desc`,
        ),
      };
    }),
  registrarProcesso: operadorProcedure
    .input(situacaoProcessoInput)
    .mutation(async ({ input, ctx }) =>
      requireDb().transaction(async (tx) => {
        const p = await base(tx, input.processoId, true);
        if (
          situacaoAtual(p.situacao_procedimento, p.status_licitacao) !==
          "EM_ANDAMENTO"
        )
          fail(
            "Retome ou reabra o processo antes de registrar outra situação.",
          );
        await evidence(tx, input);
        const all = await items(tx, input.processoId),
          selected = all.filter((i) => !i.resultado);
        if (input.situacao !== "SUSPENSO") {
          if (!all.length) fail("O processo não possui itens para encerrar.");
          await validateItems(tx, p, selected, input.situacao);
          if (
            input.situacao === "DESERTO" &&
            all.some((i) => i.resultado && i.resultado !== "DESERTO")
          )
            fail("Há itens com resultado diferente de deserto.");
          if (
            input.situacao === "FRACASSADO" &&
            !selected.length &&
            !all.some((i) => i.resultado === "FRACASSADO")
          )
            fail("Não há item fracassado para justificar o fracasso global.");
        }
        const [workflow] = await rows(
          tx,
          sql`select * from workflow_processo where processo_id=${input.processoId}`,
        );
        const decisao: DecisaoLicitacao = {
          ...input,
          usuarioId: ctx.user!.id,
          anterior: {
            statusId: p.status_id,
            dataEncerramento: p.data_encerramento,
            fase: p.status_licitacao ?? "PREPARACAO",
            workflow: workflow ?? null,
          },
        };
        await tx.execute(
          sql`insert into licitacoes(processo_id,status_licitacao,situacao_procedimento) values (${input.processoId},'PREPARACAO',${JSON.stringify(decisao)}::jsonb) on conflict(processo_id) do update set situacao_procedimento=excluded.situacao_procedimento,atualizado_em=now()`,
        );
        await tx.execute(
          sql`insert into status_processo(codigo,nome,ativo) values (${input.situacao},${situacaoLabels[input.situacao]},true) on conflict(codigo) do nothing`,
        );
        await tx.execute(
          sql`update processos set status_id=(select id from status_processo where codigo=${input.situacao}),data_encerramento=${input.situacao === "SUSPENSO" ? p.data_encerramento : input.data},atualizado_em=now() where id=${input.processoId}`,
        );
        await tx.execute(
          sql`update workflow_processo set situacao=${input.situacao === "SUSPENSO" ? "SUSPENSO" : "CONCLUIDO"}::workflow_situacao, etapa_atual=${`Licitação / ${situacaoLabels[input.situacao]}`},data_conclusao=${input.situacao === "SUSPENSO" ? null : input.data},atualizado_em=now() where processo_id=${input.processoId}`,
        );
        if (input.situacao !== "SUSPENSO")
          await writeItems(tx, selected, decisao);
        await history(
          tx,
          input.processoId,
          "SITUACAO_PROCESSO",
          selected.map((i) => i.id),
          decisao,
          { processo: p, itens: all },
          ctx.user!.id,
        );
        return { success: true };
      }),
    ),
  registrarItens: operadorProcedure
    .input(resultadoItensInput)
    .mutation(async ({ input, ctx }) =>
      requireDb().transaction(async (tx) => {
        const p = await base(tx, input.processoId, true);
        if (
          situacaoAtual(p.situacao_procedimento, p.status_licitacao) !==
          "EM_ANDAMENTO"
        )
          fail("Reabra ou retome o processo antes de alterar seus itens.");
        await evidence(tx, input);
        const all = await items(tx, input.processoId),
          selected = all.filter((i) => input.itemIds.includes(i.id));
        if (selected.length !== input.itemIds.length)
          fail("Selecione somente itens deste processo.");
        if (selected.some((i) => i.resultado))
          fail("Reabra os itens encerrados antes de alterar o resultado.");
        await validateItems(tx, p, selected, input.resultado);
        const decisao = {
          ...input,
          situacao: input.resultado,
          usuarioId: ctx.user!.id,
        };
        await writeItems(tx, selected, decisao);
        await history(
          tx,
          input.processoId,
          "RESULTADO_ITENS",
          input.itemIds,
          decisao,
          selected,
          ctx.user!.id,
        );
        return { success: true };
      }),
    ),
  reabrirProcesso: gestorProcedure
    .input(decisaoInput)
    .mutation(async ({ input, ctx }) =>
      requireDb().transaction(async (tx) => {
        const p = await base(tx, input.processoId, true),
          atual = situacaoAtual(p.situacao_procedimento, p.status_licitacao);
        if (atual === "EM_ANDAMENTO") fail("O processo já está em andamento.");
        await evidence(tx, input);
        const anterior = (p.situacao_procedimento as DecisaoLicitacao | null)
          ?.anterior;
        // Legacy cancellations have no saved phase: resume at preparation without inventing a reason.
        const fase =
          anterior?.fase && !["FRACASSADA", "CANCELADA"].includes(anterior.fase)
            ? anterior.fase
            : "PREPARACAO";
        const decisao = {
          ...input,
          situacao: "EM_ANDAMENTO",
          usuarioId: ctx.user!.id,
        };
        await tx.execute(
          sql`update licitacoes set situacao_procedimento=${JSON.stringify(decisao)}::jsonb,status_licitacao=${fase}::licitacao_status,atualizado_em=now() where processo_id=${input.processoId}`,
        );
        await tx.execute(
          sql`insert into status_processo(codigo,nome,ativo) values ('EM_ANDAMENTO','Em andamento',true) on conflict(codigo) do nothing`,
        );
        await tx.execute(
          sql`update processos set status_id=${anterior?.statusId ?? null},data_encerramento=${anterior?.dataEncerramento ?? null},atualizado_em=now() where id=${input.processoId}`,
        );
        if (!anterior?.statusId)
          await tx.execute(
            sql`update processos set status_id=(select id from status_processo where codigo='EM_ANDAMENTO') where id=${input.processoId}`,
          );
        await tx.execute(
          sql`update workflow_processo set situacao=${anterior?.workflow?.situacao ?? "EM_ANDAMENTO"}::workflow_situacao,etapa_atual=${anterior?.workflow?.etapa_atual ?? `Licitação / ${fase}`}, data_conclusao=${anterior?.workflow?.data_conclusao ?? null}, atualizado_em=now() where processo_id=${input.processoId}`,
        );
        await history(
          tx,
          input.processoId,
          atual === "SUSPENSO" ? "RETOMADA" : "REABERTURA",
          [],
          decisao,
          p,
          ctx.user!.id,
        );
        return { success: true };
      }),
    ),
  reabrirItens: gestorProcedure
    .input(reabrirItensInput)
    .mutation(async ({ input, ctx }) =>
      requireDb().transaction(async (tx) => {
        const p = await base(tx, input.processoId, true);
        if (
          situacaoAtual(p.situacao_procedimento, p.status_licitacao) !==
          "EM_ANDAMENTO"
        )
          fail("Reabra o processo primeiro.");
        await evidence(tx, input);
        const selected = (await items(tx, input.processoId)).filter((i) =>
          input.itemIds.includes(i.id),
        );
        if (
          selected.length !== input.itemIds.length ||
          selected.some((i) => !i.resultado)
        )
          fail("Selecione somente itens encerrados deste processo.");
        await writeItems(tx, selected, null);
        await history(
          tx,
          input.processoId,
          "REABERTURA_ITENS",
          input.itemIds,
          { ...input, situacao: "EM_ANDAMENTO" },
          selected,
          ctx.user!.id,
        );
        return { success: true };
      }),
    ),
});
